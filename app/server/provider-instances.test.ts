import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const dataDir = mkdtempSync(join(tmpdir(), "nexo-providers-"));
process.env.NEXO_DATA_DIR = dataDir;
process.env.NEXO_SESSION_SECRET = randomBytes(32).toString("hex");
process.env.RAGFLOW_BASE_URL = "https://ragflow.example.test";
process.env.RAGFLOW_API_KEY = randomBytes(32).toString("hex");
const providers = await import("./providers.server");
after(() => rmSync(dataDir, { recursive: true, force: true }));

test("an unlinked provider is reported as empty instead of asking RAGFlow for its instances", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async input => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/api/v1/providers")) {
      return Response.json({ code: 0, data: [{ name: "OpenAI", has_instance: true, model_types: ["chat"] }] });
    }
    if (url.endsWith("/api/v1/providers/OpenAI/instances")) {
      return Response.json({ code: 0, data: [{ id: "i1", instance_name: "prod", provider_id: "p1", region: "eu", status: "active" }] });
    }
    if (url.endsWith("/api/v1/providers/OpenAI/instances/prod/models")) {
      return Response.json({ code: 0, data: [{ name: "gpt-4o", model_type: "chat", max_tokens: 8192 }] });
    }
    return Response.json({ code: 0, data: [] });
  };
  try {
    // RAGFlow answers "no provider found for provider 'Moonshot'" for a
    // provider the tenant never linked, which surfaced as a 502 in the
    // provider panel and blocked configuring any new provider.
    assert.deepEqual(await providers.listProviderInstances("Moonshot"), []);
    assert.equal(calls.some(url => url.includes("/providers/Moonshot")), false);

    assert.deepEqual(await providers.listInstanceModels("Moonshot", "prod"), []);
    assert.equal(calls.some(url => url.includes("/providers/Moonshot")), false);

    assert.deepEqual(await providers.listProviderInstances("OpenAI"), [{ id: "i1", name: "prod", providerId: "p1", region: "eu", status: "active" }]);
    assert.equal((await providers.listInstanceModels("OpenAI", "prod"))[0].name, "gpt-4o");
  } finally { globalThis.fetch = originalFetch; }
});
