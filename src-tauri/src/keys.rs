use std::fs;
use std::path::PathBuf;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct SshKey {
    pub name: String,
    pub path: String,
}

const IGNORED: &[&str] = &[
    "known_hosts",
    "known_hosts.old",
    "authorized_keys",
    "config",
    "environment",
];

fn looks_like_private_key(path: &PathBuf) -> bool {
    // Los primeros bytes alcanzan: los formatos OpenSSH y PEM empiezan igual.
    match fs::read(path) {
        Ok(bytes) => bytes.starts_with(b"-----BEGIN"),
        Err(_) => false,
    }
}

/// Claves privadas detectadas en ~/.ssh, al estilo del Keychain de Termius.
#[tauri::command]
pub fn list_ssh_keys() -> Result<Vec<SshKey>, String> {
    let Some(home) = std::env::var_os("HOME") else {
        return Ok(Vec::new());
    };
    let ssh_dir = PathBuf::from(home).join(".ssh");
    let Ok(entries) = fs::read_dir(&ssh_dir) else {
        return Ok(Vec::new());
    };

    let mut keys = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if name.ends_with(".pub") || IGNORED.contains(&name) || name.starts_with('.') {
            continue;
        }
        if looks_like_private_key(&path) {
            keys.push(SshKey {
                name: name.to_string(),
                path: format!("~/.ssh/{name}"),
            });
        }
    }
    keys.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(keys)
}
