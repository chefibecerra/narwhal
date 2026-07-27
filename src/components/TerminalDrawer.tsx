import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { Terminal as TerminalIcon, X } from "lucide-react";

import "@xterm/xterm/css/xterm.css";

import { Button } from "@/components/ui/button";
import * as ipc from "@/lib/ipc";
import { LOCAL_HOST, useContainers } from "@/stores/containers";

export function TerminalDrawer() {
  const term = useContainers((s) => s.term);
  const title = useContainers((s) => {
    const target = s.term;
    if (target?.kind === "exec") {
      const name = s.containers.find((c) => c.id === target.id)?.name ?? "";
      return `Consola · ${name}`;
    }
    if (target?.kind === "host") {
      const host =
        s.activeHostId === LOCAL_HOST
          ? null
          : s.hosts.find((h) => h.id === s.activeHostId);
      return host ? `SSH · ${host.username}@${host.hostname}` : "SSH";
    }
    return "";
  });
  const closeTerm = useContainers((s) => s.closeTerm);
  const holderRef = useRef<HTMLDivElement>(null);

  // clave estable del objetivo para remontar la sesión al cambiar
  const targetKey = term
    ? term.kind === "exec"
      ? `exec:${term.id}`
      : "host"
    : null;

  useEffect(() => {
    const holder = holderRef.current;
    if (!targetKey || !holder) return;

    const sessionId = crypto.randomUUID();
    const terminal = new Terminal({
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
    terminal.loadAddon(fit);
    terminal.open(holder);
    fit.fit();

    const write = (data: ArrayBuffer) => terminal.write(new Uint8Array(data));
    if (targetKey === "host") {
      void ipc.hostShellStart(sessionId, terminal.cols, terminal.rows, write);
    } else {
      const containerId = targetKey.slice("exec:".length);
      void ipc.execStart(
        sessionId,
        containerId,
        terminal.cols,
        terminal.rows,
        write,
      );
    }

    const input = terminal.onData((d) => void ipc.execWrite(sessionId, d));
    const observer = new ResizeObserver(() => {
      fit.fit();
      void ipc.execResize(sessionId, terminal.cols, terminal.rows);
    });
    observer.observe(holder);
    const unlisten = listen<string>("exec-closed", (e) => {
      if (e.payload === sessionId) {
        terminal.write("\r\n\x1b[90m[sesión terminada]\x1b[0m\r\n");
      }
    });
    terminal.focus();

    return () => {
      observer.disconnect();
      input.dispose();
      void unlisten.then((fn) => fn());
      void ipc.execStop(sessionId);
      terminal.dispose();
    };
  }, [targetKey]);

  if (!term) return null;

  return (
    <div className="flex h-72 shrink-0 animate-in flex-col border-t border-border bg-card/50 duration-300 fade-in slide-in-from-bottom-4">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <TerminalIcon className="size-3.5 text-muted-foreground" />
        <span className="truncate text-xs font-medium">{title}</span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-7"
          onClick={closeTerm}
          aria-label="Cerrar terminal"
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <div ref={holderRef} className="min-h-0 flex-1 px-2 py-1" />
    </div>
  );
}
