import { requireUser } from "../server/auth.server";
import { withDatabase } from "../server/database.server";
import { requireWorkspaceAccess } from "../server/workspaces.server";

export async function loader({ request }: { request: Request }) {
  const auth = requireUser(request);
  if (!auth.user) return auth.response;
  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  const events = withDatabase(db => {
    if (workspaceId) {
      if (!requireWorkspaceAccess(auth.user!, workspaceId)) return null;
      return db.prepare("SELECT e.id,e.workspace_id AS workspaceId,e.event_type AS type,e.summary,e.detail,e.created_at AS createdAt,u.display_name AS actor FROM activity_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.workspace_id=? ORDER BY e.created_at DESC LIMIT 200").all(workspaceId);
    }
    return auth.user!.role === "site-admin"
      ? db.prepare("SELECT e.id,e.workspace_id AS workspaceId,e.event_type AS type,e.summary,e.detail,e.created_at AS createdAt,u.display_name AS actor FROM activity_events e LEFT JOIN users u ON u.id=e.actor_id ORDER BY e.created_at DESC LIMIT 200").all()
      : db.prepare("SELECT e.id,e.workspace_id AS workspaceId,e.event_type AS type,e.summary,e.detail,e.created_at AS createdAt,u.display_name AS actor FROM activity_events e LEFT JOIN users u ON u.id=e.actor_id LEFT JOIN workspace_members m ON m.workspace_id=e.workspace_id WHERE m.user_id=? OR (e.workspace_id IS NULL AND e.actor_id=?) ORDER BY e.created_at DESC LIMIT 200").all(auth.user!.id, auth.user!.id);
  });
  if (events === null) return Response.json({ error: "Workspace not found." }, { status: 404 });
  return Response.json({ events }, { headers: { "Cache-Control": "no-store" } });
}
