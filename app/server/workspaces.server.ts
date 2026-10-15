import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { withDatabase } from "./database.server";
import { assistantAccessFor, assistantVisibility } from "./assistants.server";
import type { NexoUser } from "./auth.server";

type WorkspaceRow = { id: string; name: string; description: string; created_by: string; created_at: string };

export function canAccessWorkspace(db: DatabaseSync, user: NexoUser, workspaceId: string) {
  if (user.role === "site-admin") return Boolean(db.prepare("SELECT 1 FROM workspaces WHERE id=?").get(workspaceId));
  return Boolean(db.prepare("SELECT 1 FROM workspace_members WHERE workspace_id=? AND user_id=?").get(workspaceId, user.id));
}

export function requireWorkspaceAccess(user: NexoUser, workspaceId: string) {
  return withDatabase(db => canAccessWorkspace(db, user, workspaceId));
}

export function workspaceHasResource(user: NexoUser, workspaceId: string, kind: "datasets" | "assistants", id: string) {
  return withDatabase(db => {
    if (!canAccessWorkspace(db, user, workspaceId)) return false;
    const table = kind === "datasets" ? "workspace_datasets" : "workspace_assistants";
    const idColumn = kind === "datasets" ? "dataset_id" : "assistant_id";
    return Boolean(db.prepare(`SELECT 1 FROM ${table} WHERE workspace_id=? AND ${idColumn}=?`).get(workspaceId, id));
  });
}

export function recordActivity(input: { workspaceId?: string | null; actorId?: string | null; type: string; summary: string; detail?: string }) {
  withDatabase(db => db.prepare("INSERT INTO activity_events(id,workspace_id,actor_id,event_type,summary,detail) VALUES(?,?,?,?,?,?)")
    .run(randomBytes(16).toString("hex"), input.workspaceId ?? null, input.actorId ?? null, input.type, input.summary.slice(0, 160), (input.detail ?? "").slice(0, 1000)));
}

export function listWorkspaces(user: NexoUser) {
  return withDatabase(db => {
    const rows = (user.role === "site-admin"
      ? db.prepare("SELECT * FROM workspaces ORDER BY name").all()
      : db.prepare("SELECT w.* FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id WHERE m.user_id=? ORDER BY w.name").all(user.id)) as WorkspaceRow[];
    // Assistants with a recorded author are private until shared, so the
    // selector and the workspace cards only offer what this user can use.
    const visibility = assistantVisibility(db);
    return rows.map(row => ({
      id: row.id, name: row.name, description: row.description, createdAt: row.created_at,
      datasets: db.prepare("SELECT dataset_id AS id,dataset_name AS name FROM workspace_datasets WHERE workspace_id=? ORDER BY dataset_name").all(row.id),
      assistants: (db.prepare("SELECT assistant_id AS id,assistant_name AS name FROM workspace_assistants WHERE workspace_id=? ORDER BY assistant_name").all(row.id) as { id: string; name: string }[])
        .filter(assistant => assistantAccessFor(visibility, assistant.id, user).visible),
      memberCount: Number((db.prepare("SELECT COUNT(*) AS count FROM workspace_members WHERE workspace_id=?").get(row.id) as { count: number }).count),
      role: user.role === "site-admin" ? "site-admin" : String((db.prepare("SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?").get(row.id, user.id) as { role: string } | undefined)?.role ?? "member"),
    }));
  });
}

// Members of the workspaces where an assistant is linked: the only people the
// author may share it with.
export function assistantAudienceIds(assistantId: string) {
  return withDatabase(db => new Set((db.prepare("SELECT DISTINCT m.user_id AS userId FROM workspace_assistants wa JOIN workspace_members m ON m.workspace_id=wa.workspace_id WHERE wa.assistant_id=?").all(assistantId) as { userId: string }[]).map(row => row.userId)));
}

// Datasets a knowledge manager may operate on: those bound to a workspace they
// belong to. Site admins reach every dataset.
export function userCanReachDataset(user: NexoUser, datasetId: string) {
  if (user.role === "site-admin") return true;
  return withDatabase(db => Boolean(db.prepare("SELECT 1 FROM workspace_datasets wd JOIN workspace_members m ON m.workspace_id=wd.workspace_id WHERE wd.dataset_id=? AND m.user_id=?").get(datasetId, user.id)));
}

export function listWorkspaceOptions() {
  return withDatabase(db => db.prepare("SELECT id,name FROM workspaces ORDER BY name").all() as { id: string; name: string }[]);
}

export function listUserWorkspaces(userId: string) {
  return withDatabase(db => db.prepare("SELECT w.id AS id,w.name AS name,m.role AS role FROM workspace_members m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=? ORDER BY w.name").all(userId) as { id: string; name: string; role: string }[]);
}

// Site-admin surface: grants or revokes plain membership. Ownership is created
// with the workspace and is never revoked from the user directory.
export function setUserWorkspaces(userId: string, workspaceIds: string[]) {
  const wanted = new Set(workspaceIds.filter(id => typeof id === "string" && id));
  return withDatabase(db => {
    const known = new Set((db.prepare("SELECT id FROM workspaces").all() as { id: string }[]).map(row => row.id));
    const current = db.prepare("SELECT workspace_id AS id,role FROM workspace_members WHERE user_id=?").all(userId) as { id: string; role: string }[];
    const held = new Set(current.map(row => row.id));
    const insert = db.prepare("INSERT OR IGNORE INTO workspace_members(workspace_id,user_id,role) VALUES(?,?,'member')");
    const remove = db.prepare("DELETE FROM workspace_members WHERE workspace_id=? AND user_id=? AND role!='owner'");
    const added: string[] = [];
    const removed: string[] = [];
    for (const id of wanted) {
      if (!known.has(id) || held.has(id)) continue;
      insert.run(id, userId);
      added.push(id);
    }
    for (const row of current) {
      if (wanted.has(row.id) || row.role === "owner") continue;
      if (Number(remove.run(row.id, userId).changes)) removed.push(row.id);
    }
    return { added, removed };
  });
}

export function createWorkspace(user: NexoUser, input: { name: string; description?: string }) {
  const name = input.name.trim();
  const description = (input.description ?? "").trim();
  if (!name || name.length > 100 || description.length > 500) throw new Error("Workspace name is required (100 characters max); description is limited to 500 characters.");
  const id = randomBytes(16).toString("hex");
  withDatabase(db => {
    db.prepare("INSERT INTO workspaces(id,name,description,created_by) VALUES(?,?,?,?)").run(id, name, description, user.id);
    db.prepare("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(?,?,'owner')").run(id, user.id);
  });
  recordActivity({ workspaceId: id, actorId: user.id, type: "workspace.created", summary: `Workspace created: ${name}` });
  return listWorkspaces(user).find(workspace => workspace.id === id);
}

export function bindWorkspaceResource(user: NexoUser, workspaceId: string, kind: "datasets" | "assistants", id: string, name: string, options: { requireOwner?: boolean } = {}) {
  const requireOwner = options.requireOwner ?? true;
  if (!id || id.length > 200 || !name.trim() || name.length > 200) throw new Error("Resource id and name are required.");
  withDatabase(db => {
    if (!canAccessWorkspace(db, user, workspaceId)) throw new Error("Workspace not found.");
    const owner = db.prepare("SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?").get(workspaceId, user.id) as { role: string } | undefined;
    if (requireOwner && user.role !== "site-admin" && owner?.role !== "owner") throw new Error("Only a workspace owner can change resource bindings.");
    const table = kind === "datasets" ? "workspace_datasets" : "workspace_assistants";
    const idColumn = kind === "datasets" ? "dataset_id" : "assistant_id";
    const nameColumn = kind === "datasets" ? "dataset_name" : "assistant_name";
    db.prepare(`INSERT INTO ${table}(workspace_id,${idColumn},${nameColumn}) VALUES(?,?,?) ON CONFLICT(workspace_id,${idColumn}) DO UPDATE SET ${nameColumn}=excluded.${nameColumn}`).run(workspaceId, id, name.trim());
  });
  recordActivity({ workspaceId, actorId: user.id, type: `workspace.${kind}.bound`, summary: `${kind === "datasets" ? "Dataset" : "Assistant"} linked: ${name.trim()}` });
}

export function unbindWorkspaceResource(user: NexoUser, workspaceId: string, kind: "datasets" | "assistants", id: string) {
  withDatabase(db => {
    if (!canAccessWorkspace(db, user, workspaceId)) throw new Error("Workspace not found.");
    const owner = db.prepare("SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?").get(workspaceId, user.id) as { role: string } | undefined;
    if (user.role !== "site-admin" && owner?.role !== "owner") throw new Error("Only a workspace owner can change resource bindings.");
    const table = kind === "datasets" ? "workspace_datasets" : "workspace_assistants";
    const idColumn = kind === "datasets" ? "dataset_id" : "assistant_id";
    db.prepare(`DELETE FROM ${table} WHERE workspace_id=? AND ${idColumn}=?`).run(workspaceId, id);
  });
  recordActivity({ workspaceId, actorId: user.id, type: `workspace.${kind}.unbound`, summary: `${kind === "datasets" ? "Dataset" : "Assistant"} unlinked` });
}
