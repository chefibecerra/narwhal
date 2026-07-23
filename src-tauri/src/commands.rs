use std::collections::HashMap;
use std::sync::Arc;

use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::{mpsc, Mutex};

use crate::docker::host::BollardHost;
use crate::docker::{
    ContainerInfo, ContainerStats, DockerHost, DockerInfo, ExecOp, ImageInfo, LogChunk,
    NetworkInfo, VolumeInfo,
};

#[derive(Default)]
pub struct DockerState {
    host: Mutex<Option<Arc<dyn DockerHost>>>,
    log_streams: Mutex<HashMap<String, tauri::async_runtime::JoinHandle<()>>>,
    exec_sessions: Mutex<HashMap<String, mpsc::Sender<ExecOp>>>,
}

pub(crate) async fn host(state: &DockerState) -> Result<Arc<dyn DockerHost>, String> {
    state
        .host
        .lock()
        .await
        .clone()
        .ok_or_else(|| "Sin conexión con Docker".to_string())
}

/// Al cambiar de host los streams (logs, stats) y consolas del anterior
/// quedan huérfanos: se cortan todos antes de instalar la conexión nueva.
async fn install_host(state: &DockerState, new_host: Arc<dyn DockerHost>) {
    for (_, task) in state.log_streams.lock().await.drain() {
        task.abort();
    }
    // soltar los senders termina los bucles de exec_shell
    state.exec_sessions.lock().await.clear();
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
pub async fn docker_exec_start(
    app: AppHandle,
    state: State<'_, DockerState>,
    session_id: String,
    container_id: String,
    cols: u16,
    rows: u16,
    on_data: Channel<InvokeResponseBody>,
) -> Result<(), String> {
    let h = host(&state).await?;
    let (tx, rx) = mpsc::channel::<ExecOp>(64);
    state
        .exec_sessions
        .lock()
        .await
        .insert(session_id.clone(), tx);

    tauri::async_runtime::spawn(async move {
        let _ = h
            .exec_shell(
                &container_id,
                cols,
                rows,
                Box::new(move |bytes| {
                    let _ = on_data.send(InvokeResponseBody::Raw(bytes));
                }),
                rx,
            )
            .await;
        app.state::<DockerState>()
            .exec_sessions
            .lock()
            .await
            .remove(&session_id);
        let _ = app.emit("exec-closed", session_id);
    });
    Ok(())
}

#[tauri::command]
pub async fn docker_exec_write(
    state: State<'_, DockerState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let sessions = state.exec_sessions.lock().await;
    let tx = sessions.get(&session_id).ok_or("sesión no encontrada")?;
    tx.send(ExecOp::Data(data.into_bytes()))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn docker_exec_resize(
    state: State<'_, DockerState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state.exec_sessions.lock().await;
    let tx = sessions.get(&session_id).ok_or("sesión no encontrada")?;
    tx.send(ExecOp::Resize(cols, rows))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn docker_exec_stop(
    state: State<'_, DockerState>,
    session_id: String,
) -> Result<(), String> {
    // soltar el sender hace terminar el bucle de exec_shell
    state.exec_sessions.lock().await.remove(&session_id);
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

#[tauri::command]
pub async fn docker_compose_action(
    state: State<'_, DockerState>,
    project: String,
    action: String,
    on_output: Channel<LogChunk>,
) -> Result<(), String> {
    if !matches!(action.as_str(), "down" | "restart" | "stop" | "start") {
        return Err(format!("acción no permitida: {action}"));
    }
    host(&state)
        .await?
        .compose_action(
            &project,
            &action,
            Box::new(move |chunk| {
                let _ = on_output.send(chunk);
            }),
        )
        .await
}

#[tauri::command]
pub async fn docker_list_images(
    state: State<'_, DockerState>,
) -> Result<Vec<ImageInfo>, String> {
    host(&state).await?.list_images().await
}

#[tauri::command]
pub async fn docker_remove_image(
    state: State<'_, DockerState>,
    id: String,
) -> Result<(), String> {
    host(&state).await?.remove_image(&id).await
}

#[tauri::command]
pub async fn docker_prune_images(state: State<'_, DockerState>) -> Result<i64, String> {
    host(&state).await?.prune_images().await
}

#[tauri::command]
pub async fn docker_list_volumes(
    state: State<'_, DockerState>,
) -> Result<Vec<VolumeInfo>, String> {
    host(&state).await?.list_volumes().await
}

#[tauri::command]
pub async fn docker_remove_volume(
    state: State<'_, DockerState>,
    name: String,
) -> Result<(), String> {
    host(&state).await?.remove_volume(&name).await
}

#[tauri::command]
pub async fn docker_prune_volumes(state: State<'_, DockerState>) -> Result<i64, String> {
    host(&state).await?.prune_volumes().await
}

#[tauri::command]
pub async fn docker_list_networks(
    state: State<'_, DockerState>,
) -> Result<Vec<NetworkInfo>, String> {
    host(&state).await?.list_networks().await
}

#[tauri::command]
pub async fn docker_remove_network(
    state: State<'_, DockerState>,
    id: String,
) -> Result<(), String> {
    host(&state).await?.remove_network(&id).await
}

#[tauri::command]
pub async fn docker_prune_networks(state: State<'_, DockerState>) -> Result<i64, String> {
    host(&state).await?.prune_networks().await
}
