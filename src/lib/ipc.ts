import { Channel, invoke } from "@tauri-apps/api/core";

import type {
  ContainerInfo,
  ContainerStats,
  DockerInfo,
  HostConfig,
  LogChunk,
  SshConfigHost,
} from "@/types";

export const connectLocal = () => invoke<DockerInfo>("docker_connect_local");

/** `secret` es la passphrase si el host tiene clave, o la contraseña SSH si no */
export const connectRemote = (hostId: string, secret?: string) =>
  invoke<DockerInfo>("docker_connect_remote", { hostId, secret: secret ?? null });

export const listHosts = () => invoke<HostConfig[]>("hosts_list");

export const saveHost = (host: HostConfig) =>
  invoke<HostConfig>("host_save", { host });

export const deleteHost = (id: string) => invoke<void>("host_delete", { id });

export const readSshConfig = () =>
  invoke<SshConfigHost[]>("read_ssh_config");

export const listContainers = () =>
  invoke<ContainerInfo[]>("docker_list_containers");

export const startContainer = (id: string) =>
  invoke<void>("docker_start", { id });

export const stopContainer = (id: string) => invoke<void>("docker_stop", { id });

export const restartContainer = (id: string) =>
  invoke<void>("docker_restart", { id });

export const removeContainer = (id: string, force = false) =>
  invoke<void>("docker_remove", { id, force });

export const startLogs = (
  id: string,
  tail: number,
  onChunk: (chunk: LogChunk) => void,
) => {
  const channel = new Channel<LogChunk>();
  channel.onmessage = onChunk;
  return invoke<void>("docker_logs_start", { id, tail, onChunk: channel });
};

export const stopLogs = (id: string) => invoke<void>("docker_logs_stop", { id });

export const startStats = (
  id: string,
  onStats: (stats: ContainerStats) => void,
) => {
  const channel = new Channel<ContainerStats>();
  channel.onmessage = onStats;
  return invoke<void>("docker_stats_start", { id, onStats: channel });
};

export const stopStats = (id: string) =>
  invoke<void>("docker_stats_stop", { id });

/** resuelve al terminar `docker compose up -d`; la salida llega por el canal */
export const composeUp = (
  project: string,
  yaml: string,
  onOutput: (chunk: LogChunk) => void,
) => {
  const channel = new Channel<LogChunk>();
  channel.onmessage = onOutput;
  return invoke<void>("docker_compose_up", { project, yaml, onOutput: channel });
};
