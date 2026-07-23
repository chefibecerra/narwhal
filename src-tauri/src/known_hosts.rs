use std::time::{SystemTime, UNIX_EPOCH};

use russh::keys::ssh_key::{HashAlg, PublicKey};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::store::{read_collection, write_collection};

const FILE: &str = "known_hosts.json";

/// Igual que OpenSSH: las claves públicas de servidores no son secretas,
/// viven en JSON plano.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownHost {
    /// "hostname:puerto"
    pub host: String,
    /// clave pública completa en formato OpenSSH
    pub key: String,
    /// huella SHA256, como la muestra ssh
    pub fingerprint: String,
    pub added_at: u64,
}

pub enum Verification {
    Trusted,
    Mismatch { stored: String, presented: String },
}

/// Decisión TOFU pura (sin disco): compara la clave presentada con lo guardado.
enum Decision {
    /// coincide con la registrada
    Trusted,
    /// primera vez: hay que registrarla
    New,
    /// la clave cambió respecto a la registrada
    Mismatch { stored_fp: String },
}

fn decide(known: &[KnownHost], host: &str, presented_key: &str) -> Decision {
    match known.iter().find(|k| k.host == host) {
        Some(entry) if entry.key == presented_key => Decision::Trusted,
        Some(entry) => Decision::Mismatch {
            stored_fp: entry.fingerprint.clone(),
        },
        None => Decision::New,
    }
}

pub fn verify_and_store(
    app: &AppHandle,
    host: &str,
    key: &PublicKey,
) -> Result<Verification, String> {
    let presented_key = key.to_openssh().map_err(|e| e.to_string())?;
    let presented_fp = key.fingerprint(HashAlg::Sha256).to_string();

    let mut known: Vec<KnownHost> = read_collection(app, FILE)?;
    match decide(&known, host, &presented_key) {
        Decision::Trusted => Ok(Verification::Trusted),
        Decision::Mismatch { stored_fp } => Ok(Verification::Mismatch {
            stored: stored_fp,
            presented: presented_fp,
        }),
        Decision::New => {
            // Primera conexión: se confía y se registra (TOFU).
            known.push(KnownHost {
                host: host.to_string(),
                key: presented_key,
                fingerprint: presented_fp,
                added_at: SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0),
            });
            write_collection(app, FILE, &known)?;
            Ok(Verification::Trusted)
        }
    }
}

#[tauri::command]
pub fn list_known_hosts(app: AppHandle) -> Result<Vec<KnownHost>, String> {
    read_collection(&app, FILE)
}

#[tauri::command]
pub fn forget_known_host(app: AppHandle, host: String) -> Result<(), String> {
    let mut known: Vec<KnownHost> = read_collection(&app, FILE)?;
    known.retain(|k| k.host != host);
    write_collection(&app, FILE, &known)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(host: &str, key: &str) -> KnownHost {
        KnownHost {
            host: host.into(),
            key: key.into(),
            fingerprint: format!("SHA256:{key}"),
            added_at: 0,
        }
    }

    #[test]
    fn servidor_nuevo_se_marca_para_registrar() {
        assert!(matches!(decide(&[], "srv:22", "ssh-ed25519 AAAA"), Decision::New));
    }

    #[test]
    fn misma_clave_es_de_confianza() {
        let known = vec![entry("srv:22", "ssh-ed25519 AAAA")];
        assert!(matches!(
            decide(&known, "srv:22", "ssh-ed25519 AAAA"),
            Decision::Trusted
        ));
    }

    #[test]
    fn clave_cambiada_es_mismatch_con_huella_guardada() {
        let known = vec![entry("srv:22", "ssh-ed25519 ORIGINAL")];
        match decide(&known, "srv:22", "ssh-ed25519 ATACANTE") {
            Decision::Mismatch { stored_fp } => {
                assert_eq!(stored_fp, "SHA256:ssh-ed25519 ORIGINAL");
            }
            _ => panic!("una clave distinta DEBE ser mismatch (posible MITM)"),
        }
    }

    #[test]
    fn el_puerto_distingue_hosts() {
        let known = vec![entry("srv:22", "ssh-ed25519 AAAA")];
        // mismo hostname, otro puerto = otro host, aún no registrado
        assert!(matches!(decide(&known, "srv:2222", "ssh-ed25519 BBBB"), Decision::New));
    }
}
