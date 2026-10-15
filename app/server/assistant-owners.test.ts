import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import type { NexoUser } from "./auth.server";

const dataDir = mkdtempSync(join(tmpdir(), "nexo-assistant-owners-"));
process.env.NEXO_DATA_DIR = dataDir;
process.env.NEXO_SESSION_SECRET = randomBytes(32).toString("hex");
process.env.RAGFLOW_BASE_URL = "https://ragflow.example.test";
process.env.RAGFLOW_API_KEY = randomBytes(32).toString("hex");

const auth = await import("./auth.server");
const workspaces = await import("./workspaces.server");
const { withDatabase } = await import("./database.server");
const assistantsRoute = await import("../routes/api.admin.assistants");
const resourcesRoute = await import("../routes/api.workspaces.$workspaceId.resources");
const chatRoute = await import("../routes/api.workspaces.$workspaceId.datasets.$datasetId.chat");
after(() => rmSync(dataDir, { recursive: true, force: true }));

const password = () => randomBytes(24).toString("hex");
const admin = auth.createUser({ email: "admin@assistants.test", displayName: "Ada Admin", password: password(), role: "site-admin" })! as NexoUser;
const member = auth.createUser({ email: "member@assistants.test", displayName: "Mia Member", password: password(), role: "user" })! as NexoUser;
const colleague = auth.createUser({ email: "colleague@assistants.test", displayName: "Carla Colleague", password: password(), role: "user" })! as NexoUser;
const outsider = auth.createUser({ email: "outsider@assistants.test", displayName: "Oscar Outsider", password: password(), role: "user" })! as NexoUser;

const workspace = workspaces.createWorkspace(admin, { name: "Obra Norte" })!;
workspaces.bindWorkspaceResource(admin, workspace.id, "datasets", "d1", "Procesos");
withDatabase(db => {
  db.prepare("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(?,?,'member')").run(workspace.id, member.id);
  db.prepare("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(?,?,'member')").run(workspace.id, colleague.id);
});

// RAGFlow is stubbed: the chat list is tenant-scoped and returns no author, so
// every ownership and sharing assertion below comes from NEXO's own records.
const chats: Record<string, unknown>[] = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (init?.method === "POST" && url.endsWith("/api/v1/chats")) {
    const body = JSON.parse(String(init.body)) as { name: string };
    const created = { id: `chat-${chats.length + 1}`, name: body.name, kb_names: ["Procesos"] };
    chats.push(created);
    return Response.json({ code: 0, data: created });
  }
  if (url.includes("/chat/completions")) return Response.json({ code: 0, data: { answer: "Answered", reference: [] } });
  if (url.includes("/api/v1/chats")) return Response.json({ code: 0, data: { total: chats.length, chats } });
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
const args = (req: Request) => ({ request: req, params: { workspaceId: workspace.id }, context: {} } as any);
const chatArgs = (req: Request) => ({ request: req, params: { workspaceId: workspace.id, datasetId: "d1" }, context: {} } as any);
const seenBy = async (user: NexoUser) => {
  const payload = (await (await resourcesRoute.loader(args(request(`/api/workspaces/${workspace.id}/resources`, user)))).json()) as { assistants: Record<string, unknown>[] };
  return payload.assistants;
};

let chatId = "";
test("a workspace member creates an assistant that NEXO records as theirs and links to the space", async () => {
  const response = await assistantsRoute.action(args(request("/api/admin/assistants", member, { body: { name: "Asistente de obra", dataset_ids: ["d1"], workspaceId: workspace.id } })));
  assert.equal(response.status, 201);
  chatId = ((await response.json()) as { data: { id: string } }).data.id;
  const owner = withDatabase(db => db.prepare("SELECT owner_id AS ownerId FROM assistant_owners WHERE assistant_id=?").get(chatId)) as { ownerId: string };
  assert.equal(owner.ownerId, member.id);
  // Linking happens in the same request, so a plain member never needs the
  // owner-only binding endpoint to get their assistant into the workspace.
  assert.equal(workspaces.workspaceHasResource(member, workspace.id, "assistants", chatId), true);
});

test("creation outside an accessible workspace stays refused", async () => {
  const noSpace = await assistantsRoute.action(args(request("/api/admin/assistants", member, { body: { name: "Sin espacio" } })));
  assert.equal(noSpace.status, 403);
  const foreign = await assistantsRoute.action(args(request("/api/admin/assistants", outsider, { body: { name: "Ajeno", workspaceId: workspace.id } })));
  assert.equal(foreign.status, 404);
});

test("an assistant with a recorded author stays private until it is shared", async () => {
  const mine = await seenBy(member);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].mine, true);
  assert.equal(mine[0].ownerName, "Mia Member");
  assert.deepEqual(mine[0].datasetNames, ["Procesos"]);
  assert.deepEqual(mine[0].sharedWith, []);

  // Another member of the same workspace does not see it yet, and the
  // workspace list used by the assistant screen agrees.
  assert.deepEqual(await seenBy(colleague), []);
  assert.equal(workspaces.listWorkspaces(colleague)[0].assistants.length, 0);
  assert.equal(workspaces.listWorkspaces(member)[0].assistants.length, 1);

  // A site administrator keeps full visibility.
  assert.equal((await seenBy(admin)).length, 1);
});

test("the author shares with a workspace member and only that member gains access", async () => {
  const shared = await assistantsRoute.action(args(request("/api/admin/assistants", member, { method: "PUT", body: { id: chatId, shares: [colleague.id] } })));
  assert.equal(shared.status, 200);
  assert.deepEqual((await shared.json()) as unknown, { ok: true, shares: [colleague.id] });

  const forColleague = await seenBy(colleague);
  assert.equal(forColleague.length, 1);
  assert.equal(forColleague[0].mine, false);
  assert.equal(forColleague[0].ownerName, "Mia Member");
  assert.deepEqual(forColleague[0].sharedWith, [colleague.id]);
  assert.equal(workspaces.listWorkspaces(colleague)[0].assistants.length, 1);

  // The workspace outsider never gains access, and the assistant screen stops
  // listing the assistant once sharing is removed.
  assert.equal((await resourcesRoute.loader(args(request(`/api/workspaces/${workspace.id}/resources`, outsider)))).status, 404);
  await assistantsRoute.action(args(request("/api/admin/assistants", member, { method: "PUT", body: { id: chatId, shares: [] } })));
  assert.deepEqual(await seenBy(colleague), []);
});

test("sharing is limited to workspace members and to the author", async () => {
  const foreign = await assistantsRoute.action(args(request("/api/admin/assistants", member, { method: "PUT", body: { id: chatId, shares: [outsider.id] } })));
  assert.equal(foreign.status, 400);
  const hijack = await assistantsRoute.action(args(request("/api/admin/assistants", colleague, { method: "PUT", body: { id: chatId, shares: [colleague.id] } })));
  assert.equal(hijack.status, 403);
});

test("querying an unshared assistant is refused by the API, not just hidden in the UI", async () => {
  const body = { question: "¿Cuántos procesos hay?", workspaceId: workspace.id, assistantId: chatId };
  assert.equal((await chatRoute.action(chatArgs(request("/api/workspaces/w/datasets/d1/chat", colleague, { body })))).status, 404);
  await assistantsRoute.action(args(request("/api/admin/assistants", member, { method: "PUT", body: { id: chatId, shares: [colleague.id] } })));
  const allowed = await chatRoute.action(chatArgs(request("/api/workspaces/w/datasets/d1/chat", colleague, { body })));
  assert.equal(allowed.status, 200);
  assert.equal(((await allowed.json()) as { answer: string }).answer, "Answered");
});

test("only the author or a site admin can edit an assistant", async () => {
  const refused = await assistantsRoute.action(args(request("/api/admin/assistants", colleague, { method: "PUT", body: { id: chatId, name: "Renombrado" } })));
  assert.equal(refused.status, 403);
  const allowed = await assistantsRoute.action(args(request("/api/admin/assistants", member, { method: "PUT", body: { id: chatId, name: "Renombrado" } })));
  assert.equal(allowed.status, 200);
});

test("chat listings report the recorded author and whether it is the caller", async () => {
  const asMember = (await (await assistantsRoute.loader(args(request("/api/admin/assistants", member)))).json()) as { data: { chats: Record<string, unknown>[] } };
  const row = asMember.data.chats.find(chat => chat.id === chatId)!;
  assert.equal(row.ownerName, "Mia Member");
  assert.equal(row.mine, true);

  const asAdmin = (await (await assistantsRoute.loader(args(request("/api/admin/assistants", admin)))).json()) as { data: { chats: Record<string, unknown>[] } };
  const sameRow = asAdmin.data.chats.find(chat => chat.id === chatId)!;
  assert.equal(sameRow.ownerName, "Mia Member");
  assert.equal(sameRow.mine, false);
});
