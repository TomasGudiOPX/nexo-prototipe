import { asList, asRecord, RagflowError, ragflow } from "../server/ragflow.server";
import { requireSiteAdmin, requireUser, validateMutationOrigin } from "../server/auth.server";
import { withDatabase } from "../server/database.server";
import type { Route } from "./+types/api.admin.data-sources";

function mask(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(mask);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [/token|secret|password|credential|authorization|api[_-]?key/i.test(key) ? "[secret masked]" : key, /token|secret|password|credential|authorization|api[_-]?key/i.test(key) ? "[configured]" : mask(item)]));
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = requireUser(request); if (!auth.user) return auth.response;
  try {
    const response = await ragflow("/api/v1/connectors?page=1&page_size=100");
    const associations = new Map((withDatabase(db => db.prepare("SELECT id,dataset_id FROM data_sources").all()) as { id: string; dataset_id: string | null }[]).map(row => [row.id, row.dataset_id]));
    const rows = asList(response).map(asRecord).map(source => ({ ...source, dataset_id: associations.get(String(source.id ?? source.connector_id ?? "")) ?? source.dataset_id ?? null, actionCapabilities: { test: true, rebuild: true, logs: true, associate: true, remove: true } }));
    return Response.json({ supported: true, capabilities: { create: true, test: true, rebuild: true, logs: true, associate: true, remove: true }, dataSources: { connectors: mask(rows) } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const e = error instanceof RagflowError ? error : new RagflowError("No se pudo consultar el catálogo de Data Sources.");
    const unsupported = e.status === 404;
    return Response.json({ supported: false, reason: unsupported ? "El backend incluido no expone la API de Data Sources externos; esta operación todavía no está disponible en NEXO." : `El catálogo no está disponible (HTTP ${e.status}).`, capabilities: { create: false, test: false, rebuild: false, logs: false, associate: false, remove: false }, dataSources: [] }, { status: unsupported ? 200 : e.status, headers: { "Cache-Control": "no-store" } });
  }
}

export async function action({ request }: Route.ActionArgs) {
  const auth = requireSiteAdmin(request); if (!auth.user) return auth.response;
  if (!validateMutationOrigin(request)) return Response.json({ error: "Origen de solicitud no válido." }, { status: 403 });
  try {
    const body = asRecord(await request.json());
    const source = typeof body.source === "string" ? body.source.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const config = asRecord(body.config);
    if (!name || name.length > 128 || !/^[\w.-]{1,96}$/.test(source)) throw new RagflowError("Indicá un nombre y el identificador de fuente que admite la instancia.", 400);
    const connectionTest = asRecord(await ragflow(`/api/v1/connectors/${encodeURIComponent(source)}/test`, { method: "POST", body: JSON.stringify({ source, config }) }));
    if (connectionTest.data === false) throw new RagflowError("RAGFlow rechazó la prueba de conexión. Revisá la fuente y sus credenciales.", 400);
    const result = asRecord(await ragflow("/api/v1/connectors", { method: "POST", body: JSON.stringify({ source, name, config, refresh_freq: Number(body.refresh_freq) || 5, prune_freq: Number(body.prune_freq) || 5 }) }));
    const data = asRecord(result.data); const id = String(data.id ?? data.connector_id ?? "");
    if (id) withDatabase(db => db.prepare("INSERT OR REPLACE INTO data_sources(id,name,connector_type,dataset_id,capability_status,sync_status) VALUES(?,?,?,?, 'supported','idle')").run(id, name, source, typeof body.datasetId === "string" ? body.datasetId : null));
    return Response.json({ dataSource: mask(result) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const e = error instanceof RagflowError ? error : new RagflowError("No se pudo crear el Data Source.");
    return Response.json({ error: e.message }, { status: e.status });
  }
}
