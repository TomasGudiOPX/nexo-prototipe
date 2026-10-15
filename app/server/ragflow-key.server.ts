import { asRecord, RagflowError, ragflow } from "./ragflow.server";
import { effectiveRagflowSettings, publicRagflowSettings, saveRagflowSettings } from "./ragflow-settings.server";

// RAGFlow's own web UI is not part of this deployment, so NEXO mints the
// replacement key through RAGFlow's tenant-scoped token endpoint. The current
// key belongs to the regular NEXO service account, which owns its tenant and can
// create another token for it. The new key replaces the stored one; RAGFlow keeps
// the previous key valid until it is deleted there.
export async function generateRagflowApiKey() {
  const current = effectiveRagflowSettings();
  if (!current.baseUrl || !current.apiKeyConfigured) throw new RagflowError("Configurá y validá la conexión RAGFlow antes de generar una clave.", 400);
  const payload = asRecord(await ragflow("/api/v1/system/tokens", { method: "POST", body: JSON.stringify({ name: "NEXO" }) }));
  const token = String(asRecord(payload.data).token ?? "").trim();
  if (!token.startsWith("ragflow-") || token.length > 4096) throw new RagflowError("RAGFlow no devolvió una clave válida para el tenant de servicio.", 502);
  return { ok: true, ...saveRagflowSettings({ baseUrl: current.baseUrl, apiKey: token }) };
}
