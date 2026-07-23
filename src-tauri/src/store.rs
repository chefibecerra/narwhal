use std::fs;

use serde::{de::DeserializeOwned, Serialize};
use tauri::{AppHandle, Manager};

/// Lectura/escritura de colecciones JSON en app_data_dir con permisos 0600.
/// Aquí no viven secretos: contraseñas y passphrases solo existen en memoria.
pub fn read_collection<T: DeserializeOwned>(
    app: &AppHandle,
    file: &str,
) -> Result<Vec<T>, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = dir.join(file);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

pub fn write_collection<T: Serialize>(
    app: &AppHandle,
    file: &str,
    items: &[T],
) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(file);
    let raw = serde_json::to_string_pretty(items).map_err(|e| e.to_string())?;
    fs::write(&path, raw).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
    }
    Ok(())
}
