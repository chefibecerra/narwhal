use std::path::PathBuf;
use std::sync::Arc;

use russh::{client, Disconnect};

use crate::ssh::ClientHandler;

/// Reenvía un socket unix local hacia el socket de Docker del servidor por
/// canales direct-streamlocal — el equivalente a
/// `ssh -L local.sock:/var/run/docker.sock`, sin agente ni puertos abiertos.
pub struct SocketTunnel {
    pub local_path: PathBuf,
    handle: Arc<client::Handle<ClientHandler>>,
    accept_task: tauri::async_runtime::JoinHandle<()>,
}

impl SocketTunnel {
    /// La sesión SSH del túnel, para abrir canales exec (compose, etc.)
    pub fn session(&self) -> Arc<client::Handle<ClientHandler>> {
        self.handle.clone()
    }

    pub async fn open(
        handle: client::Handle<ClientHandler>,
        remote_socket: String,
        id: &str,
    ) -> Result<Self, String> {
        let handle = Arc::new(handle);
        let local_path = std::env::temp_dir().join(format!("narwhal-{id}.sock"));
        // restos de una conexión anterior al mismo host
        let _ = std::fs::remove_file(&local_path);

        let listener = tokio::net::UnixListener::bind(&local_path)
            .map_err(|e| format!("no se pudo crear el socket local: {e}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(
                &local_path,
                std::fs::Permissions::from_mode(0o600),
            );
        }

        let conn = handle.clone();
        let accept_task = tauri::async_runtime::spawn(async move {
            loop {
                let Ok((mut local, _)) = listener.accept().await else {
                    break;
                };
                let conn = conn.clone();
                let remote = remote_socket.clone();
                tauri::async_runtime::spawn(async move {
                    if let Ok(channel) = conn.channel_open_direct_streamlocal(remote).await {
                        let mut stream = channel.into_stream();
                        let _ = tokio::io::copy_bidirectional(&mut local, &mut stream).await;
                    }
                });
            }
        });

        Ok(Self {
            local_path,
            handle,
            accept_task,
        })
    }
}

impl Drop for SocketTunnel {
    fn drop(&mut self) {
        self.accept_task.abort();
        let _ = std::fs::remove_file(&self.local_path);
        let conn = self.handle.clone();
        tauri::async_runtime::spawn(async move {
            let _ = conn.disconnect(Disconnect::ByApplication, "", "").await;
        });
    }
}
