import { randomBytes } from "node:crypto";
import { withDatabase } from "../server/database.server";
import { requireSiteAdmin, requireUser, validateMutationOrigin } from "../server/auth.server";
import { encryptSecret } from "../server/secrets.server";
import { discoverMcpTools } from "../server/mcp.server";
import type { Route } from "./+types/api.admin.mcp-servers";

export function loader({ request }: Route.LoaderArgs) {
  const auth = requireUser(request); if (!auth.user) return auth.response;
  try {
    const servers = withDatabase(db => db.prepare("SELECT s.id,s.name,s.endpoint,s.transport,s.status,s.last_error,s.updated_at,COUNT(t.tool_name) AS tool_count,COALESCE(SUM(t.approved),0) AS approved_tool_count FROM mcp_servers s LEFT JOIN mcp_tools t ON t.server_id=s.id GROUP BY s.id ORDER BY s.name").all());
    const tools = withDatabase(db => db.prepare("SELECT server_id AS serverId,tool_name AS name,description,approved FROM mcp_tools ORDER BY tool_name").all());
    return Response.json({ servers, tools, capabilities: { register: true, discover: true, approve: true, invoke: false, invocationReason: "La API RAGFlow conectada no confirmó un contrato compatible para invocar herramientas desde asistentes." } }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "No se pudo cargar la configuración MCP." }, { status: 503 }); }
}

export async function action({ request }: Route.ActionArgs) {
  const auth = requireSiteAdmin(request); if (!auth.user) return auth.response;
  if (!validateMutationOrigin(request)) return Response.json({ error: "Origen de solicitud no válido." }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
    const token = typeof body.token === "string" ? body.token : "";
    if (!name || name.length > 64 || !/^[\w -]+$/.test(name) || !endpoint || endpoint.length > 2048) throw new Error("Ingresá un nombre y una URL de servidor válidos.");
    if (body.transport !== "streamable-http") throw new Error("NEXO admite Streamable HTTP; los servidores stdio/SSE necesitan un gateway compatible.");
    const tools = await discoverMcpTools(endpoint, token);
    const id = randomBytes(16).toString("hex"); const encrypted = encryptSecret(token);
    withDatabase(db => {
      db.prepare("INSERT INTO mcp_servers(id,name,endpoint,transport,encrypted_auth,status) VALUES(?,?,?,?,?,'connected')").run(id, name, endpoint, "streamable-http", encrypted);
      const add = db.prepare("INSERT INTO mcp_tools(server_id,tool_name,description,approved) VALUES(?,?,?,0)");
      for (const tool of tools) add.run(id, tool.name, tool.description);
    });
    return Response.json({ server: { id, name, endpoint, transport: "streamable-http", status: "connected" }, tools }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "No se pudo registrar el servidor MCP." }, { status: 400, headers: { "Cache-Control": "no-store" } }); }
}

