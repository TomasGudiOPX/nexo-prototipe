import { RagflowError, ragflow } from "../server/ragflow.server";
import { requireUser } from "../server/auth.server";
import { effectiveRagflowSettings } from "../server/ragflow-settings.server";
import type { Route } from "./+types/api.admin.ragflow";

async function probe(path: string) {
  try { await ragflow(path); return { supported: true, status: 200, reason: "Disponible en la instancia conectada." }; }
  catch (error) {
    const e = error instanceof RagflowError ? error : new RagflowError("No se pudo comprobar esta operación.");
    if (/api[\s_-]*key|unauthorized|authentication|credential/i.test(e.message)) return { supported: false, status: 401, reason: "La instancia rechazó la API key." };
    if (e.status === 404) return { supported: false, status: e.status, reason: "La instancia no expone este endpoint." };
    return { supported: false, status: e.status, reason: `No disponible (HTTP ${e.status}).` };
  }
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = requireUser(request);
  if (!auth.user) return auth.response;
  const configured = effectiveRagflowSettings().apiKeyConfigured && Boolean(effectiveRagflowSettings().baseUrl);
  if (!configured) return Response.json({ reachable: false, message: "Configurá RAGFLOW_BASE_URL y RAGFLOW_API_KEY en el servidor.", capabilities: {} }, { status: 503, headers: { "Cache-Control": "no-store" } });
  try {
    const [datasets, chats, connectors, tokens] = await Promise.all([
      probe("/api/v1/datasets?page=1&page_size=1"),
      probe("/api/v1/chats?page=1&page_size=1"),
      probe("/api/v1/connectors?page=1&page_size=1"),
      probe("/api/v1/system/tokens"),
    ]);
    const reachable = datasets.supported || datasets.status === 401 || datasets.status === 403 || datasets.status === 404;
    const capabilities = {
      datasets: { ...datasets, create: datasets.supported, edit: datasets.supported, remove: datasets.supported },
      documents: { supported: datasets.supported, upload: datasets.supported, process: datasets.supported, retry: datasets.supported, reason: "Documentos disponibles mediante los endpoints del dataset." },
      assistants: { ...chats, create: chats.supported, edit: chats.supported },
      dataSources: { ...connectors, create: connectors.supported, test: connectors.supported, sync: connectors.supported, logs: connectors.supported, associate: connectors.supported },
      apiKeys: {
        ...tokens,
        generate: tokens.supported,
        reason: tokens.supported
          ? "La instancia conectada permite generar una clave de API para el tenant de servicio."
          : tokens.reason,
      },
      mcp: {
        supported: true,
        register: true,
        discover: true,
        invoke: false,
        reason: "NEXO permite registrar y aprobar servidores MCP. La invocación desde asistentes sigue deshabilitada hasta confirmar un contrato compatible en RAGFlow.",
      },
    };
    const message = datasets.status === 401 || datasets.status === 403
      ? "RAGFlow responde, pero rechazó la API key configurada."
      : datasets.status === 404
      ? "RAGFlow responde, pero esta instancia no expone el endpoint de datasets esperado."
      : datasets.supported ? "RAGFlow responde con la API key configurada." : "No se pudo conectar con el endpoint de datasets de RAGFlow.";
    return Response.json({ reachable, message, capabilities }, { status: reachable ? 200 : 502, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const e = error instanceof RagflowError ? error : new RagflowError("No se pudo diagnosticar RAGFlow.");
    return Response.json({ reachable: false, message: `RAGFlow no está disponible: ${e.status === 401 || e.status === 403 ? "la API key no tiene acceso" : `HTTP ${e.status}`}.`, capabilities: {} }, { status: e.status, headers: { "Cache-Control": "no-store" } });
  }
}

