import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { create } from "zustand";

type Phase = "idle" | "available" | "downloading" | "ready" | "error";

interface UpdaterState {
  phase: Phase;
  update: Update | null;
  version: string | null;
  notes: string | null;
  progress: number;
  error: string | null;
  /** consulta silenciosa; si hay versión nueva pasa a "available" */
  checkOnStartup: () => Promise<void>;
  /** comprobación manual: informa aunque esté al día */
  checkManual: () => Promise<boolean>;
  install: () => Promise<void>;
  dismiss: () => void;
}

async function lookup() {
  const update = await check();
  return update && update.available ? update : null;
}

export const useUpdater = create<UpdaterState>((set, get) => ({
  phase: "idle",
  update: null,
  version: null,
  notes: null,
  progress: 0,
  error: null,

  checkOnStartup: async () => {
    try {
      const update = await lookup();
      if (update) {
        set({
          phase: "available",
          update,
          version: update.version,
          notes: update.body ?? null,
        });
      }
    } catch {
      // en silencio: un fallo de red al arrancar no molesta al usuario
    }
  },

  checkManual: async () => {
    try {
      const update = await lookup();
      if (update) {
        set({
          phase: "available",
          update,
          version: update.version,
          notes: update.body ?? null,
        });
        return true;
      }
      return false;
    } catch (e) {
      set({ phase: "error", error: String(e) });
      return false;
    }
  },

  install: async () => {
    const update = get().update;
    if (!update) return;
    set({ phase: "downloading", progress: 0 });
    try {
      let total = 0;
      let downloaded = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          set({ progress: total ? Math.round((downloaded / total) * 100) : 0 });
        }
      });
      set({ phase: "ready", progress: 100 });
      await relaunch();
    } catch (e) {
      set({ phase: "error", error: String(e) });
    }
  },

  dismiss: () => set({ phase: "idle", update: null }),
}));
