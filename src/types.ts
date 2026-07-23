export interface PortMapping {
  privatePort: number;
  publicPort: number | null;
  protocol: string;
  ip: string | null;
}

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  /** "running", "exited", "paused", "created", "restarting", "dead" */
  state: string;
  /** texto humano de Docker: "Up 3 hours", "Exited (0) 2 days ago" */
  status: string;
  created: number;
  ports: PortMapping[];
  composeProject: string | null;
}

export interface DockerInfo {
  version: string;
  apiVersion: string;
  os: string;
}

export interface LogChunk {
  line: string;
  stream: "stdout" | "stderr";
}

export interface ContainerStats {
  cpuPercent: number;
  memoryUsed: number;
  memoryLimit: number;
}

export interface ImageInfo {
  id: string;
  tags: string[];
  size: number;
  created: number;
}

export interface VolumeInfo {
  name: string;
  driver: string;
  mountpoint: string;
  createdAt: string | null;
}

export interface NetworkInfo {
  id: string;
  name: string;
  driver: string;
  scope: string;
  builtin: boolean;
}

export type View = "containers" | "images" | "volumes" | "networks";

/** servidor remoto guardado; nunca contiene secretos */
export interface HostConfig {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  keyPath: string | null;
  socketPath: string | null;
}

export interface SshConfigHost {
  alias: string;
  hostname: string;
  user: string | null;
  port: number;
  identityFile: string | null;
}
