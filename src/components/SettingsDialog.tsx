import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { ArrowUpCircle } from "lucide-react";
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
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { LOCAL_HOST, useContainers } from "@/stores/containers";
import { useSettings } from "@/stores/settings";
import { useUpdater } from "@/stores/updater";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[13px]">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsDialog() {
  const open = useContainers((s) => s.settingsOpen);
  const setOpen = useContainers((s) => s.setSettingsOpen);
  const connectTo = useContainers((s) => s.connectTo);
  const activeHostId = useContainers((s) => s.activeHostId);
  const settings = useSettings();

  const [autostart, setAutostart] = useState(false);
  const [version, setVersion] = useState("");
  const [checking, setChecking] = useState(false);
  const [socketDraft, setSocketDraft] = useState("");

  useEffect(() => {
    if (!open) return;
    setSocketDraft(useSettings.getState().localSocket);
    void isEnabled()
      .then(setAutostart)
      .catch(() => {});
    void getVersion()
      .then(setVersion)
      .catch(() => {});
  }, [open]);

  const toggleAutostart = async (value: boolean) => {
    try {
      if (value) await enable();
      else await disable();
      setAutostart(value);
    } catch (e) {
      toast.error(String(e));
    }
  };

  const applySocket = async () => {
    const localSocket = socketDraft.trim();
    settings.update({ localSocket });
    if (activeHostId === LOCAL_HOST) {
      await connectTo(LOCAL_HOST);
    }
    toast.success(
      localSocket ? `Socket local: ${localSocket}` : "Socket local por defecto",
    );
  };

  const checkUpdates = async () => {
    setChecking(true);
    const found = await useUpdater.getState().checkManual();
    setChecking(false);
    if (!found) toast.success("Estás en la última versión");
    else setOpen(false); // el banner toma el relevo
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Preferencias</DialogTitle>
          <DialogDescription>
            Narwhal {version && `v${version}`} — pocas opciones, buenas por
            defecto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <Section title="General">
            <Row
              label="Arrancar al iniciar sesión"
              hint="Narwhal vive en la barra de menú"
            >
              <Switch
                checked={autostart}
                onCheckedChange={(v) => void toggleAutostart(v)}
              />
            </Row>
            <Row
              label="Al cerrar la ventana, seguir en el tray"
              hint="Las notificaciones siguen funcionando"
            >
              <Switch
                checked={settings.keepInTray}
                onCheckedChange={(keepInTray) => settings.update({ keepInTray })}
              />
            </Row>
            <Row label="Intervalo de sondeo" hint="Con la ventana visible">
              <Select
                value={String(settings.pollSeconds)}
                onValueChange={(v) =>
                  settings.update({ pollSeconds: Number(v) })
                }
              >
                <SelectTrigger className="h-8 w-24 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 s</SelectItem>
                  <SelectItem value="5">5 s</SelectItem>
                  <SelectItem value="10">10 s</SelectItem>
                </SelectContent>
              </Select>
            </Row>
          </Section>

          <Section title="Notificaciones">
            <Row label="Contenedor detenido">
              <Switch
                checked={settings.notifyStopped}
                onCheckedChange={(notifyStopped) =>
                  settings.update({ notifyStopped })
                }
              />
            </Row>
            <Row label="Healthcheck unhealthy">
              <Switch
                checked={settings.notifyUnhealthy}
                onCheckedChange={(notifyUnhealthy) =>
                  settings.update({ notifyUnhealthy })
                }
              />
            </Row>
          </Section>

          <Section title="Docker local">
            <div className="space-y-2">
              <Label htmlFor="local-socket" className="text-[13px] font-normal">
                Socket personalizado
              </Label>
              <div className="flex gap-2">
                <Input
                  id="local-socket"
                  value={socketDraft}
                  onChange={(e) => setSocketDraft(e.target.value)}
                  placeholder="~/.colima/docker.sock — vacío: por defecto"
                  className="h-8 font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => void applySocket()}
                >
                  Aplicar
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Para Colima, Podman o Docker rootless.
              </p>
            </div>
          </Section>

          <Section title="Apariencia">
            <Row label="Opacidad de la ventana" hint="El blur lo pone macOS">
              <div className="flex w-40 items-center gap-2">
                <Slider
                  value={[settings.opacity]}
                  min={70}
                  max={100}
                  step={5}
                  onValueChange={([opacity]) => settings.update({ opacity })}
                />
                <span className="w-9 text-right font-mono text-[11px] text-muted-foreground">
                  {settings.opacity}%
                </span>
              </div>
            </Row>
          </Section>

          <Section title="Actualizaciones">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-full text-xs"
              disabled={checking}
              onClick={() => void checkUpdates()}
            >
              <ArrowUpCircle className="size-3.5" />
              {checking ? "Buscando…" : "Buscar actualizaciones"}
            </Button>
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
