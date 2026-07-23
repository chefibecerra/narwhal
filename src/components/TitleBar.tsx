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
      className="relative h-12 shrink-0 border-b border-border"
    >
      {/* posición absoluta calzada con los semáforos nativos: su centro real
          queda a ~18px (medido en pantalla, no donde dice la doc); misma
          geometría que el mockup de la web: hueco 14px, padding 5x12, radio 7 */}
      <div className="pointer-events-none absolute left-[82px] top-[8px] flex max-w-[50%] items-center gap-[7px] rounded-[7px] bg-secondary px-3 py-[5px]">
        <span className={cn("size-1.5 shrink-0 rounded-full", statusDot)} />
        <span className="truncate text-xs font-medium leading-none">
          {activeName}
        </span>
      </div>
    </div>
  );
}
