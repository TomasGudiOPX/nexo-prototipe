import { requireUser } from "../server/auth.server";
import { workspaceHasResource } from "../server/workspaces.server";
import { serveDocumentFile } from "../server/document-file.server";
import type { Route } from "./+types/api.workspaces.$workspaceId.datasets.$datasetId.documents.$documentId";

export async function loader({ request, params }: Route.LoaderArgs) {
  const auth = requireUser(request);
  if (!auth.user) return auth.response;
  const { workspaceId, datasetId, documentId } = params;
  if (!workspaceId || !datasetId || !documentId || !workspaceHasResource(auth.user, workspaceId, "datasets", datasetId)) {
    return Response.json({ error: "Dataset no vinculado a este espacio." }, { status: 404 });
  }
  return serveDocumentFile(request, datasetId, documentId);
}
