import { openUrl } from "@tauri-apps/plugin-opener";
import { Play, RotateCw, Square, Trash2 } from "lucide-react";

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
import { detectService, ServiceGlyph } from "@/lib/services";
import { cn } from "@/lib/utils";
import { useContainers } from "@/stores/containers";

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

  // docker repite cada puerto por IP (ipv4/ipv6): deduplicar por etiqueta
  const ports = new Map<string, number | null>();
  for (const p of c.ports) {
    const label = p.publicPort
      ? `${p.publicPort}→${p.privatePort}`
      : `${p.privatePort}/${p.protocol}`;
    if (!ports.has(label)) ports.set(label, p.publicPort);
  }

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
          <dl className="space-y-3 p-4 text-xs">
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
            {ports.size > 0 && (
              <div>
                <dt className="mb-1 text-muted-foreground">Puertos</dt>
                <dd className="flex flex-wrap gap-1">
                  {[...ports.entries()].map(([label, publicPort]) =>
                    publicPort ? (
                      <button
                        key={label}
                        onClick={() =>
                          void openUrl(`http://localhost:${publicPort}`)
                        }
                        title={`Abrir localhost:${publicPort}`}
                        className="rounded-md border border-border bg-secondary/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-emerald-400/40 hover:text-foreground"
                      >
                        {label}
                      </button>
                    ) : (
                      <span
                        key={label}
                        className="rounded-md bg-secondary/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/70"
                      >
                        {label}
                      </span>
                    ),
                  )}
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
