import { cn } from "@/lib/utils";
import { LOCAL_HOST, useContainers } from "@/stores/containers";

export function StatusBar() {
  const status = useContainers((s) => s.status);
  const docker = useContainers((s) => s.docker);
  const hostLabel = useContainers((s) => {
    if (s.activeHostId === LOCAL_HOST) return "local";
    const host = s.hosts.find((h) => h.id === s.activeHostId);
    return host ? `${host.username}@${host.hostname}` : "—";
  });

  return (
    <footer className="flex h-9 shrink-0 items-center justify-between border-t border-border px-4 text-[11px]">
      <span
        className={cn(
          "flex items-center gap-1.5",
          status === "connected"
            ? "text-emerald-400"
            : status === "connecting"
              ? "text-amber-400"
              : "text-muted-foreground",
        )}
      >
        <span
          className={cn(
            "size-1.5 rounded-full",
            status === "connected"
              ? "bg-emerald-400"
              : status === "connecting"
                ? "animate-pulse bg-amber-400"
                : "bg-muted-foreground/50",
          )}
        />
        {status === "connected"
          ? "conectado"
          : status === "connecting"
            ? "conectando…"
            : "sin conexión"}
      </span>
      <span className="font-mono text-muted-foreground">
        {docker ? `Docker ${docker.version} · ${hostLabel}` : hostLabel}
      </span>
    </footer>
  );
}
