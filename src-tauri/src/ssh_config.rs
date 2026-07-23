use std::fs;
use std::path::PathBuf;

use serde::Serialize;

/// Entrada utilizable de ~/.ssh/config (se ignoran patrones con comodines).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConfigHost {
    pub alias: String,
    pub hostname: String,
    pub user: Option<String>,
    pub port: u16,
    pub identity_file: Option<String>,
}

#[derive(Default)]
struct Block {
    aliases: Vec<String>,
    hostname: Option<String>,
    user: Option<String>,
    port: Option<u16>,
    identity_file: Option<String>,
}

fn flush(block: Block, out: &mut Vec<SshConfigHost>) {
    for alias in block.aliases {
        out.push(SshConfigHost {
            hostname: block.hostname.clone().unwrap_or_else(|| alias.clone()),
            user: block.user.clone(),
            port: block.port.unwrap_or(22),
            identity_file: block.identity_file.clone(),
            alias,
        });
    }
}

#[tauri::command]
pub fn read_ssh_config() -> Result<Vec<SshConfigHost>, String> {
    let Some(home) = std::env::var_os("HOME") else {
        return Ok(Vec::new());
    };
    let path = PathBuf::from(home).join(".ssh/config");
    let Ok(raw) = fs::read_to_string(&path) else {
        return Ok(Vec::new());
    };
    Ok(parse_config(&raw))
}

/// Parser puro del formato de ~/.ssh/config. Aislado del disco para poder
/// testearlo directamente sobre el mismo código que corre en producción.
fn parse_config(raw: &str) -> Vec<SshConfigHost> {
    let mut out = Vec::new();
    let mut current = Block::default();

    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let mut parts = line.split_whitespace();
        let Some(keyword) = parts.next() else { continue };
        let value: Vec<&str> = parts.collect();
        if value.is_empty() {
            continue;
        }

        match keyword.to_ascii_lowercase().as_str() {
            "host" => {
                flush(std::mem::take(&mut current), &mut out);
                // los patrones con comodines no son hosts concretos
                current.aliases = value
                    .iter()
                    .filter(|a| !a.contains('*') && !a.contains('?') && !a.starts_with('!'))
                    .map(|a| a.to_string())
                    .collect();
            }
            "hostname" => current.hostname = Some(value[0].to_string()),
            "user" => current.user = Some(value[0].to_string()),
            "port" => current.port = value[0].parse().ok(),
            "identityfile" => current.identity_file = Some(value[0].to_string()),
            _ => {}
        }
    }
    flush(current, &mut out);
    out
}

#[cfg(test)]
mod tests {
    use super::parse_config as parse;

    #[test]
    fn parsea_un_host_completo() {
        let hosts = parse(
            "Host prod\n  HostName 10.0.0.1\n  User deploy\n  Port 2222\n  IdentityFile ~/.ssh/prod",
        );
        assert_eq!(hosts.len(), 1);
        assert_eq!(hosts[0].alias, "prod");
        assert_eq!(hosts[0].hostname, "10.0.0.1");
        assert_eq!(hosts[0].user.as_deref(), Some("deploy"));
        assert_eq!(hosts[0].port, 2222);
        assert_eq!(hosts[0].identity_file.as_deref(), Some("~/.ssh/prod"));
    }

    #[test]
    fn ignora_patrones_con_comodines() {
        // "Host *" no es un host concreto y no debe aparecer
        let hosts = parse("Host *\n  User root\n\nHost real\n  HostName 1.2.3.4");
        assert_eq!(hosts.len(), 1);
        assert_eq!(hosts[0].alias, "real");
    }

    #[test]
    fn el_puerto_por_defecto_es_22() {
        let hosts = parse("Host x\n  HostName h");
        assert_eq!(hosts[0].port, 22);
    }

    #[test]
    fn varios_alias_en_una_linea_generan_varias_entradas() {
        let hosts = parse("Host a b\n  HostName h");
        assert_eq!(hosts.len(), 2);
    }

    #[test]
    fn sin_hostname_usa_el_alias() {
        let hosts = parse("Host solo-alias\n  User u");
        assert_eq!(hosts[0].hostname, "solo-alias");
    }
}
