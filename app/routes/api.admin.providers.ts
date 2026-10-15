import { requireSiteAdmin, validateMutationOrigin } from "../server/auth.server";
import {
  addInstanceModel, checkInstanceConnection, configureProvider, deleteInstanceModels, deleteProvider,
  deleteProviderInstance, listInstanceModels, listProviderCatalog, listProviderInstances, listProviderModels,
  listSupportedModels, listTenantDefaultModels, listTenantProviders, setInstanceModelStatus, setTenantDefaultModel, showInstanceBalance,
} from "../server/providers.server";
import type { Route } from "./+types/api.admin.providers";

const headers = { "Cache-Control": "no-store" };
const instanceNamePattern = /^[A-Za-z0-9_-]+$/;
const required = (value: unknown) => typeof value === "string" ? value.trim() : "";

/** Input the caller can fix; reported as 400 instead of an upstream 502. */
class InputError extends Error {}

const fail = (error: unknown, fallback: string) => Response.json(
  { error: error instanceof Error ? error.message : fallback },
  { status: error instanceof InputError ? 400 : 502, headers },
);

export async function loader({ request }: Route.LoaderArgs) {
  const auth = requireSiteAdmin(request);
  if (!auth.user) return auth.response;
  const url = new URL(request.url);
  const factory = required(url.searchParams.get("factory"));
  const instance = required(url.searchParams.get("instance"));
  try {
    if (factory && instance) {
      const [models, balance, supported, defaults] = await Promise.all([
        listInstanceModels(factory, instance),
        showInstanceBalance(factory, instance).catch(() => []),
        url.searchParams.get("supported") === "1" ? listSupportedModels(factory, instance).catch(() => []) : Promise.resolve([]),
        listTenantDefaultModels().catch(() => []),
      ]);
      return Response.json({ factory, instance, models, balance, supported, defaults, validationSupported: true }, { headers });
    }
    if (factory) {
      const instances = await listProviderInstances(factory);
      return Response.json({ factory, instances, validationSupported: true }, { headers });
    }
    const [models, factories, configured] = await Promise.all([
      listProviderModels(), listProviderCatalog(), listTenantProviders().catch(() => []),
    ]);
    return Response.json({ models, factories, configured, validationSupported: true }, { headers });
  } catch (error) { return fail(error, "No se pudo consultar los modelos."); }
}

export async function action({ request }: Route.ActionArgs) {
  const auth = requireSiteAdmin(request);
  if (!auth.user) return auth.response;
  if (!validateMutationOrigin(request)) return Response.json({ error: "Origen de solicitud no válido." }, { status: 403, headers });
  try {
    const body = await request.json() as Record<string, unknown>;
    const factory = required(body.factory);
    const instance = required(body.instance);
    const action = required(body.action) || "create-instance";
    if (!factory) throw new InputError("Seleccioná un proveedor.");
    if (action !== "delete-provider" && !instance) throw new InputError("Seleccioná una conexión del proveedor.");

    const result = await (async () => {
      switch (action) {
        case "verify":
          return configureProvider({ factory, instanceName: instance, apiKey: required(body.apiKey), baseUrl: required(body.baseUrl), verify: true });
        case "check-instance":
          return checkInstanceConnection(factory, instance);
        case "delete-instance":
          return deleteProviderInstance(factory, instance);
        case "delete-provider":
          return deleteProvider(factory);
        case "add-model": {
          const modelName = required(body.modelName);
          if (!modelName) throw new InputError("Ingresá el nombre del modelo.");
          return addInstanceModel(factory, instance, { modelName, modelType: required(body.modelType) || "chat", maxTokens: Number(body.maxTokens) || 8192 });
        }
        case "set-model-status": {
          const modelName = required(body.modelName);
          const status = required(body.status);
          if (!modelName) throw new InputError("Seleccioná un modelo.");
          if (status !== "active" && status !== "inactive") throw new InputError("Estado de modelo no válido.");
          return setInstanceModelStatus(factory, instance, modelName, status);
        }
        case "set-default-model": {
          const modelName = required(body.modelName);
          const modelType = required(body.modelType);
          if (!modelName || !modelType) throw new InputError("Seleccioná un modelo y su tipo.");
          return setTenantDefaultModel(factory, instance, modelName, modelType);
        }
        case "delete-models": {
          const names = Array.isArray(body.modelNames) ? body.modelNames.map(required).filter(Boolean) : [];
          if (!names.length) throw new InputError("Seleccioná al menos un modelo.");
          return deleteInstanceModels(factory, instance, names);
        }
        default: {
          const apiKey = required(body.apiKey);
          if (!apiKey) throw new InputError("Proveedor y API key son obligatorios.");
          if (!instanceNamePattern.test(instance)) throw new InputError("Ingresá un nombre de conexión con letras, números, guiones o guiones bajos.");
          return configureProvider({ factory, instanceName: instance, apiKey, baseUrl: required(body.baseUrl), modelName: required(body.modelName), modelType: required(body.modelType), maxTokens: Number(body.maxTokens) || 0, verify: false });
        }
      }
    })();
    return Response.json(result, { status: result.success ? 200 : 422, headers });
  } catch (error) { return fail(error, "No se pudo completar la operación de proveedores."); }
}
