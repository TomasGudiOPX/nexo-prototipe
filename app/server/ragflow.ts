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
  } catch {
    return undefined;
  }
}

export class RagflowError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

export async function ragflow(path: string, init: RequestInit = {}) {
  const base = serverConfigValue("RAGFLOW_BASE_URL")?.replace(/\/+$/, "");
  const token = serverConfigValue("RAGFLOW_API_KEY");
  if (!base || !token) throw new RagflowError("RAGFlow no está configurado en el servidor.", 503);
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new RagflowError("No se pudo conectar con RAGFlow.", 502);
  }
  if (!response.ok) throw new RagflowError(`RAGFlow respondió con error (${response.status}).`, response.status);
  const payload = await response.json() as unknown;
  const envelope = asRecord(payload);
  if (envelope.code !== undefined && envelope.code !== 0 && envelope.code !== "0") {
    throw new RagflowError(String(envelope.message ?? "RAGFlow rechazó la solicitud."), 502);
  }
  return payload;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function asList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const body = asRecord(value);
  if (Array.isArray(body.data)) return body.data;
  if (Array.isArray(asRecord(body.data).datasets)) return asRecord(body.data).datasets as unknown[];
  if (Array.isArray(body.datasets)) return body.datasets;
  return [];
}

export function referenceList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  for (const key of ["chunks", "documents", "items", "doc_aggs"]) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return Object.values(record).flatMap(item => Array.isArray(item) ? item : []);
}

export async function validateDataset(datasetId: string) {
  const rows = asList(await ragflow("/api/v1/datasets?page=1&page_size=1000"));
  const dataset = rows.map(asRecord).find(item => String(item.id ?? item.dataset_id ?? "") === datasetId);
  if (!dataset) throw new RagflowError("El dataset seleccionado ya no está disponible.", 404);
  return dataset;
}
