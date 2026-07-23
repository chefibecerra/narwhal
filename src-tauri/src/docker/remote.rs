use bollard::{Docker, API_DEFAULT_VERSION};
use tauri::AppHandle;

use super::host::BollardHost;
use super::tunnel::SocketTunnel;
use super::Result;
use crate::hosts::HostConfig;

const DEFAULT_REMOTE_SOCKET: &str = "/var/run/docker.sock";

/// SSH + túnel del socket + bollard sobre el túnel. El resultado es un
/// DockerHost indistinguible del local para el resto de la app.
pub async fn connect(
    app: &AppHandle,
    cfg: &HostConfig,
    secret: Option<String>,
) -> Result<BollardHost> {
    let handle = crate::ssh::connect(app, cfg, secret).await?;

    let remote_socket = cfg
        .socket_path
        .clone()
        .unwrap_or_else(|| DEFAULT_REMOTE_SOCKET.into());
    let tunnel = SocketTunnel::open(handle, remote_socket, &cfg.id).await?;

    let docker = Docker::connect_with_unix(
        &tunnel.local_path.to_string_lossy(),
        30,
        API_DEFAULT_VERSION,
    )
    .map_err(|e| e.to_string())?;

    Ok(BollardHost::with_tunnel(docker, tunnel))
}
