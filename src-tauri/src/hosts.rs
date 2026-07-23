use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::commands::DockerState;
use crate::store::{read_collection, write_collection};

const FILE: &str = "hosts.json";

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AuthKind {
    /// clave concreta (key_path) o las por defecto de ~/.ssh si es None
    #[default]
    Key,
    /// la contraseña se pide al conectar; jamás se guarda
    Password,
}

/// Config de un servidor remoto. SIN secretos: la contraseña o la passphrase
/// se piden al conectar y solo viven en memoria durante la conexión.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostConfig {
    pub id: String,
    pub name: String,
    pub hostname: String,
    pub port: u16,
    pub username: String,
    #[serde(default)]
    pub auth_kind: AuthKind,
    /// ruta a la clave privada; None = probar claves por defecto
    #[serde(default)]
    pub key_path: Option<String>,
    /// socket de docker en el servidor; None = /var/run/docker.sock
    #[serde(default)]
    pub socket_path: Option<String>,
}

pub fn get(app: &AppHandle, id: &str) -> Result<HostConfig, String> {
    read_collection::<HostConfig>(app, FILE)?
        .into_iter()
        .find(|h| h.id == id)
        .ok_or_else(|| "El servidor ya no existe".into())
}

#[tauri::command]
pub fn hosts_list(app: AppHandle) -> Result<Vec<HostConfig>, String> {
    read_collection(&app, FILE)
}

#[tauri::command]
pub async fn host_save(
    app: AppHandle,
    state: State<'_, DockerState>,
    mut host: HostConfig,
) -> Result<HostConfig, String> {
    if host.id.is_empty() {
        host.id = uuid::Uuid::new_v4().to_string();
    } else {
        // config nueva = conexión y secreto viejos ya no valen
        crate::commands::evict(&state, &host.id).await;
    }
    let mut hosts: Vec<HostConfig> = read_collection(&app, FILE)?;
    match hosts.iter_mut().find(|h| h.id == host.id) {
        Some(existing) => *existing = host.clone(),
        None => hosts.push(host.clone()),
    }
    write_collection(&app, FILE, &hosts)?;
    Ok(host)
}

#[tauri::command]
pub async fn host_delete(
    app: AppHandle,
    state: State<'_, DockerState>,
    id: String,
) -> Result<(), String> {
    crate::commands::evict(&state, &id).await;
    let mut hosts: Vec<HostConfig> = read_collection(&app, FILE)?;
    hosts.retain(|h| h.id != id);
    write_collection(&app, FILE, &hosts)
}
