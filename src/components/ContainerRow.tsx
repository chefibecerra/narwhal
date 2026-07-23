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
import { Button } from "@/components/ui/button";
import { healthOf } from "@/lib/docker";
import { ServiceGlyph } from "@/lib/services";
import { cn } from "@/lib/utils";
import { useContainers } from "@/stores/containers";
import type { ContainerInfo } from "@/types";

const DOT_BY_STATE: Record<string, string> = {
  running: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]",
  restarting: "bg-amber-400 animate-pulse",
  paused: "bg-amber-400",
};

export function ContainerRow({ container: c }: { container: ContainerInfo }) {
  const run = useContainers((s) => s.run);
  const select = useContainers((s) => s.select);
  const openExec = useContainers((s) => s.openExec);
  const selected = useContainers((s) => s.selectedId === c.id);
  const busy = useContainers((s) => Boolean(s.busy[c.id]));
  const running = c.state === "running";
  const health = healthOf(c.status);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => select(c.id)}
      onKeyDown={(e) => e.key === "Enter" && select(c.id)}
      className={cn(
        "group flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors",
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
            <span className="shrink-0 rounded border border-amber-400/40 px-1 py-px text-[9px] font-medium uppercase tracking-wide text-amber-400">
              unhealthy
            </span>
          )}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground/80">
          {c.image}
        </span>
      </div>
      <div
        className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
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
