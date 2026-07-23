use async_trait::async_trait;
use bollard::container::{
    ListContainersOptions, LogOutput, LogsOptions, RemoveContainerOptions,
    RestartContainerOptions, StartContainerOptions, StatsOptions, StopContainerOptions,
};
use bollard::Docker;
use futures_util::StreamExt;

use super::tunnel::SocketTunnel;
use super::{
    ContainerInfo, ContainerStats, DockerHost, DockerInfo, LogChunk, LogSink, PortMapping,
    Result, StatsSink,
};

const COMPOSE_PROJECT_LABEL: &str = "com.docker.compose.project";

/// Un Docker cualquiera visto a través de bollard. Local habla con el socket
/// de la máquina; remoto habla con el mismo socket... tunelizado por SSH.
/// Mismo camino de datos, cero parseo de CLI.
pub struct BollardHost {
    docker: Docker,
    /// mantiene vivo el túnel SSH en modo remoto; None en local.
    /// Al soltar el host se cierra el túnel y la sesión SSH.
    tunnel: Option<SocketTunnel>,
}

impl BollardHost {
    pub fn local() -> Result<Self> {
        let docker = Docker::connect_with_local_defaults().map_err(|e| e.to_string())?;
        Ok(Self {
            docker,
            tunnel: None,
        })
    }

    pub fn with_tunnel(docker: Docker, tunnel: SocketTunnel) -> Self {
        Self {
            docker,
            tunnel: Some(tunnel),
        }
    }
}

#[async_trait]
impl DockerHost for BollardHost {
    async fn info(&self) -> Result<DockerInfo> {
        let v = self.docker.version().await.map_err(|e| e.to_string())?;
        Ok(DockerInfo {
            version: v.version.unwrap_or_default(),
            api_version: v.api_version.unwrap_or_default(),
            os: v.os.unwrap_or_default(),
        })
    }

    async fn list_containers(&self) -> Result<Vec<ContainerInfo>> {
        let opts = ListContainersOptions::<String> {
            all: true,
            ..Default::default()
        };
        let list = self
            .docker
            .list_containers(Some(opts))
            .await
            .map_err(|e| e.to_string())?;

        Ok(list
            .into_iter()
            .map(|c| ContainerInfo {
                id: c.id.unwrap_or_default(),
                name: c
                    .names
                    .as_ref()
                    .and_then(|n| n.first())
                    .map(|n| n.trim_start_matches('/').to_string())
                    .unwrap_or_default(),
                image: c.image.unwrap_or_default(),
                state: c.state.unwrap_or_default(),
                status: c.status.unwrap_or_default(),
                created: c.created.unwrap_or_default(),
                ports: c
                    .ports
                    .unwrap_or_default()
                    .into_iter()
                    .map(|p| PortMapping {
                        private_port: p.private_port,
                        public_port: p.public_port,
                        protocol: p
                            .typ
                            .map(|t| t.to_string())
                            .unwrap_or_else(|| "tcp".into()),
                        ip: p.ip,
                    })
                    .collect(),
                compose_project: c
                    .labels
                    .as_ref()
                    .and_then(|l| l.get(COMPOSE_PROJECT_LABEL))
                    .cloned(),
            })
            .collect())
    }

    async fn start(&self, id: &str) -> Result<()> {
        self.docker
            .start_container(id, None::<StartContainerOptions<String>>)
            .await
            .map_err(|e| e.to_string())
    }

    async fn stop(&self, id: &str) -> Result<()> {
        self.docker
            .stop_container(id, Some(StopContainerOptions { t: 10 }))
            .await
            .map_err(|e| e.to_string())
    }

    async fn restart(&self, id: &str) -> Result<()> {
        self.docker
            .restart_container(id, Some(RestartContainerOptions { t: 10 }))
            .await
            .map_err(|e| e.to_string())
    }

    async fn remove(&self, id: &str, force: bool) -> Result<()> {
        self.docker
            .remove_container(
                id,
                Some(RemoveContainerOptions {
                    force,
                    ..Default::default()
                }),
            )
            .await
            .map_err(|e| e.to_string())
    }

    async fn logs(&self, id: &str, tail: u32, on_chunk: LogSink) -> Result<()> {
        let opts = LogsOptions::<String> {
            follow: true,
            stdout: true,
            stderr: true,
            tail: tail.to_string(),
            ..Default::default()
        };
        let mut stream = self.docker.logs(id, Some(opts));
        while let Some(item) = stream.next().await {
            let out = item.map_err(|e| e.to_string())?;
            let (message, stream_name) = match out {
                LogOutput::StdErr { message } => (message, "stderr"),
                LogOutput::StdOut { message } | LogOutput::Console { message } => {
                    (message, "stdout")
                }
                LogOutput::StdIn { .. } => continue,
            };
            on_chunk(LogChunk {
                line: String::from_utf8_lossy(&message).into_owned(),
                stream: stream_name.into(),
            });
        }
        Ok(())
    }

    async fn stats(&self, id: &str, on_stats: StatsSink) -> Result<()> {
        let opts = StatsOptions {
            stream: true,
            one_shot: false,
        };
        let mut stream = self.docker.stats(id, Some(opts));
        while let Some(item) = stream.next().await {
            let s = item.map_err(|e| e.to_string())?;

            // fórmula de `docker stats`: delta de uso del contenedor sobre el
            // delta de CPU total del sistema, escalado al nº de CPUs
            let cpu_delta = s
                .cpu_stats
                .cpu_usage
                .total_usage
                .saturating_sub(s.precpu_stats.cpu_usage.total_usage)
                as f64;
            let system_delta = s
                .cpu_stats
                .system_cpu_usage
                .unwrap_or(0)
                .saturating_sub(s.precpu_stats.system_cpu_usage.unwrap_or(0))
                as f64;
            let cpus = s.cpu_stats.online_cpus.unwrap_or(1) as f64;
            let cpu_percent = if system_delta > 0.0 {
                (cpu_delta / system_delta) * cpus * 100.0
            } else {
                0.0
            };

            on_stats(ContainerStats {
                cpu_percent,
                memory_used: s.memory_stats.usage.unwrap_or(0),
                memory_limit: s.memory_stats.limit.unwrap_or(0),
            });
        }
        Ok(())
    }

    async fn compose_up(&self, project: &str, yaml: &str, on_output: LogSink) -> Result<()> {
        let project = super::compose::sanitize_project(project)?;
        match &self.tunnel {
            Some(tunnel) => {
                super::compose::up_remote(&tunnel.session(), &project, yaml, &on_output).await
            }
            None => super::compose::up_local(&project, yaml, &on_output).await,
        }
    }
}
