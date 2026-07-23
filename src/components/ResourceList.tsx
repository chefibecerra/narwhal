import { HardDrive, Layers, Network, Trash2 } from "lucide-react";

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
import { formatBytes } from "@/lib/docker";
import { useContainers } from "@/stores/containers";

interface Row {
  key: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  meta: string;
  /** id con el que se elimina; null = no se puede eliminar */
  deleteId: string | null;
}

export function ResourceList() {
  const view = useContainers((s) => s.view);
  const images = useContainers((s) => s.images);
  const volumes = useContainers((s) => s.volumes);
  const networks = useContainers((s) => s.networks);
  const search = useContainers((s) => s.search);
  const removeResource = useContainers((s) => s.removeResource);

  let rows: Row[] = [];
  if (view === "images") {
    rows = images.map((i) => ({
      key: i.id,
      icon: <Layers className="size-[18px] text-muted-foreground" />,
      title: i.tags[0] ?? i.id.replace("sha256:", "").slice(0, 12),
      subtitle:
        i.tags.length > 1
          ? `+${i.tags.length - 1} tags · ${i.id.replace("sha256:", "").slice(0, 12)}`
          : i.id.replace("sha256:", "").slice(0, 12),
      meta: `${formatBytes(i.size)} · ${new Date(i.created * 1000).toLocaleDateString("es-ES")}`,
      deleteId: i.tags[0] ?? i.id,
    }));
  } else if (view === "volumes") {
    rows = volumes.map((v) => ({
      key: v.name,
      icon: <HardDrive className="size-[18px] text-muted-foreground" />,
      title: v.name,
      subtitle: v.driver,
      meta: v.createdAt
        ? new Date(v.createdAt).toLocaleDateString("es-ES")
        : "",
      deleteId: v.name,
    }));
  } else if (view === "networks") {
    rows = networks.map((n) => ({
      key: n.id,
      icon: <Network className="size-[18px] text-muted-foreground" />,
      title: n.name,
      subtitle: `${n.driver} · ${n.scope}`,
      meta: n.builtin ? "integrada" : "",
      deleteId: n.builtin ? null : n.id,
    }));
  }

  const query = search.trim().toLowerCase();
  if (query) {
    rows = rows.filter(
      (r) =>
        r.title.toLowerCase().includes(query) ||
        r.subtitle.toLowerCase().includes(query),
    );
  }

  if (!rows.length) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">
          {query ? "Nada coincide con la búsqueda." : "No hay nada aquí."}
        </p>
      </div>
    );
  }

  return (
    <div className="px-3 py-2">
      {rows.map((r) => (
        <div
          key={r.key}
          className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-accent/40"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary/60">
            {r.icon}
          </span>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">
              {r.title}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground/80">
              {r.subtitle}
            </span>
          </div>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {r.meta}
          </span>
          {r.deleteId && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 opacity-0 transition-opacity hover:text-destructive focus-within:opacity-100 group-hover:opacity-100"
                  aria-label={`Eliminar ${r.title}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Eliminar {r.title}</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción no se puede deshacer. Si está en uso por un
                    contenedor, Docker rechazará el borrado.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => void removeResource(view, r.deleteId!)}
                  >
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      ))}
    </div>
  );
}
