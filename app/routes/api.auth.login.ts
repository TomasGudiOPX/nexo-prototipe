import { authenticate, createSession, ensureBootstrapAdmin, validateMutationOrigin } from "../server/auth.server";

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST" || !validateMutationOrigin(request)) return Response.json({ error: "Solicitud no válida." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  try {
    ensureBootstrapAdmin();
    const body = await request.json() as Record<string, unknown>;
    const email = typeof body.email === "string" ? body.email : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password || email.length > 254 || password.length > 256) return invalid();
    const user = authenticate(email, password);
    if (!user) return invalid();
    const session = createSession(user, request);
    return Response.json({ user }, { headers: { "Set-Cookie": session.cookie, "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("NEXO sign-in failed:", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "El inicio de sesión no está disponible. Revisá la configuración del servidor." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

function invalid() { return Response.json({ error: "Email o contraseña incorrectos." }, { status: 401, headers: { "Cache-Control": "no-store" } }); }
