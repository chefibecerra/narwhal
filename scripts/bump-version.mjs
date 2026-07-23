// Sube la versión en todos los sitios de golpe y deja lista la orden de tag.
//   node scripts/bump-version.mjs 0.2.0
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Uso: node scripts/bump-version.mjs <x.y.z>");
  process.exit(1);
}

// package.json es la fuente de la verdad (tauri.conf.json la lee de aquí)
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
pkg.version = version;
writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");

// Cargo.toml y Cargo.lock: la versión del crate, por higiene
const bumpRust = (path, re, replacement) => {
  const raw = readFileSync(path, "utf8");
  writeFileSync(path, raw.replace(re, replacement));
};
bumpRust("src-tauri/Cargo.toml", /^version = "[^"]+"/m, `version = "${version}"`);
bumpRust(
  "src-tauri/Cargo.lock",
  /(name = "narwhal"\nversion = ")[^"]+/,
  `$1${version}`,
);

console.log(`Versión actualizada a ${version} en package.json, Cargo.toml y Cargo.lock.`);
console.log(`Ahora: git commit -am "chore: v${version}" && git tag v${version} && git push --follow-tags`);
