import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const envPath = fileURLToPath(new URL("../.env.compose.local", import.meta.url));
let existing = "";
try { existing = await readFile(envPath, "utf8"); } catch {}

const values = new Map();
for (const line of existing.split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (match) values.set(match[1], match[2]);
}

const groups = [
  ["MYSQL_PASSWORD", "MYSQL_ROOT_PASSWORD"],
  ["ELASTIC_PASSWORD"],
  ["MINIO_USER", "MINIO_ROOT_USER"],
  ["MINIO_PASSWORD", "MINIO_ROOT_PASSWORD"],
  ["REDIS_PASSWORD"],
  ["CLICKHOUSE_USER"],
  ["CLICKHOUSE_PASSWORD"],
];

for (const group of groups) {
  const configured = group.map(key => values.get(key)).find(Boolean);
  const value = configured || (group.includes("MINIO_USER") ? "rag_flow" :
    group.includes("CLICKHOUSE_USER") ? "ragflow" : randomBytes(32).toString("hex"));
  for (const key of group) values.set(key, value);
}

const contents = [
  "# Local Compose dependency credentials. This file is gitignored.",
  ...[...values].map(([key, value]) => `${key}=${value}`),
  "",
].join("\n");
await writeFile(envPath, contents, { encoding: "utf8", mode: 0o600 });
process.stdout.write("Generated/preserved private Compose dependency credentials in .env.compose.local.\n");
