import { destroySession, validateMutationOrigin } from "../server/auth.server";

export function action({ request }: { request: Request }) {
  if (request.method !== "POST" || !validateMutationOrigin(request)) return Response.json({ error: "Solicitud no válida." }, { status: 403 });
  return Response.json({ ok: true }, { headers: { "Set-Cookie": destroySession(request), "Cache-Control": "no-store" } });
}
