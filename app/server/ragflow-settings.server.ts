import { withDatabase } from "./database.server";
import { decryptSecret, encryptSecret } from "./secrets.server";
import { serverConfigValue } from "./config.server";

type SettingsRow = { ragflow_base_url: string | null; encrypted_ragflow_api_key: string | null };
export type EffectiveRagflowSettings = { baseUrl?: string; apiKey?: string; source: "site-managed" | "deployment-managed"; apiKeyConfigured: boolean };

function saved() {
  return withDatabase(db => db.prepare("SELECT ragflow_base_url,encrypted_ragflow_api_key FROM site_settings WHERE id=1").get() as SettingsRow | undefined);
}

export function effectiveRagflowSettings(): EffectiveRagflowSettings {
  const row = saved();
  const savedBase = row?.ragflow_base_url?.trim();
  const savedKey = row?.encrypted_ragflow_api_key ? decryptSecret(row.encrypted_ragflow_api_key) : "";
  const baseUrl = savedBase || serverConfigValue("RAGFLOW_BASE_URL")?.trim();
  const apiKey = savedKey || serverConfigValue("RAGFLOW_API_KEY")?.trim();
  return { baseUrl, apiKey, source: savedBase || savedKey ? "site-managed" : "deployment-managed", apiKeyConfigured: Boolean(apiKey) };
}

export function publicRagflowSettings() {
  const settings = effectiveRagflowSettings();
  return { baseUrl: settings.baseUrl ?? null, source: settings.source, apiKeyConfigured: settings.apiKeyConfigured };
}

export function saveRagflowSettings(input: { baseUrl: string; apiKey?: string }) {
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, "");
  let parsed: URL;
  try { parsed = new URL(baseUrl); } catch { throw new Error("Ingresá una URL base válida de RAGFlow."); }
  if (!/^https?:$/.test(parsed.protocol) || parsed.pathname !== "/" || parsed.search || parsed.hash || input.baseUrl.length > 2048) throw new Error("La URL debe ser HTTP(S), sin ruta, consulta ni fragmento.");
  if (input.apiKey !== undefined && input.apiKey.length > 4096) throw new Error("La API key es demasiado larga.");
  const current = saved();
  const replacement = input.apiKey?.trim();
  const encrypted = replacement ? encryptSecret(replacement) : current?.encrypted_ragflow_api_key ?? null;
  withDatabase(db => db.prepare("INSERT INTO site_settings(id,ragflow_base_url,encrypted_ragflow_api_key,version) VALUES(1,?,?,1) ON CONFLICT(id) DO UPDATE SET ragflow_base_url=excluded.ragflow_base_url,encrypted_ragflow_api_key=excluded.encrypted_ragflow_api_key,version=site_settings.version+1,updated_at=CURRENT_TIMESTAMP").run(baseUrl, encrypted));
  return publicRagflowSettings();
}

export function clearRagflowSettings() {
  withDatabase(db => db.prepare("DELETE FROM site_settings WHERE id=1").run());
  return publicRagflowSettings();
}
