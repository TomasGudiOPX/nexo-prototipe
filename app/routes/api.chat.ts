import { asRecord, RagflowError, ragflow, referenceList, serverConfigValue, validateDataset } from "../server/ragflow";
import type { Route } from "./+types/api.chat";

export async function action({ request, params }: Route.ActionArgs) {
  try {
    const id = params.datasetId;
    if (!id) throw new RagflowError("Dataset inválido.", 400);
    await validateDataset(id);
    const chatMap = serverConfigValue("RAGFLOW_DATASET_CHAT_IDS");
    const mappedChatId = chatMap ? asRecord(JSON.parse(chatMap))[id] : undefined;
    let chatId = typeof mappedChatId === "string" && mappedChatId ? mappedChatId : undefined;
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
    const body = await request.json() as { question?: unknown; conversationId?: unknown };
    if (typeof body.question !== "string" || !body.question.trim() || body.question.length > 12000) throw new RagflowError("Escribe una pregunta válida (máximo 12.000 caracteres).", 400);
    const payload = await ragflow(`/api/v1/openai/${encodeURIComponent(chatId)}/chat/completions`, {
      method: "POST",
      body: JSON.stringify({ model: "model", stream: false, messages: [{ role: "user", content: body.question.trim() }], ...(typeof body.conversationId === "string" ? { conversation_id: body.conversationId } : {}) }),
    }) as Record<string, any>;
    const response = payload?.choices?.[0]?.message?.content ?? payload?.data?.answer ?? payload?.answer ?? "";
    const references = payload?.choices?.[0]?.message?.reference ?? payload?.data?.reference ?? payload?.reference ?? [];
    return Response.json({ answer: typeof response === "string" ? response : JSON.stringify(response), references: referenceList(references), conversationId: payload?.data?.conversation_id ?? payload?.conversation_id ?? null });
  } catch (error) {
    const e = error instanceof RagflowError ? error : new RagflowError("No se pudo completar la consulta.");
    return Response.json({ error: e.message }, { status: e.status });
  }
}
