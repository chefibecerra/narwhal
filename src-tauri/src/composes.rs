use std::fs;

use tauri::{AppHandle, Manager};

/// Biblioteca local de composes desplegados: app_data_dir/composes/{proyecto}.yml.
/// Se guardan en ESTA máquina, sea cual sea el host donde se desplegaron.
fn dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("composes");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
pub fn compose_saved_list(app: AppHandle) -> Result<Vec<String>, String> {
    let mut names: Vec<String> = fs::read_dir(dir(&app)?)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| {
            let name = entry.ok()?.file_name().into_string().ok()?;
            name.strip_suffix(".yml").map(String::from)
        })
        .collect();
    names.sort();
    Ok(names)
}

#[tauri::command]
pub fn compose_saved_read(app: AppHandle, project: String) -> Result<String, String> {
    let project = crate::docker::compose::sanitize_project(&project)?;
    fs::read_to_string(dir(&app)?.join(format!("{project}.yml"))).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn compose_saved_save(app: AppHandle, project: String, yaml: String) -> Result<(), String> {
    let project = crate::docker::compose::sanitize_project(&project)?;
    fs::write(dir(&app)?.join(format!("{project}.yml")), yaml).map_err(|e| e.to_string())
}
