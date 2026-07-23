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
}
