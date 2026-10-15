import { asRecord, RagflowError, ragflow, referenceList, serverConfigValue, validateDataset } from "../server/ragflow.server";
import { requireUser, validateMutationOrigin } from "../server/auth.server";
import { assistantAccessFor, assistantVisibilitySnapshot } from "../server/assistants.server";
import { recordActivity, workspaceHasResource } from "../server/workspaces.server";
import type { Route } from "./+types/api.chat";

export async function action({ request, params }: Route.ActionArgs) {
  const auth = requireUser(request); if (!auth.user) return auth.response;
  if (!validateMutationOrigin(request)) return Response.json({ error: "Origen de solicitud no válido." }, { status: 403 });
  let workspaceId: string | undefined;
  try {
    const id = params.datasetId;
    if (!id) throw new RagflowError("Dataset inválido.", 400);
    const body = await request.json() as { question?: unknown; conversationId?: unknown; toolInvocations?: unknown; workspaceId?: unknown; assistantId?: unknown };
    if (typeof body.workspaceId === "string") {
      if (!workspaceHasResource(auth.user, body.workspaceId, "datasets", id)) throw new RagflowError("Dataset is not linked to this workspace.", 404);
      workspaceId = body.workspaceId;
      if (typeof body.assistantId !== "string" || !workspaceHasResource(auth.user, workspaceId, "assistants", body.assistantId) || !assistantAccessFor(assistantVisibilitySnapshot(), body.assistantId, auth.user).visible) throw new RagflowError("Assistant is not linked to this workspace.", 404);
    }
    if (auth.user.role !== "site-admin" && !workspaceId) throw new RagflowError("Select an authorized workspace and assistant.", 403);
    await validateDataset(id);
    const chatMap = serverConfigValue("RAGFLOW_DATASET_CHAT_IDS");
    const mappedChatId = chatMap ? asRecord(JSON.parse(chatMap))[id] : undefined;
    let chatId = workspaceId && typeof body.assistantId === "string" ? body.assistantId : typeof mappedChatId === "string" && mappedChatId ? mappedChatId : undefined;
    if (!chatId) {
      const chatPayload = asRecord(await ragflow("/api/v1/chats?page=1&page_size=1000"));
      const chatData = asRecord(chatPayload.data);
      const chats = Array.isArray(chatData.chats) ? chatData.chats.map(asRecord) : [];
      const matchingChat = chats.find(chat => {
        const datasetIds = Array.isArray(chat.dataset_ids) ? chat.dataset_ids : Array.isArray(chat.kb_ids) ? chat.kb_ids : [];
        return datasetIds.some(datasetId => String(datasetId) === id);
      });
      chatId = typeof matchingChat?.id === "string" ? matchingChat.id : undefined;
    }
    if (!chatId) throw new RagflowError("No hay un asistente de RAGFlow vinculado a este dataset. Vinculá el dataset a un chat en RAGFlow o configurá RAGFLOW_DATASET_CHAT_IDS.", 404);
    if (typeof body.question !== "string" || !body.question.trim() || body.question.length > 12000) throw new RagflowError("Escribe una pregunta válida (máximo 12.000 caracteres).", 400);
    const invocations = Array.isArray(body.toolInvocations) ? body.toolInvocations : [];
    if (invocations.length) throw new RagflowError("La invocación de MCP desde este asistente está deshabilitada porque la API de RAGFlow conectada no confirmó un contrato compatible.", 501);
    const payload = await ragflow(`/api/v1/openai/${encodeURIComponent(chatId)}/chat/completions`, {
      method: "POST",
      body: JSON.stringify({
        model: "model",
        stream: false,
        messages: [{ role: "user", content: body.question.trim() }],
        // RAGFlow only attaches the retrieved chunks when the request asks for them;
        // without this flag the answer arrives with no evidence to show.
        extra_body: { reference: true },
        ...(typeof body.conversationId === "string" ? { conversation_id: body.conversationId } : {}),
      }),
    }) as Record<string, any>;
    const response = payload?.choices?.[0]?.message?.content ?? payload?.data?.answer ?? payload?.answer ?? "";
    const references = payload?.choices?.[0]?.message?.reference ?? payload?.data?.reference ?? payload?.reference ?? [];
    if (workspaceId) recordActivity({ workspaceId, actorId: auth.user.id, type: "assistant.query.succeeded", summary: "RAGFlow assistant answered a question." });
    return Response.json({ answer: typeof response === "string" ? response : JSON.stringify(response), references: referenceList(references), conversationId: payload?.data?.conversation_id ?? payload?.conversation_id ?? null });
  } catch (error) {
    const e = error instanceof RagflowError ? error : new RagflowError("No se pudo completar la consulta.");
    if (workspaceId) recordActivity({ workspaceId, actorId: auth.user.id, type: "assistant.query.failed", summary: "A RAGFlow assistant request failed.", detail: e.message });
    return Response.json({ error: e.message }, { status: e.status });
  }
}
