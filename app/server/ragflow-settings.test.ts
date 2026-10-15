import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const dataDir = mkdtempSync(join(tmpdir(), "nexo-settings-"));
process.env.NEXO_DATA_DIR = dataDir;
process.env.NEXO_ENCRYPTION_KEY = "a".repeat(64);
process.env.NEXO_SESSION_SECRET = "s".repeat(32);
process.env.RAGFLOW_BASE_URL = "https://deployment.example";
process.env.RAGFLOW_API_KEY = "deployment-key";

const { clearRagflowSettings, effectiveRagflowSettings, saveRagflowSettings } = await import("./ragflow-settings.server");
const { withDatabase } = await import("./database.server");
const { validateMutationOrigin } = await import("./auth.server");
const { createSession, createUser, requireSiteAdmin, requireUser } = await import("./auth.server");
const { validateRagflowConnection } = await import("./ragflow-validation.server");

after(() => rmSync(dataDir, { recursive: true, force: true }));

test("saved RAGFlow settings override deployment values without storing plaintext", () => {
  clearRagflowSettings();
  assert.deepEqual(effectiveRagflowSettings(), { baseUrl: "https://deployment.example", apiKey: "deployment-key", source: "deployment-managed", apiKeyConfigured: true });
  const saved = saveRagflowSettings({ baseUrl: "https://site.example/", apiKey: "site-key" });
  assert.deepEqual(saved, { baseUrl: "https://site.example", source: "site-managed", apiKeyConfigured: true });
  assert.equal(effectiveRagflowSettings().apiKey, "site-key");
  const row = withDatabase(db => db.prepare("SELECT encrypted_ragflow_api_key,version FROM site_settings WHERE id=1").get() as { encrypted_ragflow_api_key: string; version: number });
  assert.notEqual(row.encrypted_ragflow_api_key, "site-key");
  assert.ok(row.encrypted_ragflow_api_key.includes("."));
  saveRagflowSettings({ baseUrl: "http://site.example" });
  assert.equal(effectiveRagflowSettings().apiKey, "site-key");
  assert.equal(withDatabase(db => (db.prepare("SELECT version FROM site_settings WHERE id=1").get() as { version: number }).version), 2);
  clearRagflowSettings();
  assert.equal(effectiveRagflowSettings().source, "deployment-managed");
});

test("mutation origin validation rejects cross-origin requests", () => {
  assert.equal(validateMutationOrigin(new Request("https://nexo.example/api", { headers: { origin: "https://nexo.example" } })), true);
  assert.equal(validateMutationOrigin(new Request("https://nexo.example/api", { headers: { origin: "https://attacker.example" } })), false);
});

test("normal users cannot reach site-admin settings and validation hides upstream failures", async () => {
  const user = createUser({ email: "member@example.test", displayName: "Member", password: "safe-password-123", role: "user" })!;
  const session = createSession({ id: user.id, email: user.email, displayName: user.displayName, role: "user", area: "", active: user.active }, new Request("https://nexo.example"));
  const request = new Request("https://nexo.example/api/admin/settings/ragflow", { headers: { cookie: session.cookie.split(";")[0] } });
  assert.equal(requireUser(request).user?.role, "user");
  assert.equal(requireSiteAdmin(request).response?.status, 403);
  saveRagflowSettings({ baseUrl: "https://site.example", apiKey: "site-key" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Bearer site-key should not leak"); };
  try {
    assert.deepEqual(await validateRagflowConnection(), { status: "unavailable", message: "No se pudo conectar con RAGFlow." });
  } finally { globalThis.fetch = originalFetch; }
});
