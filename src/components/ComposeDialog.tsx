import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Textarea } from "@/components/ui/textarea";
import * as ipc from "@/lib/ipc";
import { useContainers } from "@/stores/containers";

const PLACEHOLDER = `services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"`;

type Phase = "edit" | "running" | "done" | "error";

export function ComposeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const refresh = useContainers((s) => s.refresh);
  const [project, setProject] = useState("");
  const [yaml, setYaml] = useState("");
  const [lines, setLines] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>("edit");
  const [saved, setSaved] = useState<string[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setProject("");
    setYaml("");
    setLines([]);
    setPhase("edit");
    void ipc
      .composeSavedList()
      .then(setSaved)
      .catch(() => setSaved([]));
  }, [open]);

  const loadSaved = async (name: string) => {
    try {
      setYaml(await ipc.composeSavedRead(name));
      setProject(name);
    } catch (e) {
      toast.error(String(e));
    }
  };

  useEffect(() => {
    const el = outputRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const validName = /^[a-z0-9_-]+$/.test(project);
  const canDeploy = validName && yaml.trim().length > 0 && phase !== "running";

  const deploy = async () => {
    if (!canDeploy) return;
    setPhase("running");
    setLines([]);
    // se guarda ANTES de desplegar: aunque falle, no pierdes lo escrito
    void ipc.composeSavedSave(project, yaml).catch(() => {});
    try {
      await ipc.composeUp(project, yaml, (chunk) =>
        setLines((prev) => [...prev, chunk.line]),
      );
      setPhase("done");
      toast.success(`Proyecto "${project}" desplegado`);
      await refresh();
    } catch (e) {
      setLines((prev) => [...prev, String(e)]);
      setPhase("error");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => phase !== "running" && onOpenChange(o)}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Desplegar Compose</DialogTitle>
          <DialogDescription>
            Pega tu docker-compose.yml y se ejecuta en el host activo — local o
            remoto por SSH, da igual. Al desplegar se guarda en tu biblioteca.
          </DialogDescription>
        </DialogHeader>

        {saved.length > 0 && (
          <Select onValueChange={(name) => void loadSaved(name)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Cargar un compose guardado…" />
            </SelectTrigger>
            <SelectContent>
              {saved.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="compose-name">Nombre del proyecto</Label>
            <Input
              id="compose-name"
              value={project}
              onChange={(e) => setProject(e.target.value.toLowerCase())}
              placeholder="mi-stack"
              disabled={phase === "running"}
            />
            {project && !validName && (
              <p className="text-[11px] text-destructive">
                Solo minúsculas, números, "-" y "_".
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="compose-yaml">docker-compose.yml</Label>
            <Textarea
              id="compose-yaml"
              value={yaml}
              onChange={(e) => setYaml(e.target.value)}
              placeholder={PLACEHOLDER}
              disabled={phase === "running"}
              spellCheck={false}
              className="h-48 resize-none font-mono text-xs"
            />
          </div>

          {lines.length > 0 && (
            <div
              ref={outputRef}
              className="max-h-40 overflow-y-auto overscroll-none rounded-lg border border-border bg-background/60 p-2 font-mono text-[11px] leading-relaxed"
            >
              {lines.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap break-all">
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            disabled={phase === "running"}
            onClick={() => onOpenChange(false)}
          >
            {phase === "done" ? "Cerrar" : "Cancelar"}
          </Button>
          <Button disabled={!canDeploy} onClick={() => void deploy()}>
            {phase === "running"
              ? "Desplegando…"
              : phase === "error"
                ? "Reintentar"
                : "Desplegar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
