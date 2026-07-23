import { toast } from "sonner";
import { create } from "zustand";

import { formatBytes, healthOf } from "@/lib/docker";
import * as ipc from "@/lib/ipc";
import type {
  ContainerInfo,
  DockerInfo,
  HostConfig,
  ImageInfo,
  NetworkInfo,
  View,
  VolumeInfo,
} from "@/types";

export type ConnectionStatus = "connecting" | "connected" | "error";
export type ContainerAction = "start" | "stop" | "restart" | "remove";

/** id del host local en la UI; los remotos usan su uuid */
export const LOCAL_HOST = "local";

interface ContainersState {
  status: ConnectionStatus;
  error: string | null;
  docker: DockerInfo | null;
  containers: ContainerInfo[];
  /** acciones en curso por id de contenedor, para deshabilitar botones */
  busy: Record<string, ContainerAction>;
  /** contenedor seleccionado, mostrado en el panel de detalle */
  selectedId: string | null;
  /** contenedor con consola abierta en el cajón inferior */
  execId: string | null;
  /** filtro de búsqueda de la lista */
  search: string;
  hosts: HostConfig[];
  activeHostId: string;
  /** sección activa: contenedores, imágenes, volúmenes o redes */
  view: View;
  images: ImageInfo[];
  volumes: VolumeInfo[];
  networks: NetworkInfo[];
  composeOpen: boolean;
  paletteOpen: boolean;
  loadHosts: () => Promise<void>;
  saveHost: (host: HostConfig) => Promise<void>;
  deleteHost: (id: string) => Promise<void>;
  /**
   * Conecta con el host y lo activa. Devuelve null si fue bien o el error
   * crudo del backend: los prefijos "auth:" / "passphrase:" indican que hay
   * que pedir credenciales.
   */
  connectTo: (hostId: string, secret?: string) => Promise<string | null>;
  refresh: () => Promise<void>;
  run: (id: string, action: ContainerAction) => Promise<void>;
  select: (id: string | null) => void;
  setSearch: (search: string) => void;
  openExec: (id: string) => void;
  closeExec: () => void;
  setView: (view: View) => void;
  setComposeOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  removeResource: (view: View, id: string) => Promise<void>;
  /** limpia recursos sin uso de la vista actual */
  prune: () => Promise<void>;
  composeAction: (
    project: string,
    action: "down" | "restart" | "stop" | "start",
  ) => Promise<void>;
}

export const useContainers = create<ContainersState>((set, get) => ({
  status: "connecting",
  error: null,
  docker: null,
  containers: [],
  busy: {},
  selectedId: null,
  execId: null,
  search: "",
  hosts: [],
  activeHostId: LOCAL_HOST,
  view: "containers",
  images: [],
  volumes: [],
  networks: [],
  composeOpen: false,
  paletteOpen: false,

  loadHosts: async () => {
    try {
      set({ hosts: await ipc.listHosts() });
    } catch (e) {
      toast.error(String(e));
    }
  },

  saveHost: async (host) => {
    try {
      await ipc.saveHost(host);
      await get().loadHosts();
    } catch (e) {
      toast.error(String(e));
    }
  },

  deleteHost: async (id) => {
    try {
      await ipc.deleteHost(id);
      await get().loadHosts();
      // si era el host activo, se vuelve al Docker local
      if (get().activeHostId === id) void get().connectTo(LOCAL_HOST);
    } catch (e) {
      toast.error(String(e));
    }
  },

  connectTo: async (hostId, secret) => {
    set({
      status: "connecting",
      error: null,
      activeHostId: hostId,
      selectedId: null,
      execId: null,
      containers: [],
      images: [],
      volumes: [],
      networks: [],
      docker: null,
    });
    try {
      const docker =
        hostId === LOCAL_HOST
          ? await ipc.connectLocal()
          : await ipc.connectRemote(hostId, secret);
      set({ status: "connected", docker });
      await get().refresh();
      return null;
    } catch (e) {
      const raw = String(e);
      set({
        status: "error",
        error: raw.replace(/^(auth|passphrase):\s*/, ""),
      });
      return raw;
    }
  },

  refresh: async () => {
    try {
      const containers = await ipc.listContainers();
      set({ containers });
      void ipc
        .trayUpdate(
          containers.map((c) => ({
            id: c.id,
            name: c.name,
            state: c.state,
            composeProject: c.composeProject,
            unhealthy: healthOf(c.status) === "unhealthy",
          })),
        )
        .catch(() => {});
      const view = get().view;
      if (view === "images") set({ images: await ipc.listImages() });
      if (view === "volumes") set({ volumes: await ipc.listVolumes() });
      if (view === "networks") set({ networks: await ipc.listNetworks() });
    } catch (e) {
      set({ status: "error", error: String(e) });
    }
  },

  run: async (id, action) => {
    set((s) => ({ busy: { ...s.busy, [id]: action } }));
    try {
      if (action === "start") await ipc.startContainer(id);
      if (action === "stop") await ipc.stopContainer(id);
      if (action === "restart") await ipc.restartContainer(id);
      if (action === "remove") {
        await ipc.removeContainer(id, true);
        if (get().selectedId === id) set({ selectedId: null });
        if (get().execId === id) set({ execId: null });
      }
      await get().refresh();
    } catch (e) {
      toast.error(String(e));
    } finally {
      set((s) => {
        const { [id]: _done, ...rest } = s.busy;
        return { busy: rest };
      });
    }
  },

  select: (id) => set({ selectedId: id }),
  setSearch: (search) => set({ search }),
  openExec: (id) => set({ execId: id }),
  closeExec: () => set({ execId: null }),
  setView: (view) => {
    set({ view, search: "" });
    void get().refresh();
  },
  setComposeOpen: (composeOpen) => set({ composeOpen }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),

  removeResource: async (view, id) => {
    try {
      if (view === "images") await ipc.removeImage(id);
      if (view === "volumes") await ipc.removeVolume(id);
      if (view === "networks") await ipc.removeNetwork(id);
      await get().refresh();
    } catch (e) {
      toast.error(String(e));
    }
  },

  prune: async () => {
    const view = get().view;
    try {
      if (view === "images") {
        toast.success(`Liberado ${formatBytes(await ipc.pruneImages())}`);
      }
      if (view === "volumes") {
        toast.success(`Liberado ${formatBytes(await ipc.pruneVolumes())}`);
      }
      if (view === "networks") {
        toast.success(`${await ipc.pruneNetworks()} redes eliminadas`);
      }
      await get().refresh();
    } catch (e) {
      toast.error(String(e));
    }
  },

  composeAction: async (project, action) => {
    try {
      await ipc.composeAction(project, action, () => {});
      toast.success(`${project}: ${action} completado`);
    } catch (e) {
      toast.error(String(e));
    }
    await get().refresh();
  },
}));
