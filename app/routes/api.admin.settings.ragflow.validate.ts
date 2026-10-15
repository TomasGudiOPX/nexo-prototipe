import { requireSiteAdmin, validateMutationOrigin } from "../server/auth.server";
import { validateRagflowConnection } from "../server/ragflow-validation.server";
import type { Route } from "./+types/api.admin.settings.ragflow.validate";

export async function action({ request }: Route.ActionArgs) {
  const auth = requireSiteAdmin(request); if (!auth.user) return auth.response;
  if (!validateMutationOrigin(request)) return Response.json({ error: "Origen de solicitud no válido." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  return Response.json(await validateRagflowConnection(), { headers: { "Cache-Control": "no-store" } });
}
