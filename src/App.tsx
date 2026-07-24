import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";

import { CommandPalette } from "@/components/CommandPalette";
import { ComposeDialog } from "@/components/ComposeDialog";
import { ContainerList } from "@/components/ContainerList";
import { DetailPanel } from "@/components/DetailPanel";
import { Header } from "@/components/Header";
import { ResourceList } from "@/components/ResourceList";
import { SettingsDialog } from "@/components/SettingsDialog";
import { Sidebar } from "@/components/Sidebar";
import { StatusBar } from "@/components/StatusBar";
import { TerminalDrawer } from "@/components/TerminalDrawer";
import { TitleBar } from "@/components/TitleBar";
import { UpdateBanner } from "@/components/UpdateBanner";
import { Toaster } from "@/components/ui/sonner";
import { LOCAL_HOST, useContainers } from "@/stores/containers";
import { useSettings } from "@/stores/settings";
import { useUpdater } from "@/stores/updater";

function App() {
  const status = useContainers((s) => s.status);
  const view = useContainers((s) => s.view);
  const connectTo = useContainers((s) => s.connectTo);
  const loadHosts = useContainers((s) => s.loadHosts);
  const refresh = useContainers((s) => s.refresh);
  const composeOpen = useContainers((s) => s.composeOpen);
  const setComposeOpen = useContainers((s) => s.setComposeOpen);

  useEffect(() => {
    void loadHosts();
    void connectTo(LOCAL_HOST);
    void useUpdater.getState().checkOnStartup();
  }, [connectTo, loadHosts]);

  // "Ver en Narwhal" desde el menú de la barra de macOS
  useEffect(() => {
    const unlisten = listen<string>("tray-select", (e) => {
      const s = useContainers.getState();
      s.setView("containers");
      s.select(e.payload);
    });
    return () => void unlisten.then((fn) => fn());
  }, []);

  // los fallos de acciones lanzadas desde el tray no mueren en silencio
  useEffect(() => {
    const unlisten = listen<string>("tray-error", (e) => {
      toast.error(e.payload);
    });
    return () => void unlisten.then((fn) => fn());
  }, []);

  const pollSeconds = useSettings((s) => s.pollSeconds);
  const opacity = useSettings((s) => s.opacity);

  // refresco periódico mientras haya conexión. Con la ventana oculta baja
  // a 1 de cada 5 ticks: suficiente para que el tray siga al día
  // con una fracción del trabajo en segundo plano.
  useEffect(() => {
    if (status !== "connected") return;
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
      if (!document.hidden || ticks % 5 === 0) void refresh();
    }, pollSeconds * 1000);
    const onVisible = () => {
      if (!document.hidden) void refresh(); // ponerse al día al volver
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [status, refresh, pollSeconds]);

  // opacidad de la ventana (el blur nativo ya está en la config de Tauri)
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--app-alpha",
      String(opacity / 100),
    );
  }, [opacity]);

  // "Preferencias…" del menú nativo de macOS (⌘,)
  useEffect(() => {
    const unlisten = listen("open-settings", () =>
      useContainers.getState().setSettingsOpen(true),
    );
    return () => void unlisten.then((fn) => fn());
  }, []);

  // cerrar la ventana la oculta al tray (si el ajuste está activo);
  // "Salir" del tray o ⌘Q siguen cerrando de verdad
  useEffect(() => {
    const window = getCurrentWindow();
    const unlisten = window.onCloseRequested((event) => {
      if (useSettings.getState().keepInTray) {
        event.preventDefault();
        void window.hide();
      }
    });
    return () => void unlisten.then((fn) => fn());
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* franja superior de ancho completo; la sidebar empieza debajo */}
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          <Header />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-none">
            <div key={view} className="animate-in duration-200 fade-in">
              {view === "containers" ? <ContainerList /> : <ResourceList />}
            </div>
          </div>
          <TerminalDrawer />
          <StatusBar />
        </main>
        {view === "containers" && <DetailPanel />}
      </div>
      <ComposeDialog open={composeOpen} onOpenChange={setComposeOpen} />
      <CommandPalette />
      <SettingsDialog />
      <UpdateBanner />
      <Toaster />
    </div>
  );
}

export default App;
