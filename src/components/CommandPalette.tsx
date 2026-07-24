import { useEffect } from "react";
import {
  ArrowUpCircle,
  Container,
  HardDrive,
  Laptop,
  Layers,
  Network,
  Rocket,
  Server,
} from "lucide-react";
import { toast } from "sonner";

import { useUpdater } from "@/stores/updater";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ServiceGlyph } from "@/lib/services";
import { LOCAL_HOST, useContainers } from "@/stores/containers";

export function CommandPalette() {
  const open = useContainers((s) => s.paletteOpen);
  const setOpen = useContainers((s) => s.setPaletteOpen);
  const containers = useContainers((s) => s.containers);
  const hosts = useContainers((s) => s.hosts);
  const select = useContainers((s) => s.select);
  const setView = useContainers((s) => s.setView);
  const connectTo = useContainers((s) => s.connectTo);
  const setComposeOpen = useContainers((s) => s.setComposeOpen);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!useContainers.getState().paletteOpen);
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [setOpen]);

  const close = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Contenedor, host o acción…" />
      <CommandList className="overscroll-none">
        <CommandEmpty>Sin resultados.</CommandEmpty>

        <CommandGroup heading="Contenedores">
          {containers.map((c) => (
            <CommandItem
              key={c.id}
              value={`${c.name} ${c.image}`}
              onSelect={() =>
                close(() => {
                  setView("containers");
                  select(c.id);
                })
              }
            >
              <ServiceGlyph image={c.image} className="size-4" />
              <span className="truncate">{c.name}</span>
              <span className="ml-auto truncate text-xs text-muted-foreground">
                {c.image}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Hosts">
          <CommandItem
            value="esta máquina local"
            onSelect={() => close(() => void connectTo(LOCAL_HOST))}
          >
            <Laptop className="size-4" /> Esta máquina
          </CommandItem>
          {hosts.map((h) => (
            <CommandItem
              key={h.id}
              value={`${h.name} ${h.hostname}`}
              onSelect={() => close(() => void connectTo(h.id))}
            >
              <Server className="size-4" />
              <span className="truncate">{h.name}</span>
              <span className="ml-auto truncate text-xs text-muted-foreground">
                {h.hostname}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Ir a">
          <CommandItem onSelect={() => close(() => setView("containers"))}>
            <Container className="size-4" /> Contenedores
          </CommandItem>
          <CommandItem onSelect={() => close(() => setView("images"))}>
            <Layers className="size-4" /> Imágenes
          </CommandItem>
          <CommandItem onSelect={() => close(() => setView("volumes"))}>
            <HardDrive className="size-4" /> Volúmenes
          </CommandItem>
          <CommandItem onSelect={() => close(() => setView("networks"))}>
            <Network className="size-4" /> Redes
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="Acciones">
          <CommandItem
            value="desplegar compose deploy"
            onSelect={() => close(() => setComposeOpen(true))}
          >
            <Rocket className="size-4" /> Desplegar Compose…
          </CommandItem>
          <CommandItem
            value="buscar actualizaciones update version"
            onSelect={() =>
              close(() => {
                void useUpdater
                  .getState()
                  .checkManual()
                  .then((found) => {
                    if (!found) toast.success("Estás en la última versión");
                  });
              })
            }
          >
            <ArrowUpCircle className="size-4" /> Buscar actualizaciones
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
