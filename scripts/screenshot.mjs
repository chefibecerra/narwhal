import { chromium } from "playwright";

// Backend simulado: se inyecta antes de que cargue la app para que las
// llamadas invoke() devuelvan datos de demo (IPs TEST-NET, sin datos reales).
const MOCK = () => {
  const CONTAINERS = [
    {
      id: "c1",
      name: "mi-stack-postgres",
      image: "postgres:16-alpine",
      state: "running",
      status: "Up 3 days",
      created: 1752600000,
      ports: [{ privatePort: 5432, publicPort: 5433, protocol: "tcp", ip: "0.0.0.0" }],
      composeProject: "mi-stack",
    },
    {
      id: "c2",
      name: "mi-stack-redis",
      image: "redis:7-alpine",
      state: "running",
      status: "Up 3 days",
      created: 1752600000,
      ports: [{ privatePort: 6379, publicPort: 6380, protocol: "tcp", ip: "0.0.0.0" }],
      composeProject: "mi-stack",
    },
    {
      id: "c3",
      name: "mi-stack-api",
      image: "node:22-alpine",
      state: "running",
      status: "Up 6 hours",
      created: 1752600000,
      ports: [{ privatePort: 3000, publicPort: 3000, protocol: "tcp", ip: "0.0.0.0" }],
      composeProject: "mi-stack",
    },
    {
      id: "c4",
      name: "grafana",
      image: "grafana/grafana:11",
      state: "running",
      status: "Up 2 weeks",
      created: 1751000000,
      ports: [{ privatePort: 3000, publicPort: 3001, protocol: "tcp", ip: "0.0.0.0" }],
      composeProject: "observabilidad",
    },
    {
      id: "c5",
      name: "prometheus",
      image: "prom/prometheus:v3",
      state: "running",
      status: "Up 2 weeks",
      created: 1751000000,
      ports: [{ privatePort: 9090, publicPort: 9090, protocol: "tcp", ip: "0.0.0.0" }],
      composeProject: "observabilidad",
    },
    {
      id: "c6",
      name: "nginx-proxy",
      image: "nginx:alpine",
      state: "running",
      status: "Up 5 days",
      created: 1752200000,
      ports: [
        { privatePort: 80, publicPort: 80, protocol: "tcp", ip: "0.0.0.0" },
        { privatePort: 443, publicPort: 443, protocol: "tcp", ip: "0.0.0.0" },
      ],
      composeProject: null,
    },
  ];

  window.__TAURI_INTERNALS__ = {
    // getCurrentWindow() exige saber en qué ventana vive el webview
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { label: "main" },
    },
    callbacks: new Map(),
    nextId: 0,
    transformCallback(cb) {
      const id = ++this.nextId;
      this.callbacks.set(id, cb);
      return id;
    },
    unregisterCallback(id) {
      this.callbacks.delete(id);
    },
    convertFileSrc(p) {
      return p;
    },
    async invoke(cmd, args) {
      switch (cmd) {
        case "docker_connect_local":
          return { version: "29.4.0", apiVersion: "1.54", os: "linux" };
        case "docker_list_containers":
          return CONTAINERS;
        case "hosts_list":
          return [
            {
              id: "h1",
              name: "vps-prod",
              hostname: "192.0.2.10",
              port: 22,
              username: "deploy",
              authKind: "key",
              keyPath: "~/.ssh/id_ed25519",
              socketPath: null,
            },
          ];
        case "docker_stats_start": {
          // stats vivas para el panel de detalle
          const send = () => {
            try {
              args.onStats.onmessage({
                cpuPercent: 2.4 + Math.random() * 1.8,
                memoryUsed: (178 + Math.random() * 10) * 1024 * 1024,
                memoryLimit: 8 * 1024 * 1024 * 1024,
              });
            } catch {}
          };
          setTimeout(send, 150);
          setInterval(send, 900);
          return;
        }
        case "docker_inspect":
          return {
            env: ["POSTGRES_USER=app", "POSTGRES_DB=app", "POSTGRES_PASSWORD=········"],
            cmd: "postgres",
            restartPolicy: "unless-stopped",
            mounts: [
              {
                source: "mi-stack_pgdata",
                destination: "/var/lib/postgresql/data",
                mode: "rw",
              },
            ],
            networks: [{ name: "mi-stack_default", ip: "172.18.0.2" }],
          };
        case "tray_update":
        case "docker_stats_stop":
          return;
        case "compose_saved_list":
          return [];
        default:
          if (cmd.startsWith("plugin:updater")) return null; // sin actualización
          if (cmd.startsWith("plugin:event")) return 0;
          return [];
      }
    },
  };
  window.__TAURI_OS_PLUGIN_INTERNALS__ = { platform: "macos" };
};

const url = "http://localhost:1420";
const out = process.argv[2] || "docs/screenshot.png";

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 780 },
  deviceScaleFactor: 2,
});
await page.addInitScript(MOCK);
await page.goto(url, { waitUntil: "networkidle" });

// semáforos de macOS falsos (en la app los pone el sistema): la barra mide
// 42px y su centro está a 21px → luces de 12px con top 15
await page.addStyleTag({
  content: `.__tl{position:fixed;top:15px;left:16px;z-index:99;display:flex;gap:8px}
    .__tl span{width:12px;height:12px;border-radius:50%}
    .__r{background:#ff5f57}.__y{background:#febc2e}.__g{background:#28c840}`,
});
await page.evaluate(() => {
  const d = document.createElement("div");
  d.className = "__tl";
  d.innerHTML = '<span class="__r"></span><span class="__y"></span><span class="__g"></span>';
  document.body.appendChild(d);
});

// selecciona un contenedor: el panel de detalle con stats en vivo luce
await page.getByText("mi-stack-postgres").first().click();
await page.waitForTimeout(1600);

await page.screenshot({ path: out });
await browser.close();
console.log("captura guardada en", out);
