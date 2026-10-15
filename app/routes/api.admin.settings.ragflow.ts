import { RagflowError } from "../server/ragflow.server";
import { generateRagflowApiKey } from "../server/ragflow-key.server";
import { requireSiteAdmin, validateMutationOrigin } from "../server/auth.server";
import { clearRagflowSettings, publicRagflowSettings, saveRagflowSettings } from "../server/ragflow-settings.server";
import type { Route } from "./+types/api.admin.settings.ragflow";

const headers = { "Cache-Control": "no-store" };
export function loader({ request }: Route.LoaderArgs) {
  const auth = requireSiteAdmin(request); if (!auth.user) return auth.response;
  return Response.json(publicRagflowSettings(), { headers });
}

export async function action({ request }: Route.ActionArgs) {
  const auth = requireSiteAdmin(request); if (!auth.user) return auth.response;
  if (!validateMutationOrigin(request)) return Response.json({ error: "Origen de solicitud no válido." }, { status: 403, headers });
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "clear") return Response.json(clearRagflowSettings(), { headers });
    if (body.action === "generate-key") return Response.json(await generateRagflowApiKey(), { headers });
    const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl : "";
    const apiKey = typeof body.apiKey === "string" ? body.apiKey : undefined;
    return Response.json(saveRagflowSettings({ baseUrl, apiKey }), { headers });
  } catch (error) {
    const status = error instanceof RagflowError ? error.status : 400;
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar la configuración." }, { status, headers });
  }
}

