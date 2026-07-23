import { useState } from "react";
import {
  Container,
  HardDrive,
  Laptop,
  Layers,
  Network,
  Pencil,
  Plus,
  Server,
} from "lucide-react";

import logo from "@/assets/narwhal.png";
import { ConnectDialog } from "@/components/ConnectDialog";
import { HostForm } from "@/components/HostForm";
import { cn } from "@/lib/utils";
import { LOCAL_HOST, useContainers } from "@/stores/containers";
import type { HostConfig, View } from "@/types";

const VIEWS: { id: View; label: string; icon: React.ReactNode }[] = [
  { id: "containers", label: "Contenedores", icon: <Container className="size-4" /> },
  { id: "images", label: "Imágenes", icon: <Layers className="size-4" /> },
  { id: "volumes", label: "Volúmenes", icon: <HardDrive className="size-4" /> },
  { id: "networks", label: "Redes", icon: <Network className="size-4" /> },
];

export function Sidebar() {
  const hosts = useContainers((s) => s.hosts);
  const activeHostId = useContainers((s) => s.activeHostId);
  const status = useContainers((s) => s.status);
  const docker = useContainers((s) => s.docker);
  const connectTo = useContainers((s) => s.connectTo);
  const view = useContainers((s) => s.view);
  const setView = useContainers((s) => s.setView);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<HostConfig | null>(null);
  const [ask, setAsk] = useState<{
    host: HostConfig;
    passphrase: boolean;
  } | null>(null);

  const handleConnect = async (h: HostConfig) => {
    if (activeHostId === h.id && status === "connected") return;
    const err = await connectTo(h.id);
    if (!err) return;
    // el backend pide credenciales con un prefijo en el error
    if (err.startsWith("passphrase:")) setAsk({ host: h, passphrase: true });
    else if (err.startsWith("auth:")) setAsk({ host: h, passphrase: false });
  };

  const statusDot =
    status === "connected"
      ? "bg-emerald-400"
      : status === "connecting"
        ? "animate-pulse bg-amber-400"
        : "bg-red-400/70";

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-border bg-card/30">
      <div
        data-tauri-drag-region
        className="flex h-12 shrink-0 items-center gap-2 pl-20"
      >
        <img
          src={logo}
          alt=""
          className="pointer-events-none size-5 rounded-[5px]"
        />
        <span className="pointer-events-none text-sm font-semibold tracking-wide">
          Narwhal
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto overscroll-none p-2">
        <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
          Docker
        </p>
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors",
              view === v.id
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <span className="shrink-0 opacity-70">{v.icon}</span>
            {v.label}
          </button>
        ))}

        <p className="px-2 pb-1 pt-4 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
          Hosts
        </p>

        <HostItem
          icon={<Laptop className="size-4 shrink-0 opacity-70" />}
          label="Esta máquina"
          active={activeHostId === LOCAL_HOST}
          dotClass={activeHostId === LOCAL_HOST ? statusDot : null}
          onClick={() => void connectTo(LOCAL_HOST)}
        />

        {hosts.map((h) => (
          <HostItem
            key={h.id}
            icon={<Server className="size-4 shrink-0 opacity-70" />}
            label={h.name}
            active={activeHostId === h.id}
            dotClass={activeHostId === h.id ? statusDot : null}
            onClick={() => void handleConnect(h)}
            onEdit={() => {
              setEditing(h);
              setFormOpen(true);
            }}
          />
        ))}

        <button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] text-muted-foreground/70 transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <Plus className="size-4 shrink-0" />
          Añadir servidor
        </button>
      </nav>

      <footer className="border-t border-border/60 px-4 py-3">
        <span className="block truncate text-[11px] text-muted-foreground">
          {status === "connected" && docker
            ? `Docker ${docker.version}`
            : status === "connecting"
              ? "Conectando…"
              : "Sin conexión"}
        </span>
      </footer>

      <HostForm open={formOpen} host={editing} onOpenChange={setFormOpen} />
      {ask && (
        <ConnectDialog
          host={ask.host}
          passphrase={ask.passphrase}
          onClose={() => setAsk(null)}
        />
      )}
    </aside>
  );
}

function HostItem({
  icon,
  label,
  active,
  dotClass,
  onClick,
  onEdit,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  dotClass: string | null;
  onClick: () => void;
  onEdit?: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className={cn(
        "group flex w-full cursor-default items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {onEdit && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          aria-label={`Editar ${label}`}
          className="hidden shrink-0 text-muted-foreground/60 hover:text-foreground group-hover:block"
        >
          <Pencil className="size-3.5" />
        </button>
      )}
      {dotClass && (
        <span className={cn("size-1.5 shrink-0 rounded-full", dotClass)} />
      )}
    </div>
  );
}
