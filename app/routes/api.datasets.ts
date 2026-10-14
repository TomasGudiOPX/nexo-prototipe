import { asList, asRecord, RagflowError, ragflow } from "../server/ragflow";

export async function loader() {
  try {
    const [raw, chatRaw] = await Promise.all([
      ragflow("/api/v1/datasets?page=1&page_size=1000"),
      ragflow("/api/v1/chats?page=1&page_size=1000").catch(() => null),
    ]);
    const chatData = asRecord(asRecord(chatRaw).data);
    const linkedDatasetIds = new Set((Array.isArray(chatData.chats) ? chatData.chats : []).flatMap(chat => {
      const row = asRecord(chat);
      const ids = Array.isArray(row.dataset_ids) ? row.dataset_ids : Array.isArray(row.kb_ids) ? row.kb_ids : [];
      return ids.map(String);
    }));
    const datasets = asList(raw).map(asRecord).map(row => ({ id: String(row.id ?? row.dataset_id ?? ""), name: String(row.name ?? row.title ?? "Dataset sin nombre") })).filter(row => row.id)
      .sort((a, b) => Number(linkedDatasetIds.has(b.id)) - Number(linkedDatasetIds.has(a.id)));
    return Response.json({ datasets });
  } catch (error) {
    const e = error instanceof RagflowError ? error : new RagflowError("No se pudieron cargar los datasets.");
    return Response.json({ error: e.message, datasets: [] }, { status: e.status });
  }
}
