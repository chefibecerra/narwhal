import { useState } from "react";

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
import { useContainers } from "@/stores/containers";
import type { HostConfig } from "@/types";

export function ConnectDialog({
  host,
  passphrase,
  onClose,
}: {
  host: HostConfig;
  /** true: se pide la passphrase de la clave; false: la contraseña SSH */
  passphrase: boolean;
  onClose: () => void;
}) {
  const connectTo = useContainers((s) => s.connectTo);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!secret || busy) return;
    setBusy(true);
    setError(null);
    const err = await connectTo(host.id, secret);
    setBusy(false);
    if (!err) onClose();
    else setError(err.replace(/^(auth|passphrase):\s*/, ""));
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Conectar con {host.name}</DialogTitle>
          <DialogDescription>
            {passphrase
              ? "La clave privada está protegida: introduce su passphrase."
              : `Contraseña SSH de ${host.username}@${host.hostname}.`}{" "}
            No se guarda: solo se usa para esta conexión.
          </DialogDescription>
        </DialogHeader>
        <Input
          type="password"
          autoFocus
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder={passphrase ? "Passphrase" : "Contraseña"}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!secret || busy} onClick={() => void submit()}>
            {busy ? "Conectando…" : "Conectar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
