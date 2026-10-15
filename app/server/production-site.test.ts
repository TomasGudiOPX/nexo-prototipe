import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";

const dataDir = mkdtempSync(join(tmpdir(), "nexo-production-site-"));
process.env.NEXO_DATA_DIR = dataDir;
const [{ withDatabase }, workspaceApi, providerApi] = await Promise.all([
  import("./database.server"), import("./workspaces.server"), import("./providers.server"),
]);

const admin = { id: "admin-1", email: "admin@example.test", displayName: "Admin", role: "site-admin" as const, area: "" as const, active: true };
const member = { id: "member-1", email: "member@example.test", displayName: "Member", role: "user" as const, area: "" as const, active: true };
let workspaceId = "";

before(() => {
  withDatabase(db => {
    for (const user of [admin, member]) db.prepare("INSERT INTO users(id,email,display_name,password_hash,role) VALUES(?,?,?,?,?)").run(user.id, user.email, user.displayName, "test-hash", user.role);
  });
  workspaceId = workspaceApi.createWorkspace(admin, { name: "Field operations", description: "Project records" })!.id;
});
after(() => rmSync(dataDir, { recursive: true, force: true }));

test("workspace membership controls access and resource bindings retain RAGFlow names", () => {
  assert.equal(workspaceApi.requireWorkspaceAccess(member, workspaceId), false);
  assert.equal(workspaceApi.requireWorkspaceAccess(admin, workspaceId), true);
  withDatabase(db => db.prepare("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(?,?,'member')").run(workspaceId, member.id));
  assert.equal(workspaceApi.requireWorkspaceAccess(member, workspaceId), true);
  workspaceApi.bindWorkspaceResource(admin, workspaceId, "datasets", "dataset-1", "Safety library");
  workspaceApi.bindWorkspaceResource(admin, workspaceId, "assistants", "assistant-1", "Site assistant");
  assert.equal(workspaceApi.workspaceHasResource(member, workspaceId, "datasets", "dataset-1"), true);
  assert.equal(workspaceApi.workspaceHasResource(member, workspaceId, "datasets", "dataset-other"), false);
  const state = workspaceApi.listWorkspaces(member)[0];
  assert.equal(state.datasets[0].name, "Safety library");
  assert.equal(state.assistants[0].name, "Site assistant");
});

test("activity records are persisted for workspace operations", () => {
  workspaceApi.recordActivity({ workspaceId, actorId: admin.id, type: "test.event", summary: "Recorded event" });
  const event = withDatabase(db => db.prepare("SELECT event_type,summary FROM activity_events WHERE workspace_id=? AND event_type='test.event'").get(workspaceId) as { event_type: string; summary: string });
  assert.equal(event.event_type, "test.event");
  assert.equal(event.summary, "Recorded event");
});

test("provider model metadata is allowlisted and never exposes credentials", () => {
  const secret = "provider-secret-value";
  const models = providerApi.sanitizeProviderModels({ data: { OpenAI: [{ id: "1", llm_name: "gpt-example", model_type: "chat", available: true, api_key: secret, token: secret }] } });
  assert.deepEqual(models, [{ id: "1", name: "gpt-example", type: "chat", factory: "OpenAI", maxTokens: 0, configured: true }]);
  assert.equal(JSON.stringify(models).includes(secret), false);
});

test("provider catalog, instances, and models are allowlisted and rank-ordered", () => {
  const secret = "provider-secret-value";
  const catalog = providerApi.sanitizeProviderCatalog({ data: [
    { name: "OpenAI", rank: 100, url_hint: "https://api.openai.com/v1", model_types: ["chat", "embedding"], url: { default: secret }, tags: secret },
    { name: "Ollama", rank: 500, model_types: ["chat"], api_key: secret },
  ] });
  assert.deepEqual(catalog, [
    { name: "Ollama", rank: 500, urlHint: "", modelTypes: ["chat"] },
    { name: "OpenAI", rank: 100, urlHint: "https://api.openai.com/v1", modelTypes: ["chat", "embedding"] },
  ]);

  const instances = providerApi.sanitizeProviderInstances({ data: [
    { id: "i1", instance_name: "nexo-principal", provider_id: "p1", region: "default", status: "active", api_key: secret, extra: { base_url: secret } },
    { instance_name: "" },
  ] });
  assert.deepEqual(instances, [{ id: "i1", name: "nexo-principal", providerId: "p1", region: "default", status: "active" }]);

  const tenant = providerApi.sanitizeTenantProviders({ data: [
    { name: "OpenAI", has_instance: true, model_types: ["chat"], api_key: secret },
    { name: "Ollama", has_instance: false },
  ] });
  assert.deepEqual(tenant, [
    { name: "OpenAI", hasInstance: true, modelTypes: ["chat"] },
    { name: "Ollama", hasInstance: false, modelTypes: [] },
  ]);

  const models = providerApi.sanitizeInstanceModels({ data: [
    { name: "Qwen/Qwen2.5", model_type: "chat", max_tokens: 8192, status: "active", verify: "success", features: ["is_tools"], extra: { api_key: secret } },
  ] });
  assert.deepEqual(models, [{ name: "Qwen/Qwen2.5", type: "chat", maxTokens: 8192, status: "active", verify: "success", features: ["is_tools"] }]);

  const supported = providerApi.sanitizeCatalogModels({ data: [{ name: "bge-m3", model_types: ["embedding"], context_length: 8192, max_output: 1024, token: secret }] });
  assert.deepEqual(supported, [{ name: "bge-m3", types: ["embedding"], contextLength: 8192, maxOutput: 1024 }]);

  assert.equal(JSON.stringify([catalog, instances, tenant, models, supported]).includes(secret), false);
});

test("instance balance keeps scalar entries and drops nested payloads", () => {
  const balance = providerApi.sanitizeBalance({ data: { balance: 4.2, currency: "USD", is_available: true, credentials: { api_key: "secret" }, nested: [1, 2] } });
  assert.deepEqual(balance, [{ label: "balance", value: "4.2" }, { label: "currency", value: "USD" }, { label: "is_available", value: "true" }]);
});

test("site administrators grant and revoke workspace access from the user directory", () => {
  const second = workspaceApi.createWorkspace(admin, { name: "Safety review" })!;
  assert.deepEqual(workspaceApi.listUserWorkspaces(member.id).map(row => row.name), ["Field operations"]);

  const granted = workspaceApi.setUserWorkspaces(member.id, [workspaceId, second.id]);
  assert.deepEqual(granted.added, [second.id]);
  assert.deepEqual(granted.removed, []);
  assert.deepEqual(workspaceApi.listUserWorkspaces(member.id).map(row => row.name), ["Field operations", "Safety review"]);
  assert.equal(workspaceApi.requireWorkspaceAccess(member, second.id), true);

  // Ownership comes from creating the workspace and survives a revocation pass.
  const owned = workspaceApi.createWorkspace(member, { name: "Owned by member" })!;
  const revoked = workspaceApi.setUserWorkspaces(member.id, []);
  assert.deepEqual(revoked.added, []);
  assert.deepEqual([...revoked.removed].sort(), [second.id, workspaceId].sort());
  assert.deepEqual(workspaceApi.listUserWorkspaces(member.id).map(row => row.name), ["Owned by member"]);
  assert.equal(workspaceApi.requireWorkspaceAccess(member, workspaceId), false);
  assert.equal(workspaceApi.requireWorkspaceAccess(member, owned.id), true);

  // Unknown ids are ignored instead of being inserted.
  assert.deepEqual(workspaceApi.setUserWorkspaces(member.id, ["missing"]).added, []);
  assert.deepEqual(workspaceApi.listWorkspaceOptions().map(row => row.name), ["Field operations", "Owned by member", "Safety review"]);
});
