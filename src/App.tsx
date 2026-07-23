import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

import { CommandPalette } from "@/components/CommandPalette";
import { ComposeDialog } from "@/components/ComposeDialog";
import { ContainerList } from "@/components/ContainerList";
import { DetailPanel } from "@/components/DetailPanel";
import { Header } from "@/components/Header";
import { ResourceList } from "@/components/ResourceList";
import { Sidebar } from "@/components/Sidebar";
import { TerminalDrawer } from "@/components/TerminalDrawer";
import { Toaster } from "@/components/ui/sonner";
import { LOCAL_HOST, useContainers } from "@/stores/containers";

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

  // refresco periódico mientras haya conexión
  useEffect(() => {
    if (status !== "connected") return;
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [status, refresh]);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <Header />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-none">
          <div key={view} className="animate-in duration-200 fade-in">
            {view === "containers" ? <ContainerList /> : <ResourceList />}
          </div>
        </div>
        <TerminalDrawer />
      </main>
      {view === "containers" && <DetailPanel />}
      <ComposeDialog open={composeOpen} onOpenChange={setComposeOpen} />
      <CommandPalette />
      <Toaster />
    </div>
  );
}

export default App;
