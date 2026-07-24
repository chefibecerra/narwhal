import { useState } from "react";
import {
  ChevronRight,
  Container,
  Download,
  FileCode2,
  RotateCw,
  Square,
  Trash2,
} from "lucide-react";

import { ContainerRow } from "@/components/ContainerRow";
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
import { cn } from "@/lib/utils";
import { useContainers } from "@/stores/containers";
import type { ContainerInfo } from "@/types";

/** en ejecución primero, después por nombre */
function sortContainers(items: ContainerInfo[]): ContainerInfo[] {
  return [...items].sort((a, b) => {
    const runA = a.state === "running" ? 0 : 1;
    const runB = b.state === "running" ? 0 : 1;
    return runA - runB || a.name.localeCompare(b.name);
  });
}

export function ContainerList() {
  const status = useContainers((s) => s.status);
  const error = useContainers((s) => s.error);
  const containers = useContainers((s) => s.containers);
  const activeHostId = useContainers((s) => s.activeHostId);
  const connectTo = useContainers((s) => s.connectTo);
  const search = useContainers((s) => s.search);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  if (status === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <Container className="size-8 text-muted-foreground/40" />
        <p className="text-sm font-medium">Docker no está disponible</p>
        <p className="max-w-md text-xs text-muted-foreground">{error}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void connectTo(activeHostId)}
        >
          Reintentar
        </Button>
      </div>
    );
  }

  const query = search.trim().toLowerCase();
  const visible = query
    ? containers.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.image.toLowerCase().includes(query),
      )
    : containers;

  if (!visible.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8">
        <Container className="size-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          {status === "connecting"
            ? "Conectando con Docker…"
            : query
              ? "Nada coincide con la búsqueda."
              : "No hay contenedores."}
        </p>
      </div>
    );
  }

  const projects = new Map<string, ContainerInfo[]>();
  const loose: ContainerInfo[] = [];
  for (const c of visible) {
    if (c.composeProject) {
      const list = projects.get(c.composeProject) ?? [];
      list.push(c);
      projects.set(c.composeProject, list);
    } else {
      loose.push(c);
    }
  }

  const toggle = (name: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <div className="px-3 py-2">
      {[...projects.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, items]) => (
          <Group
            key={name}
            title={name}
            items={sortContainers(items)}
            project
            // con búsqueda activa se expande todo para ver los resultados
            open={Boolean(query) || !collapsed.has(name)}
            onToggle={() => toggle(name)}
          />
        ))}
      {loose.length > 0 && (
        <Group
          title="Sueltos"
          items={sortContainers(loose)}
          open={Boolean(query) || !collapsed.has("__loose__")}
          onToggle={() => toggle("__loose__")}
        />
      )}
    </div>
  );
}

function Group({
  title,
  items,
  open,
  onToggle,
  project = false,
}: {
  title: string;
  items: ContainerInfo[];
  open: boolean;
  onToggle: () => void;
  /** grupo compose real: las acciones van vía `docker compose -p` */
  project?: boolean;
}) {
  const run = useContainers((s) => s.run);
  const composeAction = useContainers((s) => s.composeAction);
  const composeUpdateProject = useContainers((s) => s.composeUpdateProject);
  const openComposeFor = useContainers((s) => s.openComposeFor);
  const running = items.filter((c) => c.state === "running");

  const stopAll = async () => {
    if (project) return composeAction(title, "stop");
    for (const c of running) await run(c.id, "stop");
  };

  const removeAll = async () => {
    // down también limpia la red del proyecto, no solo los contenedores
    if (project) return composeAction(title, "down");
    for (const c of items) await run(c.id, "remove");
  };

  return (
    <section className="mb-1">
      <div className="group/header sticky top-0 z-10 flex w-full items-center gap-2 rounded-lg bg-background px-2 py-1 transition-colors hover:bg-secondary">
        <button
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
        >
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
          />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
            {title}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/header:opacity-100">
          {project && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => void openComposeFor(title)}
                aria-label={`Ver YAML de ${title}`}
                title="Ver / editar YAML"
              >
                <FileCode2 className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => void composeUpdateProject(title)}
                aria-label={`Actualizar ${title}`}
                title="Actualizar (pull + up)"
              >
                <Download className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => void composeAction(title, "restart")}
                aria-label={`Reiniciar ${title}`}
              >
                <RotateCw className="size-3.5" />
              </Button>
            </>
          )}
          {running.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => void stopAll()}
              aria-label={`Detener todo ${title}`}
            >
              <Square className="size-3.5" />
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 hover:text-destructive"
                aria-label={`Eliminar todo ${title}`}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminar {title}</AlertDialogTitle>
                <AlertDialogDescription>
                  {project
                    ? `docker compose down: se detendrán y eliminarán los ${items.length} contenedores del proyecto y su red.`
                    : `Se eliminarán los ${items.length} contenedores del grupo${
                        running.length > 0
                          ? ` (${running.length} en ejecución, se forzará el borrado)`
                          : ""
                      }.`}{" "}
                  Esta acción no se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => void removeAll()}>
                  Eliminar todo
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {running.length}/{items.length}
        </span>
      </div>
      {open && (
        <div className="ml-4 animate-in border-l border-border/60 pl-2 duration-200 fade-in slide-in-from-top-1">
          {items.map((c, i) => (
            <ContainerRow key={c.id} container={c} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}
