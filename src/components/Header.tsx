import { useState } from "react";
import { RefreshCw, Rocket } from "lucide-react";

import { ComposeDialog } from "@/components/ComposeDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useContainers } from "@/stores/containers";

export function Header() {
  const status = useContainers((s) => s.status);
  const running = useContainers(
    (s) => s.containers.filter((c) => c.state === "running").length,
  );
  const search = useContainers((s) => s.search);
  const setSearch = useContainers((s) => s.setSearch);
  const refresh = useContainers((s) => s.refresh);
  const [composeOpen, setComposeOpen] = useState(false);

  return (
    <header
      data-tauri-drag-region
      className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4"
    >
      <div className="pointer-events-none">
        <h1 className="text-sm font-semibold leading-tight">Contenedores</h1>
        <p className="text-[11px] leading-tight text-muted-foreground">
          {running} en ejecución
        </p>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar…"
          className="h-7 w-44 text-xs"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={status !== "connected"}
          onClick={() => setComposeOpen(true)}
        >
          <Rocket className="size-3.5" /> Compose
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => void refresh()}
          disabled={status !== "connected"}
          aria-label="Actualizar"
        >
          <RefreshCw className="size-3.5" />
        </Button>
      </div>

      <ComposeDialog open={composeOpen} onOpenChange={setComposeOpen} />
    </header>
  );
}
