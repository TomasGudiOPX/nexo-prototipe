import { asList, asRecord, RagflowError, ragflow, validateDataset } from "../server/ragflow.server";
import { requireUser } from "../server/auth.server";
import { workspaceHasResource } from "../server/workspaces.server";
import { action as adminDocumentsAction } from "./api.admin.datasets.$datasetId.documents";
import { recordActivity } from "../server/workspaces.server";
import type { Route } from "./+types/api.workspaces.$workspaceId.datasets.$datasetId.documents";

export async function loader({ request, params }: Route.LoaderArgs) {
  const auth = requireUser(request);
  if (!auth.user) return auth.response;
  const { workspaceId, datasetId } = params;
  if (!workspaceId || !datasetId || !workspaceHasResource(auth.user, workspaceId, "datasets", datasetId)) return Response.json({ error: "Dataset is not linked to this workspace." }, { status: 404 });
  try {
    const dataset = await validateDataset(datasetId);
    // RAGFlow caps page_size at 100; larger values silently fall back to 10 documents, so page through.
    const pageSize = 100;
    const rows: unknown[] = [];
    for (let page = 1; page <= 10; page++) {
      const list = asList(await ragflow(`/api/v1/datasets/${encodeURIComponent(datasetId)}/documents?page=${page}&page_size=${pageSize}`));
      rows.push(...list);
      if (list.length < pageSize) break;
    }
    const documents = rows.map(asRecord).map(row => ({
      id: String(row.id ?? row.document_id ?? ""), name: String(row.name ?? row.location ?? "Document"),
      status: String(row.ingestion_status ?? row.run ?? "unknown"), chunks: Number(row.chunk_count ?? 0),
      enabled: row.status == null ? null : String(row.status) === "1",
      size: row.size == null ? null : Number(row.size), tokens: row.token_count == null ? null : Number(row.token_count),
      progress: row.progress == null ? null : Number(row.progress), progressMessage: String(row.progress_msg ?? ""),
      parser: String(row.chunk_method ?? row.parser_id ?? ""), pipeline: String(row.pipeline_name ?? row.pipeline_id ?? ""),
      metadata: asRecord(row.meta_fields), createdAt: row.create_time ?? row.create_date ?? null,
      updatedAt: String(row.update_time ?? row.updated_at ?? ""),
    })).filter(row => row.id);
    return Response.json({ dataset: { id: datasetId, name: String(dataset.name ?? "Dataset"), pipeline: Boolean(dataset.pipeline_id ?? asRecord(dataset.parser_config).pipeline_id) }, documents }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const e = error instanceof RagflowError ? error : new RagflowError("Documents are unavailable.");
    return Response.json({ error: e.message }, { status: e.status });
  }
}

export async function action({ request, params }: Route.ActionArgs) {
  const auth = requireUser(request);
  if (!auth.user) return auth.response;
  const { workspaceId, datasetId } = params;
  if (!workspaceId || !datasetId || !workspaceHasResource(auth.user, workspaceId, "datasets", datasetId)) return Response.json({ error: "Dataset is not linked to this workspace." }, { status: 404 });
  const response = await adminDocumentsAction({ request, params: { datasetId } } as never);
  const event = response.ok ? { type: "knowledge.operation.completed", summary: "A RAGFlow document operation completed." } : { type: "knowledge.operation.failed", summary: "A RAGFlow document operation failed." };
  recordActivity({ workspaceId, actorId: auth.user.id, ...event });
  return response;
}
