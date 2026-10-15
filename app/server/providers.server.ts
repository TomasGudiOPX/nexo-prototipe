import { asList, asRecord, ragflow } from "./ragflow.server";

export type ProviderModel = { id: string; name: string; type: string; factory: string; maxTokens: number; configured: boolean };
export type ProviderFactory = { name: string; rank: number; urlHint: string; modelTypes: string[] };
export type ProviderInstance = { id: string; name: string; providerId: string; region: string; status: string };
export type TenantProvider = { name: string; hasInstance: boolean; modelTypes: string[] };
export type InstanceModel = { name: string; type: string; maxTokens: number; status: string; verify: string; features: string[] };
export type CatalogModel = { name: string; types: string[]; contextLength: number; maxOutput: number };
export type ProviderBalanceEntry = { label: string; value: string };

export function sanitizeProviderModels(payload: unknown): ProviderModel[] {
  const root = asRecord(payload);
  const data = asRecord(root.data ?? payload);
  return Object.entries(data).flatMap(([factory, rows]) => Array.isArray(rows) ? rows.map(value => {
    const row = asRecord(value);
    return {
      id: String(row.id ?? ""), name: String(row.llm_name ?? row.name ?? ""), type: String(row.model_type ?? row.type ?? ""),
      factory, maxTokens: Number(row.max_tokens ?? 0), configured: Boolean(row.available ?? row.configured),
    };
  }).filter(model => model.id && model.name) : []);
}

const text = (value: unknown) => String(value ?? "").trim();
const num = (value: unknown) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; };
const strings = (value: unknown) => Array.isArray(value) ? value.map(text).filter(Boolean) : [];
const providerPath = (factory: string, instance?: string, suffix = "") =>
  `/api/v1/providers/${encodeURIComponent(factory)}${instance ? `/instances/${encodeURIComponent(instance)}` : ""}${suffix}`;
// Wildcard routes match slashes in model names (e.g. "Qwen/Qwen2.5"), so encode
// each segment instead of the whole name.
const modelPath = (factory: string, instance: string, modelName: string) =>
  `${providerPath(factory, instance, "/models")}/${modelName.split("/").map(encodeURIComponent).join("/")}`;

/** Factory catalog from the provider pool, ordered by rank (highest first). */
export function sanitizeProviderCatalog(payload: unknown): ProviderFactory[] {
  return asList(payload).map(asRecord).map(row => ({
    name: text(row.name), rank: num(row.rank), urlHint: text(row.url_hint), modelTypes: strings(row.model_types),
  })).filter(row => row.name).sort((a, b) => b.rank - a.rank);
}

export function sanitizeProviderInstances(payload: unknown): ProviderInstance[] {
  return asList(payload).map(asRecord).map(row => ({
    id: text(row.id), name: text(row.instance_name), providerId: text(row.provider_id), region: text(row.region), status: text(row.status),
  })).filter(row => row.name);
}

/** Providers already added to the tenant, with RAGFlow's `has_instance` flag. */
export function sanitizeTenantProviders(payload: unknown): TenantProvider[] {
  return asList(payload).map(asRecord).map(row => ({
    name: text(row.name), hasInstance: Boolean(row.has_instance), modelTypes: strings(row.model_types),
  })).filter(row => row.name);
}

export function sanitizeInstanceModels(payload: unknown): InstanceModel[] {
  return asList(payload).map(asRecord).map(row => ({
    name: text(row.name), type: text(row.model_type), maxTokens: num(row.max_tokens),
    status: text(row.status) || "unknown", verify: text(row.verify) || "unknown", features: strings(row.features),
  })).filter(row => row.name);
}

export function sanitizeCatalogModels(payload: unknown): CatalogModel[] {
  return asList(payload).map(asRecord).map(row => ({
    name: text(row.name), types: strings(row.model_types), contextLength: num(row.context_length), maxOutput: num(row.max_output),
  })).filter(row => row.name);
}

/** Balance payloads are driver-specific; keep only flat scalar entries so no nested or credential-shaped data leaks through. */
export function sanitizeBalance(payload: unknown): ProviderBalanceEntry[] {
  const data = asRecord(asRecord(payload).data ?? payload);
  return Object.entries(data)
    .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
    .slice(0, 6)
    .map(([label, value]) => ({ label, value: text(value) }));
}

export type DefaultModel = { provider: string; instance: string; name: string; type: string };

export function sanitizeDefaultModels(payload: unknown): DefaultModel[] {
  const data = asRecord(asRecord(payload).data ?? payload);
  const rows = Array.isArray(data.models) ? data.models : [];
  return rows.map(asRecord).map(row => ({
    provider: text(row.model_provider), instance: text(row.model_instance), name: text(row.model_name), type: text(row.model_type),
  })).filter(row => row.name && row.type);
}

export async function listTenantDefaultModels() {
  return sanitizeDefaultModels(await ragflow("/api/v1/models/default"));
}

/**
 * The tenant default is what RAGFlow actually uses: datasets inherit it when they
 * are created, and ingestion resolves the embedding model from the dataset's
 * embd_id. Adding a model to a provider instance does not select it.
 */
export async function setTenantDefaultModel(factory: string, instance: string, modelName: string, modelType: string) {
  await ragflow("/api/v1/models/default", {
    method: "PATCH",
    body: JSON.stringify({ model_type: modelType, model_provider: factory, model_instance: instance, model_name: modelName }),
  });
  return { success: true, message: "" };
}

export async function listProviderModels() {
  const payload = await ragflow("/api/v1/models");
  return asList(payload).map(asRecord).map(row => ({
    id: String(row.model_id || `${row.provider_name}/${row.instance_name}/${row.name}`),
    name: String(row.name || ""),
    type: Array.isArray(row.model_type) ? row.model_type.join(", ") : String(row.model_type || ""),
    factory: String(row.provider_name || ""), instance: String(row.instance_name || ""),
    maxTokens: Number(row.max_tokens || 0), configured: true,
  })).filter(row => row.name);
}

export async function listProviderCatalog() {
  return sanitizeProviderCatalog(await ragflow("/api/v1/providers?available=true"));
}

export async function listTenantProviders() {
  return sanitizeTenantProviders(await ragflow("/api/v1/providers"));
}

export async function listProviderInstances(factory: string) {
  return sanitizeProviderInstances(await ragflow(providerPath(factory, undefined, "/instances")));
}

export async function listInstanceModels(factory: string, instance: string) {
  return sanitizeInstanceModels(await ragflow(providerPath(factory, instance, "/models")));
}

export async function listSupportedModels(factory: string, instance: string) {
  return sanitizeCatalogModels(await ragflow(`${providerPath(factory, instance, "/models")}?supported=true`));
}

export async function showInstanceBalance(factory: string, instance: string) {
  return sanitizeBalance(await ragflow(providerPath(factory, instance, "/balance")));
}

export async function checkInstanceConnection(factory: string, instance: string) {
  await ragflow(providerPath(factory, instance, "/connection"));
  return { success: true };
}

export async function configureProvider(input: { factory: string; instanceName: string; apiKey: string; baseUrl: string; modelName?: string; modelType?: string; maxTokens?: number; verify: boolean }) {
  const body = {
    instance_name: input.instanceName,
    api_key: input.apiKey,
    base_url: input.baseUrl,
    model_info: input.modelName ? [{ model_name: input.modelName, model_type: [input.modelType || "chat"], max_tokens: input.maxTokens || 8192 }] : [],
  };
  const path = providerPath(input.factory);
  if (input.verify) {
    await ragflow(`${path}/connection`, { method: "POST", body: JSON.stringify(body) });
  } else {
    const existing = asList(await ragflow("/api/v1/providers")).map(asRecord);
    if (!existing.some(row => (row.name || row.provider_name) === input.factory)) {
      await ragflow("/api/v1/providers", { method: "PUT", body: JSON.stringify({ provider_name: input.factory }) });
    }
    await ragflow(`${path}/instances`, { method: "POST", body: JSON.stringify(body) });
  }
  return { success: true, message: "" };
}

export async function deleteProviderInstance(factory: string, instanceName: string) {
  await ragflow(providerPath(factory, undefined, "/instances"), { method: "DELETE", body: JSON.stringify({ instances: [instanceName] }) });
  return { success: true, message: "" };
}

export async function deleteProvider(factory: string) {
  await ragflow(providerPath(factory), { method: "DELETE" });
  return { success: true, message: "" };
}

export async function addInstanceModel(factory: string, instance: string, input: { modelName: string; modelType: string; maxTokens: number }) {
  await ragflow(providerPath(factory, instance, "/models"), {
    method: "POST",
    body: JSON.stringify({ model_name: input.modelName, model_type: [input.modelType || "chat"], max_tokens: input.maxTokens || 8192 }),
  });
  return { success: true, message: "" };
}

export async function setInstanceModelStatus(factory: string, instance: string, modelName: string, status: "active" | "inactive") {
  await ragflow(modelPath(factory, instance, modelName), { method: "PATCH", body: JSON.stringify({ model_name: modelName, status }) });
  return { success: true, message: "" };
}

export async function deleteInstanceModels(factory: string, instance: string, modelNames: string[]) {
  await ragflow(providerPath(factory, instance, "/models"), { method: "DELETE", body: JSON.stringify({ model_name: modelNames }) });
  return { success: true, message: "" };
}
