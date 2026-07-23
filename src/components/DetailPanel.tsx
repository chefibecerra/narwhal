import { useEffect, useState } from "react";
import { Rocket } from "lucide-react";
import { Play, RotateCw, Square, Terminal, Trash2 } from "lucide-react";

import logo from "@/assets/narwhal.png";
import { healthOf } from "@/lib/docker";
import { LOCAL_HOST } from "@/stores/containers";

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
    return <HostOverview />;
  }

  const c = container;
  const running = c.state === "running";

  return (
    <aside
      key={c.id}
      className="flex w-80 shrink-0 animate-in flex-col border-l border-border bg-card/20 duration-200 fade-in slide-in-from-right-2"
    >
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

/** sin selección: el panel se gana la vida como resumen del host activo */
function HostOverview() {
  const docker = useContainers((s) => s.docker);
  const containers = useContainers((s) => s.containers);
  const hostName = useContainers((s) =>
    s.activeHostId === LOCAL_HOST
      ? "Esta máquina"
      : (s.hosts.find((h) => h.id === s.activeHostId)?.name ?? "—"),
  );
  const setComposeOpen = useContainers((s) => s.setComposeOpen);

  const running = containers.filter((c) => c.state === "running").length;
  const stopped = containers.length - running;
  const unhealthy = containers.filter(
    (c) => healthOf(c.status) === "unhealthy",
  ).length;
  const projects = new Set(
    containers.map((c) => c.composeProject).filter(Boolean),
  ).size;

  return (
    <aside className="flex w-80 shrink-0 animate-in flex-col border-l border-border bg-card/20 duration-300 fade-in">
      <div className="flex flex-1 flex-col items-center justify-center gap-5 p-6">
        <img
          src={logo}
          alt=""
          className="animate-float size-14 rounded-2xl opacity-90"
        />
        <div className="text-center">
          <h2 className="text-sm font-semibold">{hostName}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {docker
              ? `Docker ${docker.version} · ${docker.os} · API ${docker.apiVersion}`
              : "Sin conexión"}
          </p>
        </div>

        <div className="grid w-full grid-cols-3 gap-2">
          <StatTile value={running} label="activos" accent="text-emerald-400" />
          <StatTile value={stopped} label="parados" />
          <StatTile
            value={unhealthy}
            label="unhealthy"
            accent={unhealthy > 0 ? "text-amber-400" : undefined}
          />
        </div>
        {projects > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {projects} {projects === 1 ? "proyecto compose" : "proyectos compose"}
          </p>
        )}

        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setComposeOpen(true)}
        >
          <Rocket className="size-3" /> Desplegar Compose
        </Button>

        <p className="text-center text-[10px] leading-relaxed text-muted-foreground/50">
          Selecciona un contenedor para ver
          <br />
          su detalle, stats y logs
        </p>
      </div>
    </aside>
  );
}

function StatTile({
  value,
  label,
  accent,
}: {
  value: number;
  label: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/20 px-2 py-3 text-center">
      <p className={cn("text-lg font-semibold tabular-nums", accent)}>
        {value}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
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
