use std::path::PathBuf;
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;

use russh::client;
use russh::keys::{load_secret_key, ssh_key, PrivateKeyWithHashAlg};
use tauri::AppHandle;

use crate::hosts::HostConfig;

pub struct ClientHandler {
    app: AppHandle,
    /// "hostname:puerto" para buscar en known_hosts
    host_key: String,
    /// motivo del rechazo, para construir un error legible tras el fallo
    rejection: Arc<StdMutex<Option<String>>>,
}

impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        use crate::known_hosts::{verify_and_store, Verification};

        match verify_and_store(&self.app, &self.host_key, server_public_key) {
            Ok(Verification::Trusted) => Ok(true),
            Ok(Verification::Mismatch { stored, presented }) => {
                *self.rejection.lock().unwrap() = Some(format!(
                    "La clave del servidor cambió. Guardada: {stored} · Recibida: {presented}. \
                     Si el cambio es legítimo, edita el servidor y vuelve a conectar."
                ));
                Ok(false)
            }
            Err(e) => {
                *self.rejection.lock().unwrap() =
                    Some(format!("No se pudo verificar la clave del servidor: {e}"));
                Ok(false)
            }
        }
    }
}

fn expand_tilde(path: &str) -> PathBuf {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = std::env::var_os("HOME") {
            return PathBuf::from(home).join(rest);
        }
    }
    PathBuf::from(path)
}

async fn keyboard_interactive(
    handle: &mut client::Handle<ClientHandler>,
    username: &str,
    password: &str,
) -> Result<bool, String> {
    use russh::client::KeyboardInteractiveAuthResponse as Kia;

    let mut response = handle
        .authenticate_keyboard_interactive_start(username, None)
        .await
        .map_err(|e| e.to_string())?;
    loop {
        match response {
            Kia::Success => return Ok(true),
            Kia::Failure { .. } => return Ok(false),
            Kia::InfoRequest { prompts, .. } => {
                // A cada prompt se responde con la contraseña del host.
                let answers = prompts.iter().map(|_| password.to_string()).collect();
                response = handle
                    .authenticate_keyboard_interactive_respond(answers)
                    .await
                    .map_err(|e| e.to_string())?;
            }
        }
    }
}

async fn authenticate_key(
    handle: &mut client::Handle<ClientHandler>,
    username: &str,
    key: russh::keys::PrivateKey,
) -> Result<bool, String> {
    let best_hash = handle
        .best_supported_rsa_hash()
        .await
        .map_err(|e| e.to_string())?
        .flatten();
    handle
        .authenticate_publickey(
            username,
            PrivateKeyWithHashAlg::new(Arc::new(key), best_hash),
        )
        .await
        .map_err(|e| e.to_string())
        .map(|r| r.success())
}

/// Sin clave configurada ni contraseña: se prueban las claves por defecto
/// sin passphrase, como haría OpenSSH.
async fn try_default_keys(
    handle: &mut client::Handle<ClientHandler>,
    username: &str,
) -> Result<bool, String> {
    let Some(home) = std::env::var_os("HOME") else {
        return Ok(false);
    };
    for name in ["id_ed25519", "id_rsa", "id_ecdsa"] {
        let path = PathBuf::from(&home).join(".ssh").join(name);
        if !path.exists() {
            continue;
        }
        let Ok(key) = load_secret_key(&path, None) else {
            continue;
        };
        if authenticate_key(handle, username, key).await? {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Conexión + autenticación + verificación TOFU.
///
/// `secret` es la passphrase si el host tiene clave configurada, o la
/// contraseña SSH si no. Los errores con prefijo "passphrase:" o "auth:"
/// le indican a la UI que debe pedir credenciales.
pub async fn connect(
    app: &AppHandle,
    cfg: &HostConfig,
    secret: Option<String>,
) -> Result<client::Handle<ClientHandler>, String> {
    let config = Arc::new(client::Config {
        keepalive_interval: Some(Duration::from_secs(15)),
        ..Default::default()
    });
    let rejection = Arc::new(StdMutex::new(None::<String>));
    let handler = ClientHandler {
        app: app.clone(),
        host_key: format!("{}:{}", cfg.hostname, cfg.port),
        rejection: rejection.clone(),
    };

    let connecting = client::connect(config, (cfg.hostname.as_str(), cfg.port), handler);
    let mut handle = match tokio::time::timeout(Duration::from_secs(15), connecting).await {
        Err(_) => {
            return Err(format!(
                "no se pudo conectar con {}: tiempo de espera agotado",
                cfg.name
            ))
        }
        Ok(Ok(handle)) => handle,
        Ok(Err(e)) => {
            return Err(rejection
                .lock()
                .unwrap()
                .take()
                .unwrap_or_else(|| format!("conexión fallida a {}: {e}", cfg.name)))
        }
    };

    use crate::hosts::AuthKind;

    let authenticated = match cfg.auth_kind {
        AuthKind::Password => match &secret {
            Some(password) => {
                let direct = handle
                    .authenticate_password(&cfg.username, password)
                    .await
                    .map_err(|e| e.to_string())?
                    .success();
                if direct {
                    true
                } else {
                    keyboard_interactive(&mut handle, &cfg.username, password).await?
                }
            }
            None => return Err("auth: este servidor usa contraseña".into()),
        },
        AuthKind::Key => match (&cfg.key_path, &secret) {
            (Some(key_path), passphrase) => {
                let key = load_secret_key(expand_tilde(key_path), passphrase.as_deref())
                    .map_err(|e| format!("passphrase: no se pudo cargar la clave: {e}"))?;
                authenticate_key(&mut handle, &cfg.username, key).await?
            }
            (None, _) => try_default_keys(&mut handle, &cfg.username).await?,
        },
    };

    if !authenticated {
        return Err(match cfg.auth_kind {
            AuthKind::Password => format!(
                "auth: contraseña rechazada (usuario {}; distingue mayúsculas)",
                cfg.username
            ),
            AuthKind::Key if cfg.key_path.is_some() => format!(
                "auth: el servidor rechazó la clave (usuario {}; distingue mayúsculas)",
                cfg.username
            ),
            AuthKind::Key => "auth: ninguna clave por defecto funcionó".to_string(),
        });
    }
    Ok(handle)
}
