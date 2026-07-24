pub mod compose;
pub mod host;
pub mod remote;
pub mod tunnel;

use async_trait::async_trait;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortMapping {
    pub private_port: u16,
    pub public_port: Option<u16>,
    pub protocol: String,
    pub ip: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerInfo {
    pub id: String,
    pub name: String,
    pub image: String,
    /// "running", "exited", "paused", "created", "restarting", "dead"
    pub state: String,
    /// texto humano de Docker: "Up 3 hours", "Exited (0) 2 days ago"
    pub status: String,
    pub created: i64,
    pub ports: Vec<PortMapping>,
    pub compose_project: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerInfo {
    pub version: String,
    pub api_version: String,
    pub os: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogChunk {
    pub line: String,
    /// "stdout" | "stderr"
    pub stream: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerStats {
    pub cpu_percent: f64,
    pub memory_used: u64,
    pub memory_limit: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageInfo {
    pub id: String,
    pub tags: Vec<String>,
    pub size: i64,
    pub created: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VolumeInfo {
    pub name: String,
    pub driver: String,
    pub mountpoint: String,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MountInfo {
    pub source: String,
    pub destination: String,
    pub mode: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkAttachment {
    pub name: String,
    pub ip: String,
}

/// Detalle de inspect para el panel: lo que hace falta para depurar
/// sin volver al terminal.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerDetails {
    pub env: Vec<String>,
    pub cmd: Option<String>,
    pub restart_policy: String,
    pub mounts: Vec<MountInfo>,
    pub networks: Vec<NetworkAttachment>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkInfo {
    pub id: String,
    pub name: String,
    pub driver: String,
    pub scope: String,
    /// bridge/host/none no se pueden eliminar
    pub builtin: bool,
}

pub type Result<T> = std::result::Result<T, String>;

pub type LogSink = Box<dyn Fn(LogChunk) + Send + Sync>;

pub type StatsSink = Box<dyn Fn(ContainerStats) + Send + Sync>;

pub type BytesSink = Box<dyn Fn(Vec<u8>) + Send + Sync>;

/// Entrada del terminal interactivo; cerrar el sender termina la sesión.
pub enum ExecOp {
    Data(Vec<u8>),
    Resize(u16, u16),
}

/// La UI habla contra este trait y no sabe de dónde viene Docker:
/// el socket local o el mismo socket tunelizado por SSH.
#[async_trait]
pub trait DockerHost: Send + Sync {
    async fn info(&self) -> Result<DockerInfo>;
    async fn list_containers(&self) -> Result<Vec<ContainerInfo>>;
    async fn start(&self, id: &str) -> Result<()>;
    async fn stop(&self, id: &str) -> Result<()>;
    async fn restart(&self, id: &str) -> Result<()>;
    async fn remove(&self, id: &str, force: bool) -> Result<()>;
    /// Sigue los logs del contenedor llamando a `on_chunk` por cada trozo.
    /// No retorna hasta que el stream se corta o la tarea que lo envuelve se aborta.
    async fn logs(&self, id: &str, tail: u32, on_chunk: LogSink) -> Result<()>;
    /// Stream de CPU/RAM del contenedor (~1 muestra/s), mismo contrato que `logs`.
    async fn stats(&self, id: &str, on_stats: StatsSink) -> Result<()>;
    /// Shell interactiva dentro del contenedor vía Docker API exec (bash si
    /// existe, sh si no). Termina cuando el proceso sale o se cierra `ops`.
    async fn exec_shell(
        &self,
        id: &str,
        cols: u16,
        rows: u16,
        on_data: BytesSink,
        ops: tokio::sync::mpsc::Receiver<ExecOp>,
    ) -> Result<()>;
    /// `docker compose up -d` con el YAML dado, streameando la salida.
    /// Compose es una herramienta de cliente, no parte de la API: local usa el
    /// CLI de la máquina; remoto sube el YAML por SSH y lo ejecuta allí.
    async fn compose_up(&self, project: &str, yaml: &str, on_output: LogSink) -> Result<()>;
    /// `docker compose -p <proyecto> <down|restart|...>` — v2 resuelve el
    /// proyecto por labels, sin necesitar el archivo.
    async fn compose_action(&self, project: &str, action: &str, on_output: LogSink)
        -> Result<()>;
    /// YAML del proyecto, leído del archivo que registran los labels de Docker.
    async fn compose_file(&self, project: &str) -> Result<String>;
    /// `pull` + `up -d` con el archivo original del proyecto: "desplegar
    /// la última versión" en un clic.
    async fn compose_update(&self, project: &str, on_output: LogSink) -> Result<()>;
    /// env, montajes, redes y política de reinicio del contenedor.
    async fn inspect(&self, id: &str) -> Result<ContainerDetails>;

    async fn list_images(&self) -> Result<Vec<ImageInfo>>;
    async fn remove_image(&self, id: &str) -> Result<()>;
    /// bytes liberados
    async fn prune_images(&self) -> Result<i64>;
    async fn list_volumes(&self) -> Result<Vec<VolumeInfo>>;
    async fn remove_volume(&self, name: &str) -> Result<()>;
    /// bytes liberados
    async fn prune_volumes(&self) -> Result<i64>;
    async fn list_networks(&self) -> Result<Vec<NetworkInfo>>;
    async fn remove_network(&self, id: &str) -> Result<()>;
    /// redes eliminadas
    async fn prune_networks(&self) -> Result<i64>;
}
