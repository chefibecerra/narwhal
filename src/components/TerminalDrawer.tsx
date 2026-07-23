import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { Terminal as TerminalIcon, X } from "lucide-react";

import "@xterm/xterm/css/xterm.css";

import { Button } from "@/components/ui/button";
import * as ipc from "@/lib/ipc";
import { useContainers } from "@/stores/containers";

export function TerminalDrawer() {
  const execId = useContainers((s) => s.execId);
  const name = useContainers(
    (s) => s.containers.find((c) => c.id === s.execId)?.name ?? "",
  );
  const closeExec = useContainers((s) => s.closeExec);
  const holderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const holder = holderRef.current;
    if (!execId || !holder) return;

    const sessionId = crypto.randomUUID();
    const term = new Terminal({
      fontSize: 12,
      fontFamily: '"SF Mono", ui-monospace, Menlo, monospace',
      cursorBlink: true,
      allowTransparency: true,
      theme: {
        background: "#00000000",
        selectionBackground: "#ffffff33",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(holder);
    fit.fit();

    void ipc.execStart(sessionId, execId, term.cols, term.rows, (data) => {
      term.write(new Uint8Array(data));
    });
    const input = term.onData((d) => void ipc.execWrite(sessionId, d));
    const observer = new ResizeObserver(() => {
      fit.fit();
      void ipc.execResize(sessionId, term.cols, term.rows);
    });
    observer.observe(holder);
    const unlisten = listen<string>("exec-closed", (e) => {
      if (e.payload === sessionId) {
        term.write("\r\n\x1b[90m[sesión terminada]\x1b[0m\r\n");
      }
    });
    term.focus();

    return () => {
      observer.disconnect();
      input.dispose();
      void unlisten.then((fn) => fn());
      void ipc.execStop(sessionId);
      term.dispose();
    };
  }, [execId]);

  if (!execId) return null;

  return (
    <div className="flex h-72 shrink-0 flex-col border-t border-border bg-card/50">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <TerminalIcon className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Consola · {name}</span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-7"
          onClick={closeExec}
          aria-label="Cerrar consola"
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <div ref={holderRef} className="min-h-0 flex-1 px-2 py-1" />
    </div>
  );
}
