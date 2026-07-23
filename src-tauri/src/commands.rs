use std::collections::HashMap;
use std::sync::Arc;

use tauri::ipc::Channel;
use tauri::{AppHandle, State};
use tokio::sync::Mutex;

use crate::docker::host::BollardHost;
use crate::docker::{ContainerInfo, ContainerStats, DockerHost, DockerInfo, LogChunk};

#[derive(Default)]
pub struct DockerState {
    host: Mutex<Option<Arc<dyn DockerHost>>>,
    log_streams: Mutex<HashMap<String, tauri::async_runtime::JoinHandle<()>>>,
}

async fn host(state: &DockerState) -> Result<Arc<dyn DockerHost>, String> {
    state
        .host
        .lock()
        .await
        .clone()
        .ok_or_else(|| "Sin conexión con Docker".to_string())
}

/// Al cambiar de host los streams de logs del anterior quedan huérfanos:
/// se cortan todos antes de instalar la conexión nueva.
async fn install_host(state: &DockerState, new_host: Arc<dyn DockerHost>) {
    for (_, task) in state.log_streams.lock().await.drain() {
        task.abort();
    }
    *state.host.lock().await = Some(new_host);
}

#[tauri::command]
pub async fn docker_connect_local(state: State<'_, DockerState>) -> Result<DockerInfo, String> {
    let local = BollardHost::local()?;
    // valida que el demonio responde antes de dar la conexión por buena
    let info = local.info().await?;
    install_host(&state, Arc::new(local)).await;
    Ok(info)
}

#[tauri::command]
pub async fn docker_connect_remote(
    app: AppHandle,
    state: State<'_, DockerState>,
    host_id: String,
    secret: Option<String>,
) -> Result<DockerInfo, String> {
    let cfg = crate::hosts::get(&app, &host_id)?;
    let remote = crate::docker::remote::connect(&app, &cfg, secret).await?;
    let info = remote.info().await?;
    install_host(&state, Arc::new(remote)).await;
    Ok(info)
}

#[tauri::command]
pub async fn docker_list_containers(
    state: State<'_, DockerState>,
) -> Result<Vec<ContainerInfo>, String> {
    host(&state).await?.list_containers().await
}

#[tauri::command]
pub async fn docker_start(state: State<'_, DockerState>, id: String) -> Result<(), String> {
    host(&state).await?.start(&id).await
}

#[tauri::command]
pub async fn docker_stop(state: State<'_, DockerState>, id: String) -> Result<(), String> {
    host(&state).await?.stop(&id).await
}

#[tauri::command]
pub async fn docker_restart(state: State<'_, DockerState>, id: String) -> Result<(), String> {
    host(&state).await?.restart(&id).await
}

#[tauri::command]
pub async fn docker_remove(
    state: State<'_, DockerState>,
    id: String,
    force: bool,
) -> Result<(), String> {
    host(&state).await?.remove(&id, force).await
}

#[tauri::command]
pub async fn docker_logs_start(
    state: State<'_, DockerState>,
    id: String,
    tail: u32,
    on_chunk: Channel<LogChunk>,
) -> Result<(), String> {
    let h = host(&state).await?;

    // un stream por contenedor: si ya había uno abierto, se corta primero
    let mut streams = state.log_streams.lock().await;
    if let Some(prev) = streams.remove(&id) {
        prev.abort();
    }

    let container_id = id.clone();
    let task = tauri::async_runtime::spawn(async move {
        let _ = h
            .logs(
                &container_id,
                tail,
                Box::new(move |chunk| {
                    let _ = on_chunk.send(chunk);
                }),
            )
            .await;
    });
    streams.insert(id, task);
    Ok(())
}

#[tauri::command]
pub async fn docker_logs_stop(state: State<'_, DockerState>, id: String) -> Result<(), String> {
    if let Some(task) = state.log_streams.lock().await.remove(&id) {
        task.abort();
    }
    Ok(())
}

#[tauri::command]
pub async fn docker_stats_start(
    state: State<'_, DockerState>,
    id: String,
    on_stats: Channel<ContainerStats>,
) -> Result<(), String> {
    let h = host(&state).await?;

    // clave con prefijo: convive con los streams de logs en el mismo mapa
    // y se corta igual que ellos al cambiar de host
    let key = format!("stats:{id}");
    let mut streams = state.log_streams.lock().await;
    if let Some(prev) = streams.remove(&key) {
        prev.abort();
    }

    let container_id = id.clone();
    let task = tauri::async_runtime::spawn(async move {
        let _ = h
            .stats(
                &container_id,
                Box::new(move |stats| {
                    let _ = on_stats.send(stats);
                }),
            )
            .await;
    });
    streams.insert(key, task);
    Ok(())
}

#[tauri::command]
pub async fn docker_stats_stop(state: State<'_, DockerState>, id: String) -> Result<(), String> {
    if let Some(task) = state.log_streams.lock().await.remove(&format!("stats:{id}")) {
        task.abort();
    }
    Ok(())
}

#[tauri::command]
pub async fn docker_compose_up(
    state: State<'_, DockerState>,
    project: String,
    yaml: String,
    on_output: Channel<LogChunk>,
) -> Result<(), String> {
    host(&state)
        .await?
        .compose_up(
            &project,
            &yaml,
            Box::new(move |chunk| {
                let _ = on_output.send(chunk);
            }),
        )
        .await
}
