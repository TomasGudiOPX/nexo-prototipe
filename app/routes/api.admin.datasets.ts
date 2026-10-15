import { asList, asRecord, RagflowError, ragflow } from "../server/ragflow.server";
import { requireKnowledgeManager, requireUser, validateMutationOrigin } from "../server/auth.server";
import { withDatabase } from "../server/database.server";
import type { Route } from "./+types/api.admin.datasets";

export async function loader({ request }: Route.LoaderArgs) {
  const auth = requireUser(request);
  if (!auth.user) return auth.response;
  try {
    const [payload, chatPayload] = await Promise.all([
      ragflow("/api/v1/datasets?page=1&page_size=1000&include_parsing_status=true"),
      ragflow("/api/v1/chats?page=1&page_size=1000").catch(() => null),
    ]);
    const sourceAssociations = withDatabase(db => db.prepare("SELECT dataset_id FROM data_sources WHERE dataset_id IS NOT NULL").all() as { dataset_id: string }[]);
    const datasetPayload = asRecord(payload);
    const data = asRecord(datasetPayload.data);
    const chats = asRecord(chatPayload).data;
    const assistantBindings = ((Array.isArray(asRecord(chats).chats) ? asRecord(chats).chats : []) as unknown[]).map(asRecord);
    const datasets = (Array.isArray(data.datasets) ? data.datasets : asList(datasetPayload)).map(asRecord).map((dataset: Record<string, unknown>) => {
      const id = String(dataset.id ?? dataset.dataset_id ?? "");
      const assistantCount = assistantBindings.filter(chat => {
        const ids = Array.isArray(chat.dataset_ids) ? chat.dataset_ids : Array.isArray(chat.kb_ids) ? chat.kb_ids : [];
        return ids.some((datasetId: unknown) => String(datasetId) === id);
      }).length;
      return { ...dataset, relationshipSummary: { assistantCount, dataSourceCount: sourceAssociations.filter(source => source.dataset_id === id).length } };
    });
    return Response.json({ datasets }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error, "No se pudieron cargar los datasets."); }
}

export async function action({ request }: Route.ActionArgs) {
  const auth = requireKnowledgeManager(request);
  if (!auth.user) return auth.response;
  if (!validateMutationOrigin(request)) return Response.json({ error: "Origen de solicitud no válido." }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 1 || name.length > 128) throw new RagflowError("El nombre del dataset debe tener entre 1 y 128 caracteres.", 400);
    const settings: Record<string, unknown> = { name };
    for (const key of ["description", "language", "embedding_model", "permission", "chunk_method", "pipeline_id"])
      if (typeof body[key] === "string" && body[key]) settings[key] = body[key];
    if (body.parser_config && typeof body.parser_config === "object") settings.parser_config = body.parser_config;
    const payload = await ragflow("/api/v1/datasets", { method: "POST", body: JSON.stringify(settings) });
    return Response.json(payload, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error, "No se pudo crear el dataset."); }
}

function failure(error: unknown, fallback: string) {
  const e = error instanceof RagflowError ? error : new RagflowError(fallback);
  return Response.json({ error: e.message || fallback }, { status: e.status, headers: { "Cache-Control": "no-store" } });
}
