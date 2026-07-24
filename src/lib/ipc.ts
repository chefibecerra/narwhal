import { Channel, invoke } from "@tauri-apps/api/core";

import type {
  ContainerDetails,
  ContainerInfo,
  ContainerStats,
  DockerInfo,
  HostConfig,
  ImageInfo,
  LogChunk,
  NetworkInfo,
  SshConfigHost,
  SshKey,
  VolumeInfo,
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

export const listSshKeys = () => invoke<SshKey[]>("list_ssh_keys");

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

/** shell interactiva vía Docker API exec; la salida llega en crudo (bytes) */
export const execStart = (
  sessionId: string,
  containerId: string,
  cols: number,
  rows: number,
  onData: (data: ArrayBuffer) => void,
) => {
  const channel = new Channel<ArrayBuffer>();
  channel.onmessage = onData;
  return invoke<void>("docker_exec_start", {
    sessionId,
    containerId,
    cols,
    rows,
    onData: channel,
  });
};

export const execWrite = (sessionId: string, data: string) =>
  invoke<void>("docker_exec_write", { sessionId, data });

export const execResize = (sessionId: string, cols: number, rows: number) =>
  invoke<void>("docker_exec_resize", { sessionId, cols, rows });

export const execStop = (sessionId: string) =>
  invoke<void>("docker_exec_stop", { sessionId });

/** resumen para el menú de la barra de macOS */
export const trayUpdate = (
  containers: {
    id: string;
    name: string;
    state: string;
    composeProject: string | null;
    unhealthy: boolean;
  }[],
) => invoke<void>("tray_update", { containers });

export const listImages = () => invoke<ImageInfo[]>("docker_list_images");
export const removeImage = (id: string) =>
  invoke<void>("docker_remove_image", { id });
export const pruneImages = () => invoke<number>("docker_prune_images");

export const listVolumes = () => invoke<VolumeInfo[]>("docker_list_volumes");
export const removeVolume = (name: string) =>
  invoke<void>("docker_remove_volume", { name });
export const pruneVolumes = () => invoke<number>("docker_prune_volumes");

export const listNetworks = () => invoke<NetworkInfo[]>("docker_list_networks");
export const removeNetwork = (id: string) =>
  invoke<void>("docker_remove_network", { id });
export const pruneNetworks = () => invoke<number>("docker_prune_networks");

export const inspectContainer = (id: string) =>
  invoke<ContainerDetails>("docker_inspect", { id });

/** YAML del proyecto según los labels de Docker (archivo original) */
export const composeFile = (project: string) =>
  invoke<string>("docker_compose_file", { project });

/** pull + up -d con el archivo original del proyecto */
export const composeUpdate = (
  project: string,
  onOutput: (chunk: LogChunk) => void,
) => {
  const channel = new Channel<LogChunk>();
  channel.onmessage = onOutput;
  return invoke<void>("docker_compose_update", { project, onOutput: channel });
};

/** biblioteca local de composes desplegados */
export const composeSavedList = () =>
  invoke<string[]>("compose_saved_list");
export const composeSavedRead = (project: string) =>
  invoke<string>("compose_saved_read", { project });
export const composeSavedSave = (project: string, yaml: string) =>
  invoke<void>("compose_saved_save", { project, yaml });

/** down | restart | stop | start sobre un proyecto compose ya desplegado */
export const composeAction = (
  project: string,
  action: "down" | "restart" | "stop" | "start",
  onOutput: (chunk: LogChunk) => void,
) => {
  const channel = new Channel<LogChunk>();
  channel.onmessage = onOutput;
  return invoke<void>("docker_compose_action", {
    project,
    action,
    onOutput: channel,
  });
};

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
