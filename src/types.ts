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

export interface MountInfo {
  source: string;
  destination: string;
  mode: string;
}

export interface NetworkAttachment {
  name: string;
  ip: string;
}

/** inspect resumido: lo necesario para depurar sin volver al terminal */
export interface ContainerDetails {
  env: string[];
  cmd: string | null;
  restartPolicy: string;
  mounts: MountInfo[];
  networks: NetworkAttachment[];
}

/** servidor remoto guardado; nunca contiene secretos */
export interface HostConfig {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  /** "key": clave concreta o las por defecto · "password": se pide al conectar */
  authKind: "key" | "password";
  keyPath: string | null;
  socketPath: string | null;
}

/** clave privada detectada en ~/.ssh */
export interface SshKey {
  name: string;
  path: string;
}

export interface SshConfigHost {
  alias: string;
  hostname: string;
  user: string | null;
  port: number;
  identityFile: string | null;
}
