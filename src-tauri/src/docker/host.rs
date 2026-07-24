use async_trait::async_trait;
use bollard::container::{
    ListContainersOptions, LogOutput, LogsOptions, RemoveContainerOptions,
    RestartContainerOptions, StartContainerOptions, StatsOptions, StopContainerOptions,
};
use bollard::{Docker, API_DEFAULT_VERSION};
use futures_util::StreamExt;

use super::tunnel::SocketTunnel;
use super::{
    BytesSink, ContainerDetails, ContainerInfo, ContainerStats, DockerHost, DockerInfo,
    ExecOp, ImageInfo, LogChunk, LogSink, MountInfo, NetworkAttachment, NetworkInfo,
    PortMapping, Result, StatsSink, VolumeInfo,
};

const COMPOSE_PROJECT_LABEL: &str = "com.docker.compose.project";
const COMPOSE_CONFIG_LABEL: &str = "com.docker.compose.project.config_files";

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
    /// `socket` permite rutas no estándar (Colima, Podman, rootless);
    /// vacío o None usa el socket por defecto de la plataforma.
    pub fn local(socket: Option<String>) -> Result<Self> {
        let socket = socket.filter(|s| !s.trim().is_empty());
        let docker = match socket {
            #[cfg(unix)]
            Some(path) => Docker::connect_with_unix(&path, 30, API_DEFAULT_VERSION),
            #[cfg(not(unix))]
            Some(_) => Docker::connect_with_local_defaults(),
            None => Docker::connect_with_local_defaults(),
        }
        .map_err(|e| e.to_string())?;
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

    /// Ruta del compose de un proyecto según los labels de sus contenedores.
    async fn compose_config_path(&self, project: &str) -> Result<String> {
        let mut filters = std::collections::HashMap::new();
        filters.insert(
            "label".to_string(),
            vec![format!("{COMPOSE_PROJECT_LABEL}={project}")],
        );
        let list = self
            .docker
            .list_containers(Some(ListContainersOptions::<String> {
                all: true,
                filters,
                ..Default::default()
            }))
            .await
            .map_err(|e| e.to_string())?;

        list.into_iter()
            .find_map(|c| {
                c.labels
                    .and_then(|l| l.get(COMPOSE_CONFIG_LABEL).cloned())
            })
            .map(|s| s.split(',').next().unwrap_or_default().to_string())
            .filter(|s| !s.is_empty())
            .ok_or_else(|| "No se encontró el archivo compose del proyecto".to_string())
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

    async fn exec_shell(
        &self,
        id: &str,
        cols: u16,
        rows: u16,
        on_data: BytesSink,
        mut ops: tokio::sync::mpsc::Receiver<ExecOp>,
    ) -> Result<()> {
        use bollard::exec::{CreateExecOptions, ResizeExecOptions, StartExecResults};
        use tokio::io::AsyncWriteExt;

        let exec = self
            .docker
            .create_exec(
                id,
                CreateExecOptions::<String> {
                    attach_stdin: Some(true),
                    attach_stdout: Some(true),
                    attach_stderr: Some(true),
                    tty: Some(true),
                    env: Some(vec!["TERM=xterm-256color".into()]),
                    cmd: Some(vec![
                        "/bin/sh".into(),
                        "-lc".into(),
                        "command -v bash >/dev/null 2>&1 && exec bash || exec sh".into(),
                    ]),
                    ..Default::default()
                },
            )
            .await
            .map_err(|e| e.to_string())?;

        let started = self
            .docker
            .start_exec(&exec.id, None)
            .await
            .map_err(|e| e.to_string())?;

        if let StartExecResults::Attached {
            mut output,
            mut input,
        } = started
        {
            let _ = self
                .docker
                .resize_exec(
                    &exec.id,
                    ResizeExecOptions {
                        height: rows,
                        width: cols,
                    },
                )
                .await;

            loop {
                tokio::select! {
                    chunk = output.next() => match chunk {
                        Some(Ok(out)) => on_data(out.into_bytes().to_vec()),
                        _ => break,
                    },
                    op = ops.recv() => match op {
                        Some(ExecOp::Data(bytes)) => {
                            if input.write_all(&bytes).await.is_err() {
                                break;
                            }
                        }
                        Some(ExecOp::Resize(c, r)) => {
                            let _ = self
                                .docker
                                .resize_exec(
                                    &exec.id,
                                    ResizeExecOptions { height: r, width: c },
                                )
                                .await;
                        }
                        None => break,
                    },
                }
            }
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

    async fn compose_action(
        &self,
        project: &str,
        action: &str,
        on_output: LogSink,
    ) -> Result<()> {
        let project = super::compose::sanitize_project(project)?;
        match &self.tunnel {
            Some(tunnel) => {
                super::compose::action_remote(&tunnel.session(), &project, action, &on_output)
                    .await
            }
            None => super::compose::action_local(&project, action, &on_output).await,
        }
    }

    async fn compose_file(&self, project: &str) -> Result<String> {
        let project = super::compose::sanitize_project(project)?;
        let path = self.compose_config_path(&project).await?;
        match &self.tunnel {
            None => std::fs::read_to_string(&path)
                .map_err(|e| format!("no se pudo leer {path}: {e}")),
            Some(tunnel) => super::compose::read_remote_file(&tunnel.session(), &path).await,
        }
    }

    async fn compose_update(&self, project: &str, on_output: LogSink) -> Result<()> {
        let project = super::compose::sanitize_project(project)?;
        let path = self.compose_config_path(&project).await?;
        match &self.tunnel {
            None => super::compose::update_local(&path, &project, &on_output).await,
            Some(tunnel) => {
                super::compose::update_remote(&tunnel.session(), &path, &project, &on_output)
                    .await
            }
        }
    }

    async fn inspect(&self, id: &str) -> Result<ContainerDetails> {
        use bollard::container::InspectContainerOptions;
        let d = self
            .docker
            .inspect_container(id, None::<InspectContainerOptions>)
            .await
            .map_err(|e| e.to_string())?;

        let config = d.config.unwrap_or_default();
        let restart_policy = d
            .host_config
            .and_then(|h| h.restart_policy)
            .and_then(|r| r.name)
            .map(|n| n.to_string())
            .filter(|n| !n.is_empty())
            .unwrap_or_else(|| "no".into());

        Ok(ContainerDetails {
            env: config.env.unwrap_or_default(),
            cmd: config.cmd.map(|c| c.join(" ")),
            restart_policy,
            mounts: d
                .mounts
                .unwrap_or_default()
                .into_iter()
                .map(|m| MountInfo {
                    source: m.source.unwrap_or_default(),
                    destination: m.destination.unwrap_or_default(),
                    mode: m.mode.unwrap_or_default(),
                })
                .collect(),
            networks: d
                .network_settings
                .and_then(|n| n.networks)
                .unwrap_or_default()
                .into_iter()
                .map(|(name, endpoint)| NetworkAttachment {
                    name,
                    ip: endpoint.ip_address.unwrap_or_default(),
                })
                .collect(),
        })
    }

    async fn list_images(&self) -> Result<Vec<ImageInfo>> {
        use bollard::image::ListImagesOptions;
        let list = self
            .docker
            .list_images(None::<ListImagesOptions<String>>)
            .await
            .map_err(|e| e.to_string())?;
        Ok(list
            .into_iter()
            .map(|i| ImageInfo {
                id: i.id,
                tags: i.repo_tags,
                size: i.size,
                created: i.created,
            })
            .collect())
    }

    async fn remove_image(&self, id: &str) -> Result<()> {
        use bollard::image::RemoveImageOptions;
        self.docker
            .remove_image(
                id,
                Some(RemoveImageOptions {
                    force: false,
                    ..Default::default()
                }),
                None,
            )
            .await
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    async fn prune_images(&self) -> Result<i64> {
        use bollard::image::PruneImagesOptions;
        let report = self
            .docker
            .prune_images(None::<PruneImagesOptions<String>>)
            .await
            .map_err(|e| e.to_string())?;
        Ok(report.space_reclaimed.unwrap_or(0))
    }

    async fn list_volumes(&self) -> Result<Vec<VolumeInfo>> {
        use bollard::volume::ListVolumesOptions;
        let response = self
            .docker
            .list_volumes(None::<ListVolumesOptions<String>>)
            .await
            .map_err(|e| e.to_string())?;
        Ok(response
            .volumes
            .unwrap_or_default()
            .into_iter()
            .map(|v| VolumeInfo {
                name: v.name,
                driver: v.driver,
                mountpoint: v.mountpoint,
                created_at: v.created_at.map(|d| d.to_string()),
            })
            .collect())
    }

    async fn remove_volume(&self, name: &str) -> Result<()> {
        self.docker
            .remove_volume(name, None)
            .await
            .map_err(|e| e.to_string())
    }

    async fn prune_volumes(&self) -> Result<i64> {
        use bollard::volume::PruneVolumesOptions;
        let report = self
            .docker
            .prune_volumes(None::<PruneVolumesOptions<String>>)
            .await
            .map_err(|e| e.to_string())?;
        Ok(report.space_reclaimed.unwrap_or(0))
    }

    async fn list_networks(&self) -> Result<Vec<NetworkInfo>> {
        use bollard::network::ListNetworksOptions;
        let list = self
            .docker
            .list_networks(None::<ListNetworksOptions<String>>)
            .await
            .map_err(|e| e.to_string())?;
        Ok(list
            .into_iter()
            .map(|n| {
                let name = n.name.unwrap_or_default();
                NetworkInfo {
                    id: n.id.unwrap_or_default(),
                    builtin: matches!(name.as_str(), "bridge" | "host" | "none"),
                    name,
                    driver: n.driver.unwrap_or_default(),
                    scope: n.scope.unwrap_or_default(),
                }
            })
            .collect())
    }

    async fn remove_network(&self, id: &str) -> Result<()> {
        self.docker
            .remove_network(id)
            .await
            .map_err(|e| e.to_string())
    }

    async fn prune_networks(&self) -> Result<i64> {
        use bollard::network::PruneNetworksOptions;
        let report = self
            .docker
            .prune_networks(None::<PruneNetworksOptions<String>>)
            .await
            .map_err(|e| e.to_string())?;
        Ok(report.networks_deleted.unwrap_or_default().len() as i64)
    }
}
