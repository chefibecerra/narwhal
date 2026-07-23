import { useEffect } from "react";

import { ContainerList } from "@/components/ContainerList";
import { DetailPanel } from "@/components/DetailPanel";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { TerminalDrawer } from "@/components/TerminalDrawer";
import { Toaster } from "@/components/ui/sonner";
import { LOCAL_HOST, useContainers } from "@/stores/containers";

function App() {
  const status = useContainers((s) => s.status);
  const connectTo = useContainers((s) => s.connectTo);
  const loadHosts = useContainers((s) => s.loadHosts);
  const refresh = useContainers((s) => s.refresh);

  useEffect(() => {
    void loadHosts();
    void connectTo(LOCAL_HOST);
  }, [connectTo, loadHosts]);

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
          <ContainerList />
        </div>
        <TerminalDrawer />
      </main>
      <DetailPanel />
      <Toaster />
    </div>
  );
}

export default App;
