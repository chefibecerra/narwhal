import { useEffect, useMemo, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import * as ipc from "@/lib/ipc";
import { cn } from "@/lib/utils";
import type { LogChunk } from "@/types";

const MAX_LINES = 5000;
const TAIL = 200;

export function LogsView({ id }: { id: string }) {
  const [lines, setLines] = useState<LogChunk[]>([]);
  const [filter, setFilter] = useState("");
  const viewRef = useRef<HTMLDivElement>(null);
  // auto-scroll pegado al final, salvo que el usuario suba a leer
  const stickRef = useRef(true);

  useEffect(() => {
    setLines([]);
    setFilter("");
    stickRef.current = true;

    // acumula por frame: re-renderizar por cada línea mata el render
    // con contenedores ruidosos
    let pending: LogChunk[] = [];
    let raf = 0;
    const flush = () => {
      raf = 0;
      const batch = pending;
      pending = [];
      setLines((prev) => [...prev, ...batch].slice(-MAX_LINES));
    };

    void ipc.startLogs(id, TAIL, (chunk) => {
      for (const line of chunk.line.split("\n")) {
        if (line.length) pending.push({ line, stream: chunk.stream });
      }
      if (!raf) raf = requestAnimationFrame(flush);
    });

    return () => {
      cancelAnimationFrame(raf);
      void ipc.stopLogs(id);
    };
  }, [id]);

  useEffect(() => {
    const el = viewRef.current;
    if (stickRef.current && el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const visible = useMemo(() => {
    if (!filter) return lines;
    const needle = filter.toLowerCase();
    return lines.filter((l) => l.line.toLowerCase().includes(needle));
  }, [lines, filter]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-3 pb-2">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Buscar en los logs…"
          className="h-7 text-xs"
        />
      </div>
      <div
        ref={viewRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="flex-1 overflow-y-auto overscroll-none px-3 pb-3 font-mono text-[11px] leading-relaxed"
      >
        {visible.map((l, i) => (
          <div
            key={i}
            className={cn(
              "whitespace-pre-wrap break-all",
              l.stream === "stderr" && "text-red-300/90",
            )}
          >
            {l.line}
          </div>
        ))}
        {!visible.length && (
          <div className="text-muted-foreground">
            Sin líneas{filter ? " que coincidan" : ""}.
          </div>
        )}
      </div>
    </div>
  );
}
