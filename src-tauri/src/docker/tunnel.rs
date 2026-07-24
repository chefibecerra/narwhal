use std::sync::Arc;

use russh::{client, Disconnect};

use crate::ssh::ClientHandler;

/// Dirección local donde bollard encuentra el túnel.
pub enum DockerAddr {
    /// socket unix con permisos 0600 (macOS / Linux)
    #[cfg(unix)]
    Unix(std::path::PathBuf),
    /// loopback TCP en puerto efímero (Windows no tiene sockets unix)
    #[cfg(not(unix))]
    Tcp(u16),
}

/// Reenvía un endpoint local hacia el socket de Docker del servidor por
/// canales direct-streamlocal — el equivalente a
/// `ssh -L local:/var/run/docker.sock`, sin agente ni puertos abiertos.
pub struct SocketTunnel {
    pub addr: DockerAddr,
    handle: Arc<client::Handle<ClientHandler>>,
    accept_task: tauri::async_runtime::JoinHandle<()>,
}

impl SocketTunnel {
    /// La sesión SSH del túnel, para abrir canales exec (compose, etc.)
    pub fn session(&self) -> Arc<client::Handle<ClientHandler>> {
        self.handle.clone()
    }

    #[cfg(unix)]
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
            addr: DockerAddr::Unix(local_path),
            handle,
            accept_task,
        })
    }

    #[cfg(not(unix))]
    pub async fn open(
        handle: client::Handle<ClientHandler>,
        remote_socket: String,
        _id: &str,
    ) -> Result<Self, String> {
        let handle = Arc::new(handle);
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
            .await
            .map_err(|e| format!("no se pudo crear el listener local: {e}"))?;
        let port = listener
            .local_addr()
            .map_err(|e| e.to_string())?
            .port();

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
            addr: DockerAddr::Tcp(port),
            handle,
            accept_task,
        })
    }
}

impl Drop for SocketTunnel {
    fn drop(&mut self) {
        self.accept_task.abort();
        #[cfg(unix)]
        {
            // en unix el enum solo tiene esta variante: let irrefutable
            let DockerAddr::Unix(path) = &self.addr;
            let _ = std::fs::remove_file(path);
        }
        let conn = self.handle.clone();
        tauri::async_runtime::spawn(async move {
            let _ = conn.disconnect(Disconnect::ByApplication, "", "").await;
        });
    }
}
