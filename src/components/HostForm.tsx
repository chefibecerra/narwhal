import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as ipc from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { useContainers } from "@/stores/containers";
import type { HostConfig, SshConfigHost, SshKey } from "@/types";

const EMPTY: HostConfig = {
  id: "",
  name: "",
  hostname: "",
  port: 22,
  username: "root",
  authKind: "key",
  keyPath: null,
  socketPath: null,
};

const AUTO = "__auto__";
const CUSTOM = "__custom__";

export function HostForm({
  open,
  host,
  onOpenChange,
}: {
  open: boolean;
  host: HostConfig | null;
  onOpenChange: (open: boolean) => void;
}) {
  const saveHost = useContainers((s) => s.saveHost);
  const deleteHost = useContainers((s) => s.deleteHost);
  const [form, setForm] = useState<HostConfig>(EMPTY);
  const [configHosts, setConfigHosts] = useState<SshConfigHost[]>([]);
  const [keys, setKeys] = useState<SshKey[]>([]);
  const [keySel, setKeySel] = useState<string>(AUTO);
  const [customPath, setCustomPath] = useState("");

  /** selección del desplegable a partir de una ruta guardada */
  const selForPath = (path: string | null, detected: SshKey[]) => {
    if (!path) return { sel: AUTO, custom: "" };
    if (detected.some((k) => k.path === path)) return { sel: path, custom: "" };
    return { sel: CUSTOM, custom: path };
  };

  useEffect(() => {
    if (!open) return;
    setForm(host ?? EMPTY);
    void ipc
      .readSshConfig()
      .then(setConfigHosts)
      .catch(() => setConfigHosts([]));
    void ipc
      .listSshKeys()
      .then((detected) => {
        setKeys(detected);
        const { sel, custom } = selForPath(host?.keyPath ?? null, detected);
        setKeySel(sel);
        setCustomPath(custom);
      })
      .catch(() => setKeys([]));
  }, [open, host]);

  const importFrom = (alias: string) => {
    const entry = configHosts.find((c) => c.alias === alias);
    if (!entry) return;
    setForm((f) => ({
      ...f,
      name: entry.alias,
      hostname: entry.hostname,
      username: entry.user ?? f.username,
      port: entry.port,
      authKind: "key",
      keyPath: entry.identityFile,
    }));
    const { sel, custom } = selForPath(entry.identityFile, keys);
    setKeySel(sel);
    setCustomPath(custom);
  };

  const valid =
    form.name.trim().length > 0 &&
    form.hostname.trim().length > 0 &&
    form.username.trim().length > 0;

  const submit = async () => {
    if (!valid) return;
    const keyPath =
      form.authKind === "password"
        ? null
        : keySel === AUTO
          ? null
          : keySel === CUSTOM
            ? customPath.trim() || null
            : keySel;
    await saveHost({
      ...form,
      name: form.name.trim(),
      hostname: form.hostname.trim(),
      username: form.username.trim(),
      keyPath,
      socketPath: form.socketPath?.trim() || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {host ? "Editar servidor" : "Añadir servidor"}
          </DialogTitle>
          <DialogDescription>
            Sin agentes ni puertos abiertos: Narwhal usa tu conexión SSH. Las
            contraseñas no se guardan nunca.
          </DialogDescription>
        </DialogHeader>

        {configHosts.length > 0 && (
          <Select onValueChange={importFrom}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Importar de ~/.ssh/config…" />
            </SelectTrigger>
            <SelectContent>
              {configHosts.map((c) => (
                <SelectItem key={c.alias} value={c.alias}>
                  {c.alias} · {c.hostname}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="host-name">Nombre</Label>
            <Input
              id="host-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Mi VPS"
            />
          </div>
          <div className="grid grid-cols-[1fr_5.5rem] gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="host-hostname">Host</Label>
              <Input
                id="host-hostname"
                value={form.hostname}
                onChange={(e) => setForm({ ...form, hostname: e.target.value })}
                placeholder="1.2.3.4 o vps.midominio.com"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="host-port">Puerto</Label>
              <Input
                id="host-port"
                type="number"
                value={form.port}
                onChange={(e) =>
                  setForm({ ...form, port: Number(e.target.value) || 22 })
                }
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="host-user">Usuario</Label>
            <Input
              id="host-user"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Autenticación</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "h-8 text-xs",
                  form.authKind === "key" && "border-foreground/40 bg-accent",
                )}
                onClick={() => setForm({ ...form, authKind: "key" })}
              >
                Clave SSH
              </Button>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "h-8 text-xs",
                  form.authKind === "password" &&
                    "border-foreground/40 bg-accent",
                )}
                onClick={() => setForm({ ...form, authKind: "password" })}
              >
                Contraseña
              </Button>
            </div>
          </div>

          {form.authKind === "key" ? (
            <div className="grid gap-2">
              <Select value={keySel} onValueChange={setKeySel}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO}>
                    Automática — probar las claves por defecto
                  </SelectItem>
                  {keys.map((k) => (
                    <SelectItem key={k.path} value={k.path}>
                      {k.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM}>Otra ruta…</SelectItem>
                </SelectContent>
              </Select>
              {keySel === CUSTOM && (
                <Input
                  value={customPath}
                  onChange={(e) => setCustomPath(e.target.value)}
                  placeholder="~/.ssh/mi_clave"
                  className="font-mono text-xs"
                />
              )}
              <p className="text-[11px] text-muted-foreground">
                Si la clave tiene passphrase, se pedirá al conectar.
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              La contraseña se pide al conectar y solo vive en memoria durante
              la sesión. Nunca toca el disco.
            </p>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="host-socket">Socket de Docker (opcional)</Label>
            <Input
              id="host-socket"
              value={form.socketPath ?? ""}
              onChange={(e) =>
                setForm({ ...form, socketPath: e.target.value || null })
              }
              placeholder="/var/run/docker.sock"
            />
          </div>
        </div>

        <DialogFooter>
          {host && (
            <Button
              variant="ghost"
              className="mr-auto text-destructive hover:text-destructive"
              onClick={() => {
                void deleteHost(host.id);
                onOpenChange(false);
              }}
            >
              Eliminar
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!valid} onClick={() => void submit()}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
