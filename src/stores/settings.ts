import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  /** cerrar la ventana la oculta al tray en vez de salir de la app */
  keepInTray: boolean;
  /** intervalo de sondeo en segundos (con la ventana visible) */
  pollSeconds: number;
  notifyStopped: boolean;
  notifyUnhealthy: boolean;
  /** socket de Docker local no estándar (Colima, Podman, rootless); vacío = por defecto */
  localSocket: string;
  /** opacidad de la ventana (70–100); el blur lo pone macOS */
  opacity: number;
  update: (partial: Partial<Omit<SettingsState, "update">>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      keepInTray: true,
      pollSeconds: 3,
      notifyStopped: true,
      notifyUnhealthy: true,
      localSocket: "",
      opacity: 100,
      update: (partial) => set(partial),
    }),
    { name: "narwhal-settings" },
  ),
);
