import { asRecord, RagflowError, ragflow } from "../server/ragflow.server";
import { canMutate, requireUser, validateMutationOrigin } from "../server/auth.server";
import { assistantAccessFor, assistantVisibilitySnapshot, recordAssistantOwner, setAssistantShares } from "../server/assistants.server";
import { assistantAudienceIds, bindWorkspaceResource, requireWorkspaceAccess } from "../server/workspaces.server";
import type { Route } from "./+types/api.admin.assistants";

export async function loader({ request }: Route.LoaderArgs) {
  const auth = requireUser(request); if (!auth.user) return auth.response;
  const user = auth.user;
  try {
    const visibility = assistantVisibilitySnapshot();
    const payload = asRecord(await ragflow("/api/v1/chats?page=1&page_size=1000"));
    const data = asRecord(payload.data);
    const chats = Array.isArray(data.chats) ? data.chats.map(asRecord) : [];
    const decorated = chats.flatMap(row => {
      const id = String(row.id ?? row.chat_id ?? "");
      const access = assistantAccessFor(visibility, id, user);
      if (!access.visible) return [];
      return [{ ...row, ownerId: access.ownerId, ownerName: access.ownerName, mine: access.mine, sharedWith: [...(visibility.sharedWith.get(id) ?? [])] }];
    });
    return Response.json({ ...payload, data: { ...data, chats: decorated } }, { headers: { "Cache-Control": "no-store" } });
  }
  catch (error) { return failure(error, "No se pudieron cargar los asistentes."); }
}

export async function action({ request }: Route.ActionArgs) {
  const auth = requireUser(request); if (!auth.user) return auth.response;
  const user = auth.user;
  if (!validateMutationOrigin(request)) return Response.json({ error: "Origen de solicitud no válido." }, { status: 403 });
  // An auditor consults but never changes assistants.
  if (!canMutate(user)) return Response.json({ error: "Un auditor no puede crear, editar ni compartir asistentes." }, { status: 403 });
  try {
    const body = asRecord(await request.json());
    const bodyId = typeof body.id === "string" && body.id.length < 128 ? body.id : "";

    // Sharing changes the audience of an existing assistant, so it carries no
    // name and is handled before the create/rename validation.
    if (request.method === "PUT" && bodyId && Array.isArray(body.shares)) {
      if (user.role !== "site-admin" && !assistantAccessFor(assistantVisibilitySnapshot(), bodyId, user).mine) {
        return Response.json({ error: "Solo el autor o un administrador puede compartir este asistente." }, { status: 403 });
      }
      const requested = [...new Set(body.shares.filter((id): id is string => typeof id === "string" && id.length < 128))];
      const audience = assistantAudienceIds(bodyId);
      if (requested.some(id => !audience.has(id))) throw new RagflowError("Solo podés compartir el asistente con miembros de los espacios donde está vinculado.", 400);
      setAssistantShares(bodyId, requested);
      return Response.json({ ok: true, shares: requested });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const datasetIds = Array.isArray(body.dataset_ids) ? body.dataset_ids.filter((id): id is string => typeof id === "string" && id.length < 128) : [];
    if (!name || name.length > 128) throw new RagflowError("El nombre del asistente es obligatorio.", 400);
    const settings = assistantSettings(body);
    // Creation is allowed to any user with access to the target workspace; the
    // assistant is recorded as theirs and linked to that workspace in one step.
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
    if (request.method === "POST") {
      if (workspaceId && !requireWorkspaceAccess(user, workspaceId)) return Response.json({ error: "Workspace not found." }, { status: 404 });
      if (!workspaceId && user.role !== "site-admin") return Response.json({ error: "Elegí un espacio de trabajo para crear el asistente." }, { status: 403 });
      const created = await ragflow("/api/v1/chats", { method: "POST", body: JSON.stringify({ name, dataset_ids: datasetIds, ...settings }) });
      const chatId = String(asRecord(asRecord(created).data).id ?? asRecord(created).id ?? "");
      if (chatId) {
        recordAssistantOwner(chatId, user.id);
        if (workspaceId) bindWorkspaceResource(user, workspaceId, "assistants", chatId, name, { requireOwner: false });
      }
      return Response.json(created, { status: 201 });
    }
    if (request.method === "PUT" && bodyId) {
      if (user.role !== "site-admin" && !assistantAccessFor(assistantVisibilitySnapshot(), bodyId, user).mine) {
        return Response.json({ error: "Solo el autor o un administrador puede editar este asistente." }, { status: 403 });
      }
      return Response.json(await ragflow(`/api/v1/chats/${encodeURIComponent(bodyId)}`, { method: "PATCH", body: JSON.stringify({ name, dataset_ids: datasetIds, ...settings }) }));
    }
    throw new RagflowError("Operación de asistentes no válida.", 400);
  } catch (error) { return failure(error, "No se pudo guardar el asistente."); }
}

function assistantSettings(body: Record<string, unknown>) {
  const settings: Record<string, unknown> = {};
  for (const key of ["llm_id", "rerank_id"]) {
    const value = body[key];
    if (typeof value === "string" && value.trim() && value.length <= 256) settings[key] = value.trim();
  }
  if (body.llm_setting !== undefined) {
    if (!body.llm_setting || typeof body.llm_setting !== "object" || Array.isArray(body.llm_setting)) {
      throw new RagflowError("Los ajustes del modelo deben ser un objeto JSON.", 400);
    }
    settings.llm_setting = body.llm_setting;
  }
  const numericLimits: Record<string, [number, number]> = {
    top_n: [1, 1024],
    top_k: [1, 1024],
    rerank_candidates_count: [1, 4096],
    similarity_threshold: [0, 1],
    vector_similarity_weight: [0, 1],
  };
  for (const [key, [minimum, maximum]] of Object.entries(numericLimits)) {
    if (body[key] === undefined || body[key] === "") continue;
    const value = Number(body[key]);
    if (!Number.isFinite(value) || value < minimum || value > maximum) throw new RagflowError(`El valor de ${key} debe estar entre ${minimum} y ${maximum}.`, 400);
    settings[key] = value;
  }
  return settings;
}

function failure(error: unknown, fallback: string) {
  const e = error instanceof RagflowError ? error : new RagflowError(fallback);
  return Response.json({ error: e.message || fallback }, { status: e.status, headers: { "Cache-Control": "no-store" } });
}
