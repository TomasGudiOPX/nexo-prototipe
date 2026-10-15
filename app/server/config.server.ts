import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function serverConfigValue(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    const file = readFileSync(fileURLToPath(new URL("../../.env", import.meta.url)), "utf8");
    const line = file.split(/\r?\n/).find(entry => entry.trimStart().startsWith(`${name}=`));
    if (!line) return undefined;
    const value = line.slice(line.indexOf("=") + 1).trim();
    return value.startsWith('"') ? JSON.parse(value) as string : value;
  } catch { return undefined; }
}
