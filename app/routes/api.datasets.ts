import { asList, asRecord, RagflowError, ragflow } from "../server/ragflow.server";
import { requireUser } from "../server/auth.server";
import { listWorkspaces, requireWorkspaceAccess } from "../server/workspaces.server";

export async function loader({ request }: { request: Request }) {
  const auth = requireUser(request); if (!auth.user) return auth.response;
  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (auth.user.role !== "site-admin" && (!workspaceId || !requireWorkspaceAccess(auth.user, workspaceId))) return Response.json({ error: "Select an authorized workspace." }, { status: 403 });
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
    let datasets = asList(raw).map(asRecord).map(row => ({ id: String(row.id ?? row.dataset_id ?? ""), name: String(row.name ?? row.title ?? "Dataset sin nombre") })).filter(row => row.id)
      .sort((a, b) => Number(linkedDatasetIds.has(b.id)) - Number(linkedDatasetIds.has(a.id)));
    if (auth.user.role !== "site-admin" && workspaceId) {
      const allowed = new Set(listWorkspaces(auth.user).find(workspace => workspace.id === workspaceId)?.datasets.map(row => String((row as { id: string }).id)) ?? []);
      datasets = datasets.filter(dataset => allowed.has(dataset.id));
    }
    return Response.json({ datasets }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const e = error instanceof RagflowError ? error : new RagflowError("No se pudieron cargar los datasets.");
    return Response.json({ error: e.message, datasets: [] }, { status: e.status });
  }
}
