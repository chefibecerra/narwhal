use std::sync::Arc;

use russh::{client, ChannelMsg};

use super::{LogChunk, LogSink, Result};
use crate::ssh::ClientHandler;

/// Nombre de proyecto compose: minúsculas, dígitos, guiones y guion bajo.
pub fn sanitize_project(name: &str) -> Result<String> {
    let name = name.trim().to_lowercase();
    if name.is_empty()
        || !name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
    {
        return Err(
            "Nombre de proyecto inválido: usa minúsculas, números, '-' o '_'".into(),
        );
    }
    Ok(name)
}

/// `docker compose` v2 con fallback al binario clásico `docker-compose`.
fn compose_script(file: &str, project: &str) -> String {
    format!(
        "if docker compose version >/dev/null 2>&1; then \
           docker compose -f '{file}' -p '{project}' up -d --remove-orphans 2>&1; \
         else \
           docker-compose -f '{file}' -p '{project}' up -d --remove-orphans 2>&1; \
         fi"
    )
}

/// Acción sobre un proyecto ya desplegado; compose v2 lo resuelve por labels.
fn action_script(project: &str, action: &str) -> String {
    format!(
        "if docker compose version >/dev/null 2>&1; then \
           docker compose -p '{project}' {action} 2>&1; \
         else \
           docker-compose -p '{project}' {action} 2>&1; \
         fi"
    )
}

fn emit_lines(on_output: &LogSink, raw: &[u8]) {
    for line in String::from_utf8_lossy(raw).lines() {
        on_output(LogChunk {
            line: line.to_string(),
            stream: "stdout".into(),
        });
    }
}

pub async fn up_local(project: &str, yaml: &str, on_output: &LogSink) -> Result<()> {
    let path = std::env::temp_dir().join(format!("narwhal-compose-{project}.yml"));
    std::fs::write(&path, yaml).map_err(|e| e.to_string())?;
    run_local(&compose_script(&path.display().to_string(), project), on_output).await
}

pub async fn action_local(project: &str, action: &str, on_output: &LogSink) -> Result<()> {
    run_local(&action_script(project, action), on_output).await
}

pub async fn action_remote(
    session: &Arc<client::Handle<ClientHandler>>,
    project: &str,
    action: &str,
    on_output: &LogSink,
) -> Result<()> {
    run_remote(session, &action_script(project, action), on_output).await
}

async fn run_local(script: &str, on_output: &LogSink) -> Result<()> {
    let mut child = tokio::process::Command::new("sh")
        .arg("-c")
        .arg(&script)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("no se pudo ejecutar docker compose: {e}"))?;

    use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
    let stdout = child.stdout.take().expect("stdout piped");
    let mut lines = BufReader::new(stdout).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        on_output(LogChunk {
            line,
            stream: "stdout".into(),
        });
    }

    let mut stderr_buf = String::new();
    if let Some(mut stderr) = child.stderr.take() {
        let _ = stderr.read_to_string(&mut stderr_buf).await;
    }
    let status = child.wait().await.map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(if stderr_buf.trim().is_empty() {
            format!("docker compose terminó con error ({status})")
        } else {
            stderr_buf.trim().to_string()
        });
    }
    Ok(())
}

pub async fn up_remote(
    session: &Arc<client::Handle<ClientHandler>>,
    project: &str,
    yaml: &str,
    on_output: &LogSink,
) -> Result<()> {
    let remote_path = format!(".narwhal/compose-{project}.yml");

    // 1) subir el YAML: `cat > archivo` leyendo de stdin hasta EOF
    let mut channel = session
        .channel_open_session()
        .await
        .map_err(|e| e.to_string())?;
    channel
        .exec(true, format!("mkdir -p .narwhal && cat > '{remote_path}'"))
        .await
        .map_err(|e| e.to_string())?;
    channel
        .data(yaml.as_bytes())
        .await
        .map_err(|e| e.to_string())?;
    channel.eof().await.map_err(|e| e.to_string())?;

    let mut code = 0u32;
    while let Some(msg) = channel.wait().await {
        if let ChannelMsg::ExitStatus { exit_status } = msg {
            code = exit_status;
        }
    }
    if code != 0 {
        return Err("no se pudo subir el compose al servidor".into());
    }

    // 2) ejecutarlo streameando la salida
    run_remote(session, &compose_script(&remote_path, project), on_output).await
}

async fn run_remote(
    session: &Arc<client::Handle<ClientHandler>>,
    script: &str,
    on_output: &LogSink,
) -> Result<()> {
    let mut channel = session
        .channel_open_session()
        .await
        .map_err(|e| e.to_string())?;
    channel
        .exec(true, script)
        .await
        .map_err(|e| e.to_string())?;

    let mut code = 0u32;
    while let Some(msg) = channel.wait().await {
        match msg {
            ChannelMsg::Data { data } => emit_lines(on_output, &data),
            ChannelMsg::ExtendedData { data, .. } => emit_lines(on_output, &data),
            ChannelMsg::ExitStatus { exit_status } => code = exit_status,
            _ => {}
        }
    }
    if code != 0 {
        return Err(format!("docker compose terminó con código {code}"));
    }
    Ok(())
}
