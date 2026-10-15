import { withDatabase } from "../server/database.server";
import { currentUser } from "../server/auth.server";
import type { Route } from "./+types/api.mcp.tools";

export function loader({ request }: Route.LoaderArgs) {
  if (!currentUser(request)) return Response.json({ error: "Iniciá sesión para consultar herramientas aprobadas." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const count = Number((withDatabase(db => db.prepare("SELECT COUNT(*) AS count FROM mcp_tools WHERE approved=1").get()) as { count: number }).count);
  return Response.json({ tools: [], configuredToolCount: count, invocationAvailable: false, reason: "RAGFlow no confirmó una API compatible para ejecutar estas herramientas desde el asistente seleccionado." }, { headers: { "Cache-Control": "no-store" } });
}
