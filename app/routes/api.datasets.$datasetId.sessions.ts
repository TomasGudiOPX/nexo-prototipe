import { asRecord, RagflowError, ragflow, serverConfigValue, validateDataset } from "../server/ragflow.server";
import { requireUser } from "../server/auth.server";
import { assistantAccessFor, assistantVisibilitySnapshot } from "../server/assistants.server";
import { workspaceHasResource } from "../server/workspaces.server";
import type { Route } from "./+types/api.datasets.$datasetId.sessions";

export async function loader({ request, params }: Route.LoaderArgs) {
  const auth = requireUser(request); if (!auth.user) return auth.response;
  try {
    const datasetId = params.datasetId;
    if (!datasetId) throw new RagflowError("Dataset inválido.", 400);
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId") || undefined;
    const requestedAssistantId = url.searchParams.get("assistantId") || undefined;
    if (workspaceId) {
      if (!workspaceHasResource(auth.user, workspaceId, "datasets", datasetId)) throw new RagflowError("Dataset is not linked to this workspace.", 404);
      if (!requestedAssistantId || !workspaceHasResource(auth.user, workspaceId, "assistants", requestedAssistantId) || !assistantAccessFor(assistantVisibilitySnapshot(), requestedAssistantId, auth.user).visible) throw new RagflowError("Assistant is not linked to this workspace.", 404);
    }
    if (auth.user.role !== "site-admin" && !workspaceId) throw new RagflowError("Select an authorized workspace and assistant.", 403);
    await validateDataset(datasetId);

    let chatId = requestedAssistantId;
    if (!chatId) {
      const chatMap = serverConfigValue("RAGFLOW_DATASET_CHAT_IDS");
      const mapped = chatMap ? asRecord(JSON.parse(chatMap))[datasetId] : undefined;
      chatId = typeof mapped === "string" && mapped ? mapped : undefined;
    }
    if (!chatId) throw new RagflowError("No hay un asistente de RAGFlow vinculado a este dataset.", 404);
    const payload = asRecord(await ragflow(`/api/v1/chats/${encodeURIComponent(chatId)}/sessions?page=1&page_size=100&include_history=true`));
    const sessions = Array.isArray(payload.data) ? payload.data : [];
    return Response.json({ sessions });
  } catch (error) {
    const e = error instanceof RagflowError ? error : new RagflowError("No se pudieron cargar las sesiones.");
    return Response.json({ error: e.message }, { status: e.status });
  }
}
