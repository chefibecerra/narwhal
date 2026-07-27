import { useEffect, useRef, useState } from "react";
import { Play, RotateCw, Square, Terminal, Trash2 } from "lucide-react";

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
import { PortChips } from "@/components/PortChips";
import { Button } from "@/components/ui/button";
import { formatBytes, healthOf } from "@/lib/docker";
import { ServiceGlyph } from "@/lib/services";
import { cn } from "@/lib/utils";
import { useContainers } from "@/stores/containers";
import type { ContainerInfo } from "@/types";

const DOT_BY_STATE: Record<string, string> = {
  running: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]",
  restarting: "bg-amber-400 animate-pulse",
  paused: "bg-amber-400",
};

export function ContainerRow({
  container: c,
  index = 0,
}: {
  container: ContainerInfo;
  /** posición en el grupo, para escalonar la animación de entrada */
  index?: number;
}) {
  const run = useContainers((s) => s.run);
  const select = useContainers((s) => s.select);
  const openExec = useContainers((s) => s.openExec);
  const selected = useContainers((s) => s.selectedId === c.id);
  const busy = useContainers((s) => Boolean(s.busy[c.id]));
  const stats = useContainers((s) => s.rowStats[c.id]);
  const running = c.state === "running";
  const health = healthOf(c.status);

  // onda expansiva de un ciclo cuando el estado cambia (arrancó / se paró)
  const prevState = useRef(c.state);
  const [ping, setPing] = useState(false);
  useEffect(() => {
    if (prevState.current !== c.state) {
      prevState.current = c.state;
      setPing(true);
      const timer = setTimeout(() => setPing(false), 700);
      return () => clearTimeout(timer);
    }
  }, [c.state]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => select(c.id)}
      onKeyDown={(e) => e.key === "Enter" && select(c.id)}
      style={{
        animationDelay: `${Math.min(index, 12) * 25}ms`,
        animationFillMode: "backwards",
      }}
      className={cn(
        "group flex cursor-default animate-in items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-300 fade-in slide-in-from-bottom-1 active:scale-[0.99]",
        selected ? "bg-accent" : "hover:bg-accent/40",
      )}
    >
      <span className="relative flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary/60">
        <ServiceGlyph image={c.image} className="size-[18px]" />
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-background",
            health === "unhealthy"
              ? "bg-amber-400"
              : (DOT_BY_STATE[c.state] ?? "bg-muted-foreground/30"),
          )}
        />
        {ping && (
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 size-2 animate-ping rounded-full",
              running ? "bg-emerald-400" : "bg-muted-foreground/60",
            )}
          />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "truncate text-[13px] font-medium",
              !running && "text-muted-foreground",
            )}
          >
            {c.name}
          </span>
          {health === "unhealthy" && (
            <span className="hidden shrink-0 animate-in rounded border border-amber-400/40 px-1 py-px text-[9px] font-medium uppercase tracking-wide text-amber-400 duration-300 zoom-in sm:inline">
              unhealthy
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground/70">
          {c.image}
        </span>
      </div>
      {/* stats y puertos a la derecha; en hover ceden el sitio a las acciones.
          En estrechez sobrevive el nombre: stats solo en xl, puertos desde sm */}
      <div className="ml-auto flex shrink-0 items-center gap-2 group-hover:hidden">
        {running && stats && (
          <span
            className={cn(
              "hidden font-mono text-[10px] tabular-nums xl:inline",
              stats.cpuPercent > 80
                ? "text-amber-400"
                : "text-muted-foreground/60",
            )}
          >
            {stats.cpuPercent.toFixed(1)}% · {formatBytes(stats.memoryUsed)}
          </span>
        )}
        <span className="hidden items-center gap-1.5 sm:flex">
          <PortChips ports={c.ports} />
        </span>
      </div>
      <div
        className="ml-auto hidden shrink-0 items-center gap-1 group-hover:flex"
        onClick={(e) => e.stopPropagation()}
      >
        {running ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => openExec(c.id)}
              aria-label="Consola"
            >
              <Terminal className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={busy}
              onClick={() => void run(c.id, "restart")}
              aria-label="Reiniciar"
            >
              <RotateCw className={cn("size-3.5", busy && "animate-spin")} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={busy}
              onClick={() => void run(c.id, "stop")}
              aria-label="Detener"
            >
              <Square className="size-3.5" />
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={busy}
            onClick={() => void run(c.id, "start")}
            aria-label="Iniciar"
          >
            <Play className="size-3.5" />
          </Button>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 hover:text-destructive"
              disabled={busy}
              aria-label="Eliminar"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar {c.name}</AlertDialogTitle>
              <AlertDialogDescription>
                Se eliminará el contenedor
                {running ? " (está en ejecución y se forzará el borrado)" : ""}.
                Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => void run(c.id, "remove")}>
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
