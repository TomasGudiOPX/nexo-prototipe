import { asRecord, RagflowError, ragflow } from "../server/ragflow.server";
import { requireSiteAdmin, validateMutationOrigin } from "../server/auth.server";
import { withDatabase } from "../server/database.server";
import type { Route } from "./+types/api.admin.data-sources.$sourceId";

export async function loader({ request, params }: Route.LoaderArgs) {
  const auth = requireSiteAdmin(request); if (!auth.user) return auth.response;
  try {
    const sourceId = params.sourceId!;
    const payload = asRecord(await ragflow(`/api/v1/connectors/${encodeURIComponent(sourceId)}`));
    const connector = asRecord(payload.data ?? payload);
    const association = withDatabase(db => db.prepare("SELECT dataset_id FROM data_sources WHERE id=?").get(sourceId) as { dataset_id: string | null } | undefined);
    return Response.json({ source: mask({ ...connector, dataset_id: association?.dataset_id ?? null }) }, { headers: { "Cache-Control": "no-store" } });
  }
  catch (error) { return failure(error, "No se pudo cargar el Data Source."); }
}

export async function action({ request, params }: Route.ActionArgs) {
  const auth = requireSiteAdmin(request); if (!auth.user) return auth.response;
  if (!validateMutationOrigin(request)) return Response.json({ error: "Origen de solicitud no válido." }, { status: 403 });
  const id = encodeURIComponent(params.sourceId ?? "");
  try {
    if (request.method === "DELETE") {
      const result = await ragflow(`/api/v1/connectors/${id}`, { method: "DELETE" });
      withDatabase(db => db.prepare("DELETE FROM data_sources WHERE id=?").run(params.sourceId!));
      return Response.json(result);
    }
    if (request.method === "POST") {
      const url = new URL(request.url); const operation = url.searchParams.get("operation");
      if (operation === "test") {
        const saved = asRecord(await ragflow(`/api/v1/connectors/${id}`)); const connector = asRecord(saved.data);
        return Response.json(mask(await ragflow(`/api/v1/connectors/${id}/test`, { method: "POST", body: JSON.stringify({ source: connector.source, config: asRecord(connector.config) }) })));
      }
      if (operation === "rebuild") {
        const body = asRecord(await request.json());
        const saved = withDatabase(db => db.prepare("SELECT dataset_id FROM data_sources WHERE id=?").get(params.sourceId!) as { dataset_id: string | null } | undefined);
        const datasetId = typeof body.datasetId === "string" && body.datasetId ? body.datasetId : saved?.dataset_id;
        if (!datasetId) throw new RagflowError("Asociá un dataset antes de sincronizar esta fuente.", 400);
        return Response.json(mask(await ragflow(`/api/v1/connectors/${id}/rebuild`, { method: "POST", body: JSON.stringify({ kb_id: datasetId }) })));
      }
      if (operation === "logs") return Response.json(mask(await ragflow(`/api/v1/connectors/${id}/logs`)));
    }
    if (request.method === "PATCH") {
      const body = asRecord(await request.json());
      if (body.dataset_id !== undefined) {
        const datasetId = typeof body.dataset_id === "string" && body.dataset_id ? body.dataset_id : null;
        withDatabase(db => db.prepare("UPDATE data_sources SET dataset_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(datasetId, params.sourceId!));
      }
      const config = Object.fromEntries(Object.entries(body).filter(([key]) => key !== "dataset_id"));
      return Response.json(Object.keys(config).length ? mask(await ragflow(`/api/v1/connectors/${id}`, { method: "PATCH", body: JSON.stringify(config) })) : { ok: true });
    }
    throw new RagflowError("Operación de Data Source no válida.", 400);
  } catch (error) { return failure(error, "La instancia RAGFlow no pudo completar la operación."); }
}

function mask(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(mask);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /token|secret|password|credential|authorization|api[_-]?key/i.test(key) ? "[configured]" : mask(item)]));
}
function failure(error: unknown, fallback: string) { const e = error instanceof RagflowError ? error : new RagflowError(fallback); return Response.json({ error: e.status === 404 ? "La instancia de RAGFlow no soporta esta operación." : e.message }, { status: e.status }); }
