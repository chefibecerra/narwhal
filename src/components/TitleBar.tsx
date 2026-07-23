import { cn } from "@/lib/utils";
import { LOCAL_HOST, useContainers } from "@/stores/containers";

/** Franja superior de ancho completo: semáforos + pastilla del host. Nada más. */
export function TitleBar() {
  const status = useContainers((s) => s.status);
  const activeName = useContainers((s) =>
    s.activeHostId === LOCAL_HOST
      ? "Esta máquina"
      : (s.hosts.find((h) => h.id === s.activeHostId)?.name ?? "—"),
  );

  const statusDot =
    status === "connected"
      ? "bg-emerald-400"
      : status === "connecting"
        ? "animate-pulse bg-amber-400"
        : "bg-red-400/70";

  return (
    <div
      data-tauri-drag-region
      className="flex h-12 shrink-0 items-center gap-2 border-b border-border pl-20 pr-3"
    >
      <div className="pointer-events-none flex min-w-0 items-center gap-2 rounded-lg bg-secondary/70 px-2.5 py-1">
        <span className={cn("size-1.5 shrink-0 rounded-full", statusDot)} />
        <span className="truncate text-xs font-medium">{activeName}</span>
      </div>
    </div>
  );
}
