import { asList, asRecord, RagflowError, ragflow, validateDataset } from "../server/ragflow.server";
import { canMutate, requireUser, validateMutationOrigin } from "../server/auth.server";
import { assistantAccessFor, assistantVisibilitySnapshot } from "../server/assistants.server";
import { bindWorkspaceResource, listWorkspaces, requireWorkspaceAccess, unbindWorkspaceResource } from "../server/workspaces.server";
import type { Route } from "./+types/api.workspaces.$workspaceId.resources";

export async function loader({ request, params }: Route.LoaderArgs) {
  const catalog = new URL(request.url).searchParams.get("catalog") === "1";
  const auth = requireUser(request);
  if (!auth.user) return auth.response;
  const user = auth.user;
  const workspaceId = params.workspaceId;
  if (!workspaceId || !requireWorkspaceAccess(user, workspaceId)) return Response.json({ error: "Workspace not found." }, { status: 404 });
  // Linking an existing assistant is an owner action: a plain member only sees
  // the assistants already linked to the workspace.
  const membership = listWorkspaces(user).find(row => row.id === workspaceId);
  if (catalog && user.role !== "site-admin" && membership?.role !== "owner") return Response.json({ error: "Workspace not found." }, { status: 404 });
  try {
    const [datasetsRaw, assistantsRaw] = await Promise.all([
      ragflow("/api/v1/datasets?page=1&page_size=1000"),
      ragflow("/api/v1/chats?page=1&page_size=1000"),
    ]);
    const visibility = assistantVisibilitySnapshot();
    const datasets = asList(datasetsRaw).map(asRecord).map(row => ({ id: String(row.id ?? row.dataset_id ?? ""), name: String(row.name ?? row.title ?? "Dataset") })).filter(row => row.id);
    const assistants = asList(assistantsRaw).map(asRecord).map(row => {
      const id = String(row.id ?? row.chat_id ?? "");
      const access = assistantAccessFor(visibility, id, user);
      return {
        id,
        name: String(row.name ?? row.title ?? "Assistant"),
        ownerId: access.ownerId,
        ownerName: access.ownerName,
        mine: access.mine,
        visible: access.visible,
        sharedWith: [...(visibility.sharedWith.get(id) ?? [])],
        datasetNames: Array.isArray(row.kb_names) ? row.kb_names.map(String) : [],
      };
    }).filter(row => row.id);
    if (catalog) return Response.json({ datasets, assistants: assistants.filter(row => row.visible).map(({ visible, ...rest }) => rest) }, { headers: { "Cache-Control": "no-store" } });
    const datasetIds = new Set(membership?.datasets.map(row => String((row as { id: string }).id)) ?? []);
    const assistantIds = new Set(membership?.assistants.map(row => String((row as { id: string }).id)) ?? []);
    return Response.json({
      datasets: datasets.filter(row => datasetIds.has(row.id)),
      assistants: assistants.filter(row => assistantIds.has(row.id) && row.visible).map(({ visible, ...rest }) => rest),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const e = error instanceof RagflowError ? error : new RagflowError("RAGFlow resources are unavailable.");
    return Response.json({ error: e.message, datasets: [], assistants: [] }, { status: e.status });
  }
}

export async function action({ request, params }: Route.ActionArgs) {
  // Binding and unbinding are enforced per resource by bindWorkspaceResource /
  // unbindWorkspaceResource: a site admin or the workspace owner may change
  // bindings, while a plain member is refused there. Authenticating any user
  // keeps that single source of truth instead of duplicating it here.
  const auth = requireUser(request);
  if (!auth.user) return auth.response;
  const workspaceId = params.workspaceId;
  if (!validateMutationOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  if (!workspaceId || !requireWorkspaceAccess(auth.user, workspaceId)) return Response.json({ error: "Workspace not found." }, { status: 404 });
  if (!canMutate(auth.user)) return Response.json({ error: "Un auditor no puede cambiar los recursos del espacio." }, { status: 403 });
  try {
    const body = await request.json() as { kind?: unknown; id?: unknown; name?: unknown; action?: unknown };
    if (body.kind !== "datasets" && body.kind !== "assistants" || typeof body.id !== "string") return Response.json({ error: "Invalid resource binding." }, { status: 400 });
    if (request.method === "DELETE" || body.action === "unbind") {
      unbindWorkspaceResource(auth.user, workspaceId, body.kind, body.id);
      return Response.json({ ok: true });
    }
    if (request.method !== "POST" || typeof body.name !== "string") return Response.json({ error: "Invalid resource binding." }, { status: 400 });
    let verifiedName = body.name;
    if (body.kind === "datasets") {
      const dataset = await validateDataset(body.id);
      verifiedName = String(dataset.name ?? dataset.title ?? body.name);
    } else {
      const rows = asList(await ragflow("/api/v1/chats?page=1&page_size=1000")).map(asRecord);
      const assistant = rows.find(row => String(row.id ?? row.chat_id ?? "") === body.id);
      if (!assistant) throw new RagflowError("Assistant is not available in RAGFlow.", 404);
      verifiedName = String(assistant.name ?? assistant.title ?? body.name);
    }
    bindWorkspaceResource(auth.user, workspaceId, body.kind, body.id, verifiedName);
    return Response.json({ ok: true, name: verifiedName });
  } catch (error) {
    const e = error instanceof RagflowError ? error : new RagflowError(error instanceof Error ? error.message : "Could not update workspace binding.", 400);
    return Response.json({ error: e.message }, { status: e.status });
  }
}
