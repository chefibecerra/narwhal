export type Health = "healthy" | "unhealthy" | "starting" | null;

/** el healthcheck viaja dentro del status: "Up 9 days (unhealthy)" */
export function healthOf(status: string): Health {
  if (status.includes("(unhealthy)")) return "unhealthy";
  if (status.includes("(healthy)")) return "healthy";
  if (status.includes("health: starting")) return "starting";
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}
