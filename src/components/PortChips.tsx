import { openUrl } from "@tauri-apps/plugin-opener";

import { LOCAL_HOST, useContainers } from "@/stores/containers";
import type { PortMapping } from "@/types";

/** docker repite cada puerto por IP (ipv4/ipv6): deduplicar */
function uniquePorts(ports: PortMapping[]): PortMapping[] {
  const map = new Map<string, PortMapping>();
  for (const p of ports) {
    const key = p.publicPort
      ? `${p.publicPort}:${p.privatePort}`
      : `${p.privatePort}/${p.protocol}`;
    if (!map.has(key)) map.set(key, p);
  }
  return [...map.values()];
}

/**
 * Puertos de un contenedor. El publicado (lado host) va resaltado y es
 * clicable: abre la dirección del host activo — localhost en local, la IP
 * del servidor en remoto. Los no publicados solo existen dentro del
 * contenedor y se muestran atenuados.
 */
export function PortChips({ ports }: { ports: PortMapping[] }) {
  const hostAddr = useContainers((s) =>
    s.activeHostId === LOCAL_HOST
      ? "localhost"
      : (s.hosts.find((h) => h.id === s.activeHostId)?.hostname ?? "localhost"),
  );

  return (
    <>
      {uniquePorts(ports).map((p) =>
        p.publicPort ? (
          <button
            key={`${p.publicPort}:${p.privatePort}`}
            onClick={(e) => {
              e.stopPropagation();
              void openUrl(`http://${hostAddr}:${p.publicPort}`);
            }}
            title={`${p.publicPort} en ${hostAddr} → ${p.privatePort} del contenedor · clic para abrir`}
            className="shrink-0 rounded-md border border-border bg-secondary/50 px-1.5 py-px font-mono text-[10px] transition-colors hover:border-emerald-400/40"
          >
            <span className="text-foreground">{p.publicPort}</span>
            <span className="text-muted-foreground/60">→{p.privatePort}</span>
          </button>
        ) : (
          <span
            key={`${p.privatePort}/${p.protocol}`}
            title={`Puerto ${p.privatePort} interno del contenedor (sin publicar)`}
            className="shrink-0 rounded-md bg-secondary/50 px-1.5 py-px font-mono text-[10px] text-muted-foreground/60"
          >
            {p.privatePort}/{p.protocol}
          </span>
        ),
      )}
    </>
  );
}
