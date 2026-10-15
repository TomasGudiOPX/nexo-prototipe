import { action as chatAction } from "./api.chat";
import { requireUser } from "../server/auth.server";
import { workspaceHasResource } from "../server/workspaces.server";
import type { Route } from "./+types/api.workspaces.$workspaceId.datasets.$datasetId.chat";

export async function action({ request, params }: Route.ActionArgs) {
  const auth = requireUser(request);
  if (!auth.user) return auth.response;
  const { workspaceId, datasetId } = params;
  if (!workspaceId || !datasetId || !workspaceHasResource(auth.user, workspaceId, "datasets", datasetId)) return Response.json({ error: "Dataset is not linked to this workspace." }, { status: 404 });
  return chatAction({ request, params: { datasetId } } as never);
}
