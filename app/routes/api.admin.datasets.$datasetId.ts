import { asRecord, RagflowError, ragflow } from "../server/ragflow.server";
import { requireKnowledgeManager, validateMutationOrigin } from "../server/auth.server";
import { userCanReachDataset } from "../server/workspaces.server";
import type { Route } from "./+types/api.admin.datasets.$datasetId";

export async function action({ request, params }: Route.ActionArgs) {
  const auth = requireKnowledgeManager(request);
  if (!auth.user) return auth.response;
  if (!validateMutationOrigin(request)) return Response.json({ error: "Origen de solicitud no válido." }, { status: 403 });
  const id = params.datasetId;
  if (!id) return Response.json({ error: "Dataset inválido." }, { status: 400 });
  // A knowledge manager only reaches datasets bound to their workspaces.
  if (!userCanReachDataset(auth.user, id)) return Response.json({ error: "Acceso denegado." }, { status: 403 });
  try {
    const path = `/api/v1/datasets/${encodeURIComponent(id)}`;
    if (request.method === "DELETE") return Response.json(await ragflow("/api/v1/datasets", { method: "DELETE", body: JSON.stringify({ ids: [id] }) }));
    const body = asRecord(await request.json());
    const allowed = ["name", "description", "language", "embedding_model", "permission", "chunk_method", "parser_config"];
    const config = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)));
    if (!Object.keys(config).length) throw new RagflowError("No hay configuración válida para actualizar.", 400);
    return Response.json(await ragflow(path, { method: "PUT", body: JSON.stringify(config) }));
  } catch (error) {
    const e = error instanceof RagflowError ? error : new RagflowError("No se pudo actualizar el dataset.");
    return Response.json({ error: e.message }, { status: e.status });
  }
}
