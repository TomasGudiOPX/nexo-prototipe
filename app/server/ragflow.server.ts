import { serverConfigValue } from "./config.server";
import { effectiveRagflowSettings } from "./ragflow-settings.server";
export { serverConfigValue } from "./config.server";

export class RagflowError extends Error {
  public status: number;
  constructor(message: string, status = 502) { super(message); this.status = status; }
}

export async function ragflow(path: string, init: RequestInit = {}) {
  const settings = effectiveRagflowSettings();
  const base = settings.baseUrl?.replace(/\/+$/, "");
  const token = settings.apiKey;
  if (!base || !token) throw new RagflowError("RAGFlow no está configurado en el servidor.", 503);
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (!(init.body instanceof FormData) && init.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    response = await fetch(`${base}${path}`, {
      ...init,
      headers,
    });
  } catch {
    throw new RagflowError("No se pudo conectar con RAGFlow.", 502);
  }
  if (!response.ok) throw new RagflowError(`RAGFlow respondió con error (${response.status}).`, response.status);
  const text = await response.text();
  if (!text) return {};
  let payload: unknown;
  try { payload = JSON.parse(text) as unknown; }
  catch { throw new RagflowError("RAGFlow devolvió una respuesta no válida.", 502); }
  const envelope = asRecord(payload);
  if (envelope.code !== undefined && envelope.code !== 0 && envelope.code !== "0") {
    const upstream = typeof envelope.message === "string" ? envelope.message.trim() : "";
    const detail = upstream ? ` RAGFlow: ${upstream}` : "";
    throw new RagflowError(`RAGFlow rechazó la solicitud.${detail}`.slice(0, 400), response.status >= 400 ? response.status : 502);
  }
  return payload;
}

// Raw fetch against RAGFlow for binary payloads (document download/preview).
// The JSON helper above parses response envelopes, which a file stream is not.
export async function ragflowFetch(path: string, init: RequestInit = {}) {
  const settings = effectiveRagflowSettings();
  const base = settings.baseUrl?.replace(/\/+$/, "");
  const token = settings.apiKey;
  if (!base || !token) throw new RagflowError("RAGFlow no está configurado en el servidor.", 503);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  try {
    return await fetch(`${base}${path}`, { ...init, headers });
  } catch {
    throw new RagflowError("No se pudo conectar con RAGFlow.", 502);
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}
export function asList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const body = asRecord(value);
  if (Array.isArray(body.data)) return body.data;
  for (const key of ["datasets", "docs", "documents", "chats", "connectors", "items", "logs"]) {
    if (Array.isArray(asRecord(body.data)[key])) return asRecord(body.data)[key] as unknown[];
    if (Array.isArray(body[key])) return body[key] as unknown[];
  }
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
