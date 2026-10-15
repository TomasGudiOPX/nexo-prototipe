import { randomBytes } from "node:crypto";
import { canMutate, requireUser, validateMutationOrigin } from "../server/auth.server";
import { withDatabase } from "../server/database.server";
import { requireWorkspaceAccess, recordActivity } from "../server/workspaces.server";
import type { Route } from "./+types/api.workspaces.$workspaceId.members";

export async function loader({ request, params }: Route.LoaderArgs) {
  const auth = requireUser(request);
  if (!auth.user) return auth.response;
  const workspaceId = params.workspaceId;
  if (!workspaceId || !requireWorkspaceAccess(auth.user, workspaceId)) return Response.json({ error: "Workspace not found." }, { status: 404 });
  const members = withDatabase(db => db.prepare(`SELECT u.id,u.email,u.display_name AS displayName,m.role,m.created_at AS joinedAt FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? ORDER BY m.created_at`).all(workspaceId));
  return Response.json({ members }, { headers: { "Cache-Control": "no-store" } });
}

export async function action({ request, params }: Route.ActionArgs) {
  const auth = requireUser(request);
  if (!auth.user) return auth.response;
  const workspaceId = params.workspaceId;
  if (!validateMutationOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  if (!workspaceId || !requireWorkspaceAccess(auth.user, workspaceId)) return Response.json({ error: "Workspace not found." }, { status: 404 });
  if (!canMutate(auth.user)) return Response.json({ error: "Un auditor no puede gestionar miembros del espacio." }, { status: 403 });
  const body = await request.json() as { email?: unknown; userId?: unknown };
  try {
    if (request.method === "POST" && typeof body.email === "string") {
      const isOwner = withDatabase(db => Boolean(db.prepare("SELECT 1 FROM workspace_members WHERE workspace_id=? AND user_id=? AND role='owner'").get(workspaceId, auth.user!.id)));
      if (auth.user.role !== "site-admin" && !isOwner) return Response.json({ error: "Only workspace owners can manage members." }, { status: 403 });
      const email = body.email.trim().toLowerCase();
      const memberId = randomBytes(16).toString("hex");
      const result = withDatabase(db => {
        const target = db.prepare("SELECT id,active FROM users WHERE email=? COLLATE NOCASE").get(email) as { id: string; active: number } | undefined;
        if (!target || !target.active) return null;
        db.prepare("INSERT OR IGNORE INTO workspace_members(workspace_id,user_id,role) VALUES(?,?,'member')").run(workspaceId, target.id);
        return target.id;
      });
      if (!result) return Response.json({ error: "Active NEXO user not found." }, { status: 404 });
      recordActivity({ workspaceId, actorId: auth.user.id, type: "workspace.member.added", summary: "A workspace member was added." });
      return Response.json({ ok: true, memberId }, { status: 201 });
    }
    if (request.method === "DELETE" && typeof body.userId === "string") {
      const isOwner = withDatabase(db => Boolean(db.prepare("SELECT 1 FROM workspace_members WHERE workspace_id=? AND user_id=? AND role='owner'").get(workspaceId, auth.user!.id)));
      if (auth.user.role !== "site-admin" && !isOwner) return Response.json({ error: "Only workspace owners can manage members." }, { status: 403 });
      if (body.userId === auth.user.id && auth.user.role !== "site-admin") return Response.json({ error: "Workspace owners cannot remove themselves." }, { status: 400 });
      const result = withDatabase(db => db.prepare("DELETE FROM workspace_members WHERE workspace_id=? AND user_id=? AND role!='owner'").run(workspaceId, body.userId as string));
      if (!Number(result.changes)) return Response.json({ error: "Member not found or is the workspace owner." }, { status: 404 });
      recordActivity({ workspaceId, actorId: auth.user.id, type: "workspace.member.removed", summary: "A workspace member was removed." });
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Invalid membership operation." }, { status: 400 });
  } catch {
    return Response.json({ error: "Could not update workspace membership." }, { status: 400 });
  }
}
