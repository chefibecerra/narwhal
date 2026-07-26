// Renderiza iconos lucide (los mismos de la app) a PNG para el menú del tray.
// muda escala los iconos de menú a 18pt: se generan a 36px para retina.
//   node scripts/tray-icons.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

// gris medio: legible en menú claro y oscuro (los iconos custom no son template)
const COLOR = "#87878c";
const SIZE = 36;
const OUT = "src-tauri/icons/tray";

// [archivo lucide, nombre de salida, relleno sólido estilo iOS]
const ICONS = [
  ["eye", "ver", false],
  ["terminal", "consola", false],
  ["file-text", "logs", false],
  ["square", "detener", true],
  ["rotate-cw", "reiniciar", false],
  ["play", "iniciar", true],
  ["trash-2", "eliminar", false],
  ["boxes", "proyecto", false],
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });

for (const [lucide, name, filled] of ICONS) {
  let svg = readFileSync(`node_modules/lucide-static/icons/${lucide}.svg`, "utf8");
  svg = svg
    .replace('width="24"', `width="${SIZE}"`)
    .replace('height="24"', `height="${SIZE}"`)
    .replace(/stroke="currentColor"/, `stroke="${COLOR}"`);
  if (filled) svg = svg.replace('fill="none"', `fill="${COLOR}"`);

  await page.setContent(
    `<body style="margin:0;background:transparent">${svg}</body>`,
  );
  const buffer = await page.locator("svg").screenshot({ omitBackground: true });
  writeFileSync(`${OUT}/${name}.png`, buffer);
  console.log("ok", `${OUT}/${name}.png`);
}

await browser.close();
