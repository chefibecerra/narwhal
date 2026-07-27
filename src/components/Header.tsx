import { useState } from "react";
import { Eraser, RefreshCw, Rocket } from "lucide-react";

import { cn } from "@/lib/utils";

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
  const [refreshing, setRefreshing] = useState(false);

  const manualRefresh = async () => {
    setRefreshing(true);
    await refresh();
    // que el giro se aprecie aunque la respuesta sea instantánea
    setTimeout(() => setRefreshing(false), 400);
  };
  const setComposeOpen = useContainers((s) => s.setComposeOpen);
  const prune = useContainers((s) => s.prune);

  const connected = status === "connected";

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-5">
      <div className="pointer-events-none flex min-w-0 items-baseline gap-2.5">
        <h1 className="truncate text-[15px] font-semibold tracking-tight">
          {TITLES[view]}
        </h1>
        <p className="hidden truncate text-xs text-muted-foreground sm:block">
          {view === "containers" ? `${running} en ejecución` : `${count} en total`}
        </p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar…"
          className="h-7 w-28 border-transparent bg-secondary/40 text-xs transition-colors focus-visible:bg-secondary/70 md:w-44"
        />
        {view === "containers" ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
            disabled={!connected}
            onClick={() => setComposeOpen(true)}
          >
            <Rocket className="size-3.5" />
            <span className="hidden md:inline">Compose</span>
          </Button>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                disabled={!connected}
              >
                <Eraser className="size-3.5" />
                <span className="hidden md:inline">Limpiar</span>
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
          onClick={() => void manualRefresh()}
          disabled={!connected}
          aria-label="Actualizar"
        >
          <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
        </Button>
      </div>
    </header>
  );
}
