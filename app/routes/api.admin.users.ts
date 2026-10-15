import { createUser, isNexoRole, listUsers, requireSiteAdmin, toNexoArea, updateUser, validateMutationOrigin } from "../server/auth.server";
import { listUserWorkspaces, listWorkspaceOptions, recordActivity, setUserWorkspaces } from "../server/workspaces.server";
import type { Route } from "./+types/api.admin.users";

export function loader({ request }: Route.LoaderArgs) {
  const auth = requireSiteAdmin(request);
  if (!auth.user) return auth.response;
  try {
    // Each account carries the workspaces it can reach so the directory can
    // grant or revoke that access without leaving the screen.
    const users = listUsers().map(user => ({ ...user, workspaces: listUserWorkspaces(user.id) }));
    return Response.json({ users, workspaces: listWorkspaceOptions() }, { headers: { "Cache-Control": "no-store" } });
  }
  catch { return Response.json({ error: "No se pudo cargar la lista de usuarios." }, { status: 503 }); }
}

export async function action({ request }: Route.ActionArgs) {
  const auth = requireSiteAdmin(request);
  if (!auth.user) return auth.response;
  if (!validateMutationOrigin(request)) return Response.json({ error: "Origen de solicitud no válido." }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "create") {
      const user = createUser({ email: String(body.email ?? ""), displayName: String(body.displayName ?? ""), password: String(body.password ?? ""), role: isNexoRole(body.role) ? body.role : "user", area: toNexoArea(body.area) });
      return Response.json({ user }, { status: 201, headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "update" && typeof body.id === "string") {
      const role = isNexoRole(body.role) ? body.role : undefined;
      const patch = {
        ...(typeof body.displayName === "string" ? { displayName: body.displayName } : {}),
        ...(role ? { role } : {}),
        ...(typeof body.area === "string" ? { area: toNexoArea(body.area) } : {}),
        ...(typeof body.active === "boolean" ? { active: body.active } : {}),
        ...(typeof body.password === "string" && body.password ? { password: body.password } : {}),
      };
      if (!Object.keys(patch).length) return Response.json({ error: "No hay cambios válidos." }, { status: 400 });
      if (!updateUser(body.id, patch)) return Response.json({ error: "Usuario no encontrado." }, { status: 404 });
      return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "workspaces" && typeof body.id === "string") {
      const workspaceIds = Array.isArray(body.workspaceIds) ? body.workspaceIds.filter((id): id is string => typeof id === "string" && id.length < 128) : [];
      if (!listUsers().some(user => user.id === body.id)) return Response.json({ error: "Usuario no encontrado." }, { status: 404 });
      const { added, removed } = setUserWorkspaces(body.id, workspaceIds);
      // Reuse the workspace event types so the activity feed keeps its badges.
      for (const workspaceId of added) recordActivity({ workspaceId, actorId: auth.user.id, type: "workspace.member.added", summary: "A workspace member was added." });
      for (const workspaceId of removed) recordActivity({ workspaceId, actorId: auth.user.id, type: "workspace.member.removed", summary: "A workspace member was removed." });
      return Response.json({ ok: true, added: added.length, removed: removed.length, workspaces: listUserWorkspaces(body.id) }, { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ error: "Operación no válida." }, { status: 400 });
  } catch (error) {
    const duplicate = String(error).includes("UNIQUE constraint failed");
    return Response.json({ error: duplicate ? "Ya existe una cuenta con ese email." : error instanceof Error ? error.message : "No se pudo guardar el usuario." }, { status: duplicate ? 409 : 400, headers: { "Cache-Control": "no-store" } });
  }
}
