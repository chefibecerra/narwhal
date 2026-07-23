import { useEffect, useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogsView } from "@/components/LogsView";
import { PortChips } from "@/components/PortChips";
import { formatBytes } from "@/lib/docker";
import * as ipc from "@/lib/ipc";
import { detectService, ServiceGlyph } from "@/lib/services";
import { cn } from "@/lib/utils";
import { useContainers } from "@/stores/containers";
import type { ContainerStats } from "@/types";

const DOT_BY_STATE: Record<string, string> = {
  running: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]",
  restarting: "bg-amber-400 animate-pulse",
  paused: "bg-amber-400",
};

export function DetailPanel() {
  const container = useContainers((s) =>
    s.containers.find((c) => c.id === s.selectedId),
  );
  const run = useContainers((s) => s.run);
  const openExec = useContainers((s) => s.openExec);
  const busy = useContainers((s) =>
    container ? Boolean(s.busy[container.id]) : false,
  );

  if (!container) {
    return (
      <aside className="flex w-80 shrink-0 items-center justify-center border-l border-border bg-card/20">
        <p className="text-sm font-medium text-muted-foreground/50">
          Sin selección
        </p>
      </aside>
    );
  }

  const c = container;
  const running = c.state === "running";

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-card/20">
      <div className="border-b border-border/60 p-4">
        <div className="flex items-center gap-3">
          <span className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary/60">
            <ServiceGlyph image={c.image} className="size-5" />
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-background",
                DOT_BY_STATE[c.state] ?? "bg-muted-foreground/30",
              )}
            />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold">{c.name}</h2>
            <p className="truncate text-[11px] text-muted-foreground">
              {detectService(c.image)?.label ?? "Contenedor"} · {c.status}
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          {running ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={busy}
                onClick={() => void run(c.id, "stop")}
              >
                <Square className="size-3" /> Detener
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={busy}
                onClick={() => void run(c.id, "restart")}
              >
                <RotateCw className={cn("size-3", busy && "animate-spin")} />{" "}
                Reiniciar
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => openExec(c.id)}
                aria-label="Consola"
              >
                <Terminal className="size-3" />
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={busy}
              onClick={() => void run(c.id, "start")}
            >
              <Play className="size-3" /> Iniciar
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto h-7 text-xs hover:text-destructive"
                disabled={busy}
                aria-label="Eliminar"
              >
                <Trash2 className="size-3" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminar {c.name}</AlertDialogTitle>
                <AlertDialogDescription>
                  Se eliminará el contenedor
                  {running
                    ? " (está en ejecución y se forzará el borrado)"
                    : ""}
                  . Esta acción no se puede deshacer.
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

      <Tabs defaultValue="info" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-4 mt-3 h-8 self-start">
          <TabsTrigger value="info" className="text-xs">
            Info
          </TabsTrigger>
          <TabsTrigger value="logs" className="text-xs">
            Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="info"
          className="min-h-0 flex-1 overflow-y-auto overscroll-none"
        >
          {running && <LiveStats key={c.id} id={c.id} />}
          <dl className="space-y-3 p-4 pt-2 text-xs">
            <InfoRow label="Imagen" value={c.image} mono />
            <InfoRow label="ID" value={c.id.slice(0, 12)} mono />
            {c.composeProject && (
              <InfoRow label="Proyecto" value={c.composeProject} />
            )}
            <InfoRow
              label="Creado"
              value={new Date(c.created * 1000).toLocaleString("es-ES", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            />
            {c.ports.length > 0 && (
              <div>
                <dt className="mb-1 text-muted-foreground">
                  Puertos (host → contenedor)
                </dt>
                <dd className="flex flex-wrap gap-1">
                  <PortChips ports={c.ports} />
                </dd>
              </div>
            )}
          </dl>
        </TabsContent>

        <TabsContent value="logs" className="min-h-0 flex-1 pt-2">
          <LogsView key={c.id} id={c.id} />
        </TabsContent>
      </Tabs>
    </aside>
  );
}

function LiveStats({ id }: { id: string }) {
  const [stats, setStats] = useState<ContainerStats | null>(null);

  useEffect(() => {
    void ipc.startStats(id, setStats);
    return () => void ipc.stopStats(id);
  }, [id]);

  const memPercent =
    stats && stats.memoryLimit > 0
      ? (stats.memoryUsed / stats.memoryLimit) * 100
      : 0;

  return (
    <div className="space-y-2.5 px-4 pt-3">
      <Meter
        label="CPU"
        value={stats ? `${stats.cpuPercent.toFixed(1)} %` : "—"}
        percent={stats ? Math.min(stats.cpuPercent, 100) : 0}
      />
      <Meter
        label="RAM"
        value={
          stats
            ? `${formatBytes(stats.memoryUsed)} / ${formatBytes(stats.memoryLimit)}`
            : "—"
        }
        percent={memPercent}
      />
    </div>
  );
}

function Meter({
  label,
  value,
  percent,
}: {
  label: string;
  value: string;
  percent: number;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums">{value}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            percent > 85 ? "bg-amber-400" : "bg-emerald-400/80",
          )}
          style={{ width: `${Math.max(percent, 1)}%` }}
        />
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="mb-0.5 text-muted-foreground">{label}</dt>
      <dd className={cn("break-all", mono && "font-mono text-[11px]")}>
        {value}
      </dd>
    </div>
  );
}
