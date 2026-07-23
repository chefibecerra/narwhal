# Narwhal

> El unicornio del mar que navega entre tus contenedores.

Gestor de Docker de escritorio, **local y remoto**. Ver, controlar y depurar contenedores
—en tu propia máquina o en cualquier servidor por SSH— sin instalar nada extra ni abrir una
terminal a mano. El hermano de [Ratatoskr](https://github.com/chefibecerra/ratatoskr) para
Docker. Como OrbStack, pero multiplataforma y con servidores remotos.

## Por qué

- Gestionar Docker es teclear `docker ps`, `docker logs -f`, `docker compose` a mano,
  recordando en qué carpeta vive cada `docker-compose.yml`.
- **OrbStack** es precioso pero **solo Mac y solo local**. **Portainer** exige instalar un
  agente y exponer un puerto. Narwhal cubre el hueco: **multiplataforma**, **local + remoto**,
  sin agente ni puertos abiertos.
- Misma estética minimal y seguridad zero-knowledge de Ratatoskr, no un panel web pesado.

## Alcance (importante)

Narwhal **gestiona** Docker; no **provee** el motor. Se apoya en un Docker que ya existe:
- **Local**: el Docker de tu máquina (Docker Desktop, OrbStack, Colima, el engine…).
- **Remoto**: el Docker de un servidor, por SSH.

No reinventa la máquina virtual / el demonio (eso es virtualización, otro producto). Es la
capa de gestión bonita por encima — como Lazydocker o el panel de Docker Desktop, pero mejor.

## La idea: un "host de Docker" con dos modos

La interfaz es la misma; solo cambia cómo se llega a Docker por debajo:

- **Local** → habla con el socket de Docker (`/var/run/docker.sock`) o la CLI local.
- **Remoto** → por SSH, ejecuta la CLI en el servidor y parsea la salida
  (`docker ps --format '{{json .}}'`). Cero agente, cero puertos abiertos.

Reutiliza la base de Ratatoskr: `russh` (para el modo remoto), el vault cifrado, la gestión
de hosts, TOFU y la UI.

## Qué muestra / hace

- **Contenedores**: lista (corriendo / parados), estado, imagen, puertos, uptime.
- **Acciones**: arrancar, parar, reiniciar, eliminar, recrear.
- **Logs en vivo** (streaming) con búsqueda.
- **Exec**: abrir una shell dentro de un contenedor (terminal xterm.js, reutilizando el de
  Ratatoskr).
- **Estadísticas**: CPU / RAM por contenedor.
- **Imágenes, volúmenes y redes**.
- **Docker Compose**: detecta proyectos, `up` / `down` / `ps` / `logs` por proyecto.
- **Multi-servidor**: cambia entre tus VPS de un vistazo.

## Stack (heredado de Ratatoskr)

| Capa | Tecnología |
|------|------------|
| Shell de la app | Tauri 2 |
| Frontend | React 19 + TypeScript + Vite |
| UI | Tailwind + shadcn/ui, tema oscuro |
| SSH | `russh` (Rust puro) |
| Terminal (exec) | xterm.js |
| Credenciales | Vault Argon2id + ChaCha20-Poly1305 (zero-knowledge) |

## Arquitectura (concepto)

```
┌─ Webview (React) ─────────────┐      ┌─ Rust (Tauri) ────────────────┐
│ Lista de contenedores         │ IPC  │ trait DockerHost:             │
│ Logs en vivo · stats          │◄────►│  ├─ Local  → socket / CLI     │
│ Terminal exec (xterm)         │      │  └─ Remoto → russh + docker   │
└───────────────────────────────┘      └──────┬──────────────┬─────────┘
                                               │ local        │ SSH
                                    ┌──────────▼───┐   ┌──────▼──────────┐
                                    │ Docker de tu │   │ Servidor remoto │
                                    │ máquina      │   │ con Docker      │
                                    └──────────────┘   └─────────────────┘
```

La UI no sabe si el Docker es local o remoto: habla contra el trait `DockerHost` y punto.

## Fases

### Fase 1 — MVP (empezar por LOCAL, es más simple)
- [x] Scaffold Tauri 2 + React (reutilizar base de Ratatoskr)
- [x] `trait DockerHost` con la implementación **local** (socket vía bollard)
- [x] Listar contenedores (Docker API, sin parseo de CLI)
- [x] Arrancar / parar / reiniciar / eliminar
- [x] Logs en vivo con streaming a la UI

### Fase 1.5 — Modo remoto
- [x] Implementación **remota** del `DockerHost`: russh + túnel del socket
      (`direct-streamlocal`) + el mismo bollard — un solo camino de datos
- [x] Selector local / servidores en la sidebar, TOFU, import de `~/.ssh/config`
- [ ] Vault cifrado para poder guardar contraseñas (hoy: solo en memoria)

### Fase 2 — Profundidad
- [ ] Exec: shell dentro de un contenedor (xterm)
- [ ] Stats en vivo (CPU/RAM)
- [ ] Imágenes, volúmenes, redes

### Fase 3 — Compose
- [ ] Detectar proyectos compose y su ruta
- [ ] `up` / `down` / `ps` / `logs` por proyecto

### Después
- Multi-servidor simultáneo, alertas de healthcheck, limpieza (prune) guiada.

## Estética

Igual que Ratatoskr: **monocromo, minimal, estilo Apple/Tesla**, tema oscuro, titlebar
overlay de macOS, español neutro en toda la interfaz.

## Qué se reutiliza de Ratatoskr

Capa SSH (`russh`), gestión de hosts, vault cifrado, verificación TOFU, terminal xterm.js
(para el exec), toda la UI base (shadcn, tema, componentes) y el **pipeline de release**
(instaladores + portables para las 3 plataformas, auto-update firmado, guardián de versión
en CI). Buena parte del trabajo pesado ya está resuelta.

## Decisiones tomadas

- **API, no CLI**: bollard contra el socket de Docker. En remoto, el socket del servidor
  se reenvía por un canal SSH `direct-streamlocal` (como `ssh -L`) y bollard habla con él
  igual que en local. Un solo camino de datos, cero parseo, cero dependencias en el servidor.
- **Sin secretos en disco**: los hosts se guardan en JSON plano (0600) sin contraseñas;
  password/passphrase se piden al conectar y viven solo en memoria. El vault cifrado
  llegará cuando haga falta guardarlos.
- **Hosts independientes de Ratatoskr**, con import desde `~/.ssh/config`.

---

*Proyecto hermano de Ratatoskr. Contexto y decisiones en la memoria del asistente.*
