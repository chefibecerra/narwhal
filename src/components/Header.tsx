import { Eraser, RefreshCw, Rocket } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useContainers } from "@/stores/containers";

const TITLES = {
  containers: "Contenedores",
  images: "Imágenes",
  volumes: "Volúmenes",
  networks: "Redes",
} as const;

export function Header() {
  const status = useContainers((s) => s.status);
  const view = useContainers((s) => s.view);
  const running = useContainers(
    (s) => s.containers.filter((c) => c.state === "running").length,
  );
  const count = useContainers((s) =>
    s.view === "images"
      ? s.images.length
      : s.view === "volumes"
        ? s.volumes.length
        : s.networks.length,
  );
  const search = useContainers((s) => s.search);
  const setSearch = useContainers((s) => s.setSearch);
  const refresh = useContainers((s) => s.refresh);
  const setComposeOpen = useContainers((s) => s.setComposeOpen);
  const prune = useContainers((s) => s.prune);

  const connected = status === "connected";

  return (
    <header
      data-tauri-drag-region
      className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4"
    >
      <div className="pointer-events-none">
        <h1 className="text-sm font-semibold leading-tight">{TITLES[view]}</h1>
        <p className="text-[11px] leading-tight text-muted-foreground">
          {view === "containers" ? `${running} en ejecución` : `${count} en total`}
        </p>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar…"
          className="h-7 w-44 text-xs"
        />
        {view === "containers" ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={!connected}
            onClick={() => setComposeOpen(true)}
          >
            <Rocket className="size-3.5" /> Compose
          </Button>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={!connected}
              >
                <Eraser className="size-3.5" /> Limpiar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Limpiar {TITLES[view].toLowerCase()} sin uso
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Equivale a `docker {view === "images" ? "image" : view === "volumes" ? "volume" : "network"} prune`:
                  elimina lo que ningún contenedor está usando. No se puede
                  deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => void prune()}>
                  Limpiar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => void refresh()}
          disabled={!connected}
          aria-label="Actualizar"
        >
          <RefreshCw className="size-3.5" />
        </Button>
      </div>
    </header>
  );
}
