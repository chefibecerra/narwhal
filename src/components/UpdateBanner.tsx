import { ArrowUpCircle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useUpdater } from "@/stores/updater";

/**
 * Aviso discreto abajo a la derecha cuando hay versión nueva. No bloquea:
 * el usuario decide cuándo actualizar.
 */
export function UpdateBanner() {
  const { phase, version, notes, progress, error } = useUpdater();
  const install = useUpdater((s) => s.install);
  const dismiss = useUpdater((s) => s.dismiss);

  if (phase === "idle") return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] w-80 animate-in rounded-xl border border-border bg-popover/95 p-4 shadow-xl backdrop-blur duration-300 fade-in slide-in-from-bottom-4">
      <div className="flex items-start gap-3">
        <ArrowUpCircle className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium">
            {phase === "ready"
              ? "Reiniciando…"
              : phase === "error"
                ? "No se pudo actualizar"
                : `Narwhal ${version} disponible`}
          </p>

          {phase === "available" && notes && (
            <p className="mt-1 line-clamp-3 text-[11px] leading-4 text-muted-foreground">
              {notes}
            </p>
          )}

          {phase === "downloading" && (
            <div className="mt-2">
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Descargando… {progress}%
              </p>
            </div>
          )}

          {phase === "error" && (
            <p className="mt-1 text-[11px] leading-4 text-destructive">
              {error}
            </p>
          )}

          {(phase === "available" || phase === "error") && (
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                className="h-7 rounded-full px-4 text-xs"
                onClick={() => void install()}
              >
                {phase === "error" ? "Reintentar" : "Actualizar ahora"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 rounded-full px-3 text-xs text-muted-foreground"
                onClick={dismiss}
              >
                Después
              </Button>
            </div>
          )}
        </div>

        {phase !== "downloading" && phase !== "ready" && (
          <button
            className="text-muted-foreground hover:text-foreground"
            onClick={dismiss}
            aria-label="Cerrar aviso"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
