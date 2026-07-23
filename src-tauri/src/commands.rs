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

const LOCAL_KEY: &str = "local";

#[derive(Default)]
pub struct DockerState {
    /// host activo (clave del pool)
    active: Mutex<Option<String>>,
    /// conexiones vivas por host: cambiar de host no las tira, así volver
    /// es instantáneo y sin volver a pedir credenciales
    pool: Mutex<HashMap<String, Arc<dyn DockerHost>>>,
    /// secretos SOLO en RAM (como ssh-agent): mueren al cerrar la app
    secrets: Mutex<HashMap<String, String>>,
    log_streams: Mutex<HashMap<String, tauri::async_runtime::JoinHandle<()>>>,
    exec_sessions: Mutex<HashMap<String, mpsc::Sender<ExecOp>>>,
}

pub(crate) async fn host(state: &DockerState) -> Result<Arc<dyn DockerHost>, String> {
    let active = state
        .active
        .lock()
        .await
        .clone()
        .ok_or_else(|| "Sin conexión con Docker".to_string())?;
    state
        .pool
        .lock()
        .await
        .get(&active)
        .cloned()
        .ok_or_else(|| "Sin conexión con Docker".to_string())
}

/// Al cambiar de host los streams (logs, stats) y consolas del anterior
/// quedan huérfanos en la UI: se cortan todos al activar el nuevo.
async fn activate(state: &DockerState, key: &str) {
    for (_, task) in state.log_streams.lock().await.drain() {
        task.abort();
    }
    // soltar los senders termina los bucles de exec_shell
    state.exec_sessions.lock().await.clear();
    *state.active.lock().await = Some(key.to_string());
}

/// Saca a un host del pool y olvida su secreto (al editarlo o borrarlo).
pub(crate) async fn evict(state: &DockerState, id: &str) {
    state.pool.lock().await.remove(id);
    state.secrets.lock().await.remove(id);
}

/// Conexión del pool que sigue respondiendo, o None (y se purga si murió).
async fn live_from_pool(state: &DockerState, key: &str) -> Option<(Arc<dyn DockerHost>, DockerInfo)> {
    let existing = state.pool.lock().await.get(key).cloned()?;
    match existing.info().await {
        Ok(info) => Some((existing, info)),
        Err(_) => {
            state.pool.lock().await.remove(key);
            None
        }
    }
}

#[tauri::command]
pub async fn docker_connect_local(state: State<'_, DockerState>) -> Result<DockerInfo, String> {
    if let Some((_, info)) = live_from_pool(&state, LOCAL_KEY).await {
        activate(&state, LOCAL_KEY).await;
        return Ok(info);
    }
    let local = BollardHost::local()?;
    // valida que el demonio responde antes de dar la conexión por buena
    let info = local.info().await?;
    state
        .pool
        .lock()
        .await
        .insert(LOCAL_KEY.into(), Arc::new(local));
    activate(&state, LOCAL_KEY).await;
    Ok(info)
}

#[tauri::command]
pub async fn docker_connect_remote(
    app: AppHandle,
    state: State<'_, DockerState>,
    host_id: String,
    secret: Option<String>,
) -> Result<DockerInfo, String> {
    // 1) conexión viva de una visita anterior: ni SSH ni credenciales
    if let Some((_, info)) = live_from_pool(&state, &host_id).await {
        activate(&state, &host_id).await;
        return Ok(info);
    }

    // 2) reconexión: si el usuario no aporta secreto, probar el recordado
    let cfg = crate::hosts::get(&app, &host_id)?;
    let provided = secret.is_some();
    let secret = match secret {
        Some(s) => Some(s),
        None => state.secrets.lock().await.get(&host_id).cloned(),
    };
    let used_cached = !provided && secret.is_some();

    match crate::docker::remote::connect(&app, &cfg, secret.clone()).await {
        Ok(remote) => {
            let info = remote.info().await?;
            if provided {
                // funcionó: se recuerda para reconexiones, solo en RAM
                state
                    .secrets
                    .lock()
                    .await
                    .insert(host_id.clone(), secret.expect("provided"));
            }
            state
                .pool
                .lock()
                .await
                .insert(host_id.clone(), Arc::new(remote));
            activate(&state, &host_id).await;
            Ok(info)
        }
        Err(e) => {
            // el secreto recordado ya no vale (cambió la clave/contraseña)
            if used_cached && (e.starts_with("auth:") || e.starts_with("passphrase:")) {
                state.secrets.lock().await.remove(&host_id);
            }
            Err(e)
        }
    }
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
