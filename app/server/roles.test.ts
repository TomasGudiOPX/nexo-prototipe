import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import type { NexoUser } from "./auth.server";

const dataDir = mkdtempSync(join(tmpdir(), "nexo-roles-"));
process.env.NEXO_DATA_DIR = dataDir;
process.env.NEXO_SESSION_SECRET = randomBytes(32).toString("hex");
process.env.RAGFLOW_BASE_URL = "https://ragflow.example.test";
process.env.RAGFLOW_API_KEY = randomBytes(32).toString("hex");

const auth = await import("./auth.server");
const workspaces = await import("./workspaces.server");
const { withDatabase } = await import("./database.server");
const usersRoute = await import("../routes/api.admin.users");
const settingsRoute = await import("../routes/api.admin.settings.ragflow");
const assistantsRoute = await import("../routes/api.admin.assistants");
const workspacesRoute = await import("../routes/api.workspaces");
const membersRoute = await import("../routes/api.workspaces.$workspaceId.members");
const resourcesRoute = await import("../routes/api.workspaces.$workspaceId.resources");
const documentsRoute = await import("../routes/api.admin.datasets.$datasetId.documents");
const activityRoute = await import("../routes/api.activity");
after(() => rmSync(dataDir, { recursive: true, force: true }));

const password = () => randomBytes(24).toString("hex");
const admin = auth.createUser({ email: "admin@roles.test", displayName: "Ada Admin", password: password(), role: "site-admin" })! as NexoUser;
const manager = auth.createUser({ email: "manager@roles.test", displayName: "Milo Manager", password: password(), role: "knowledge-manager", area: "operaciones" })! as NexoUser;
const auditor = auth.createUser({ email: "auditor@roles.test", displayName: "Ana Auditor", password: password(), role: "auditor", area: "legal" })! as NexoUser;
const member = auth.createUser({ email: "member@roles.test", displayName: "Mia Member", password: password(), role: "user" })! as NexoUser;

const workspace = workspaces.createWorkspace(admin, { name: "Obra Norte" })!;
workspaces.bindWorkspaceResource(admin, workspace.id, "datasets", "d1", "Procesos");
withDatabase(db => {
  for (const user of [manager, auditor, member]) db.prepare("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(?,?,'member')").run(workspace.id, user.id);
});

const originalFetch = globalThis.fetch;
globalThis.fetch = async input => {
  const url = String(input);
  if (url.includes("/chat/completions")) return Response.json({ code: 0, data: { answer: "Answered", reference: [] } });
  if (url.includes("/api/v1/chats")) return Response.json({ code: 0, data: { total: 0, chats: [] } });
  if (url.includes("/api/v1/datasets/d1/documents")) return Response.json({ code: 0, data: { docs: [] } });
  if (url.includes("/api/v1/datasets")) return Response.json({ code: 0, data: [{ id: "d1", name: "Procesos" }] });
  return Response.json({ code: 0, data: {} });
};
after(() => { globalThis.fetch = originalFetch; });

function request(path: string, user: NexoUser | null, init: { method?: string; body?: unknown } = {}) {
  const cookie = user ? auth.createSession(user, new Request("https://nexo.test")).cookie.split(";")[0] : "";
  return new Request("https://nexo.test" + path, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: { cookie, origin: "https://nexo.test", "Content-Type": "application/json" },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });
}
const args = (req: Request, extra: Record<string, string> = {}) => ({ request: req, params: { workspaceId: workspace.id, datasetId: "d1", ...extra }, context: {} } as any);

test("roles and organisational areas are validated and persisted", () => {
  assert.equal(manager.role, "knowledge-manager");
  assert.equal(manager.area, "operaciones");
  const stored = auth.listUsers().find(user => user.id === manager.id)!;
  assert.equal(stored.role, "knowledge-manager");
  assert.equal(stored.area, "operaciones");

  // An unknown role or area never reaches the database.
  assert.throws(() => auth.createUser({ email: "bad@roles.test", displayName: "Bad", password: password(), role: "superuser" as never }));
  auth.updateUser(auditor.id, { area: "no-existe" as never });
  assert.equal(auth.listUsers().find(user => user.id === auditor.id)!.area, "");
  auth.updateUser(auditor.id, { area: "legal" });
  assert.equal(auth.listUsers().find(user => user.id === auditor.id)!.area, "legal");

  // The last active site administrator keeps their role.
  assert.throws(() => auth.updateUser(admin.id, { role: "user" }), /último administrador/);
});

test("the users rebuild keeps foreign keys enforced", () => {
  const temporary = auth.createUser({ email: "temporary@roles.test", displayName: "Temporary", password: password(), role: "user" })! as NexoUser;
  withDatabase(db => db.prepare("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(?,?,'member')").run(workspace.id, temporary.id));
  withDatabase(db => db.prepare("DELETE FROM users WHERE id=?").run(temporary.id));
  const leftover = withDatabase(db => db.prepare("SELECT COUNT(*) AS count FROM workspace_members WHERE user_id=?").get(temporary.id) as { count: number });
  assert.equal(Number(leftover.count), 0, "workspace_members cascades after the users rebuild");
});

test("a knowledge manager operates documents only inside their workspaces", async () => {
  const bound = await documentsRoute.loader(args(request("/api/admin/datasets/d1/documents", manager)));
  assert.equal(bound.status, 200);
  const unbound = await documentsRoute.loader(args(request("/api/admin/datasets/d9/documents", manager), { datasetId: "d9" }));
  assert.equal(unbound.status, 403);
  // A plain member is not a knowledge manager, and an auditor never mutates.
  assert.equal((await documentsRoute.loader(args(request("/api/admin/datasets/d1/documents", member)))).status, 403);
  assert.equal((await documentsRoute.action(args(request("/api/admin/datasets/d1/documents", manager, { body: { action: "process", documentIds: ["doc-1"] } })))).status, 200);
  assert.equal((await documentsRoute.action(args(request("/api/admin/datasets/d1/documents", auditor, { body: { action: "process", documentIds: ["doc-1"] } })))).status, 403);
  assert.equal((await documentsRoute.loader(args(request("/api/admin/datasets/d1/documents", admin)))).status, 200);
});

test("a knowledge manager stays out of site configuration", async () => {
  assert.equal((await usersRoute.loader({ request: request("/api/admin/users", manager) } as any)).status, 403);
  assert.equal((await settingsRoute.loader({ request: request("/api/admin/settings/ragflow", manager) } as any)).status, 403);
  assert.equal((await usersRoute.loader({ request: request("/api/admin/users", admin) } as any)).status, 200);
});

test("an auditor reads everything granted and changes nothing", async () => {
  // Reads still work.
  assert.equal((await activityRoute.loader({ request: request("/api/activity", auditor) })).status, 200);
  assert.equal((await workspacesRoute.loader({ request: request("/api/workspaces", auditor) })).status, 200);
  assert.equal((await resourcesRoute.loader(args(request(`/api/workspaces/${workspace.id}/resources`, auditor)))).status, 200);
  // Every mutation is refused by the API, not only hidden in the interface.
  assert.equal((await assistantsRoute.action(args(request("/api/admin/assistants", auditor, { body: { name: "Nuevo", workspaceId: workspace.id } })))).status, 403);
  assert.equal((await workspacesRoute.action({ request: request("/api/workspaces", auditor, { body: { name: "Nuevo espacio" } }) })).status, 403);
  assert.equal((await membersRoute.action(args(request(`/api/workspaces/${workspace.id}/members`, auditor, { body: { email: "member@roles.test" } })))).status, 403);
  assert.equal((await resourcesRoute.action(args(request(`/api/workspaces/${workspace.id}/resources`, auditor, { method: "DELETE", body: { kind: "datasets", id: "d1" } })))).status, 403);
  // A plain member can still create their own assistant in a workspace they belong to.
  assert.equal((await assistantsRoute.action(args(request("/api/admin/assistants", member, { body: { name: "Del miembro", workspaceId: workspace.id } })))).status, 201);
});
