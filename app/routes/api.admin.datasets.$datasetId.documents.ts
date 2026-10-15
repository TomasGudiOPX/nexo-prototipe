import { asRecord, RagflowError, ragflow, validateDataset } from "../server/ragflow.server";
import { requireKnowledgeManager, validateMutationOrigin } from "../server/auth.server";
import { userCanReachDataset } from "../server/workspaces.server";
import type { Route } from "./+types/api.admin.datasets.$datasetId.documents";

export async function loader({ request, params }: Route.LoaderArgs) {
  const auth = requireKnowledgeManager(request); if (!auth.user) return auth.response;
  if (!params.datasetId || !userCanReachDataset(auth.user, params.datasetId)) return Response.json({ error: "Acceso denegado." }, { status: 403 });
  try {
    const query = new URL(request.url).searchParams;
    const page = Math.max(1, Math.min(10000, Number(query.get("page") || 1)));
    return Response.json(await ragflow(`/api/v1/datasets/${encodeURIComponent(params.datasetId!)}/documents?page=${page}&page_size=100&orderby=create_time&desc=true`), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error, "No se pudieron cargar los documentos."); }
}

export async function action({ request, params }: Route.ActionArgs) {
  const auth = requireKnowledgeManager(request); if (!auth.user) return auth.response;
  if (!validateMutationOrigin(request)) return Response.json({ error: "Origen de solicitud no válido." }, { status: 403 });
  const datasetId = params.datasetId;
  if (!datasetId) return Response.json({ error: "Dataset inválido." }, { status: 400 });
  // A knowledge manager only reaches datasets bound to their workspaces.
  if (!userCanReachDataset(auth.user, datasetId)) return Response.json({ error: "Acceso denegado." }, { status: 403 });
  try {
    const path = `/api/v1/datasets/${encodeURIComponent(datasetId)}`;
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const incoming = await request.formData(); const outgoing = new FormData();
      for (const [key, value] of incoming.entries()) {
        if (key === "file" && value instanceof File) outgoing.append("file", value, value.name);
      }
      if (![...outgoing.keys()].length) throw new RagflowError("Seleccioná al menos un archivo.", 400);
      return Response.json(await ragflow(`${path}/documents`, { method: "POST", body: outgoing }), { status: 201 });
    }
    const body = asRecord(await request.json());
    const ids = Array.isArray(body.documentIds) ? body.documentIds.filter((id): id is string => typeof id === "string" && id.length < 128) : [];
    if (!ids.length || ids.length > 1000) throw new RagflowError("Seleccioná documentos válidos.", 400);
    if (body.action === "parse") return Response.json(await ragflow(`${path}/chunks`, { method: "POST", body: JSON.stringify({ document_ids: ids }) }));
    if (body.action === "process" || body.action === "retry") {
      const dataset = await validateDataset(datasetId);
      const isPipeline = Boolean(dataset.pipeline_id ?? asRecord(dataset.parser_config).pipeline_id);
      return Response.json(isPipeline
        ? await ragflow("/api/v1/documents/ingest", { method: "POST", body: JSON.stringify({ doc_ids: ids, run: "1", delete: body.action === "retry" || Boolean(body.rebuild) }) })
        : await ragflow(`${path}/chunks`, { method: "POST", body: JSON.stringify({ document_ids: ids }) }));
    }
    if (body.action === "ingest") return Response.json(await ragflow("/api/v1/documents/ingest", { method: "POST", body: JSON.stringify({ doc_ids: ids, run: "1", delete: Boolean(body.rebuild) }) }));
    if (body.action === "stop") return Response.json(await ragflow(`${path}/chunks`, { method: "DELETE", body: JSON.stringify({ document_ids: ids }) }));
    throw new RagflowError("Operación de documentos no válida.", 400);
  } catch (error) { return failure(error, "No se pudo procesar la operación de documentos."); }
}

function failure(error: unknown, fallback: string) {
  const e = error instanceof RagflowError ? error : new RagflowError(fallback);
  return Response.json({ error: e.message || fallback }, { status: e.status });
}
