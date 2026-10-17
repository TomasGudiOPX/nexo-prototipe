import { requireKnowledgeManager } from "../server/auth.server";
import { userCanReachDataset } from "../server/workspaces.server";
import { serveDocumentFile } from "../server/document-file.server";
import type { Route } from "./+types/api.admin.datasets.$datasetId.documents.$documentId";

export async function loader({ request, params }: Route.LoaderArgs) {
  const auth = requireKnowledgeManager(request);
  if (!auth.user) return auth.response;
  const { datasetId, documentId } = params;
  // A knowledge manager only reaches documents of datasets bound to their workspaces.
  if (!datasetId || !documentId || !userCanReachDataset(auth.user, datasetId)) {
    return Response.json({ error: "Acceso denegado." }, { status: 403 });
  }
  return serveDocumentFile(request, datasetId, documentId);
}
