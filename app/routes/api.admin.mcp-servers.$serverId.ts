import { withDatabase } from "../server/database.server";
import { requireSiteAdmin, validateMutationOrigin } from "../server/auth.server";
import { discoverMcpTools } from "../server/mcp.server";
import { decryptSecret } from "../server/secrets.server";
import type { Route } from "./+types/api.admin.mcp-servers.$serverId";

export async function action({ request, params }: Route.ActionArgs) {
  const auth = requireSiteAdmin(request); if (!auth.user) return auth.response;
  if (!validateMutationOrigin(request)) return Response.json({ error: "Origen de solicitud no válido." }, { status: 403 });
  const id = params.serverId;
  if (!id) return Response.json({ error: "Servidor MCP inválido." }, { status: 400 });
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "delete") {
      withDatabase(db => db.prepare("DELETE FROM mcp_servers WHERE id=?").run(id));
      return Response.json({ ok: true });
    }
    const connection = withDatabase(db => {
      const row = db.prepare("SELECT endpoint,encrypted_auth FROM mcp_servers WHERE id=?").get(id) as { endpoint: string; encrypted_auth: string | null } | undefined;
      if (!row) throw new Error("Servidor MCP no encontrado.");
      return { endpoint: row.endpoint, token: decryptSecret(row.encrypted_auth) };
    });
    if (body.action === "refresh") {
      let tools;
      try { tools = await discoverMcpTools(connection.endpoint, connection.token); }
      catch {
        withDatabase(db => {
          db.prepare("UPDATE mcp_servers SET status='unavailable',last_error='Connection check failed',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id);
          db.prepare("UPDATE mcp_tools SET approved=0 WHERE server_id=?").run(id);
        });
        throw new Error("No se pudo conectar o descubrir herramientas; el servidor quedó deshabilitado y sus aprobaciones fueron revocadas.");
      }
      withDatabase(db => {
        db.prepare("UPDATE mcp_servers SET status='connected',last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id);
        const existing = new Map((db.prepare("SELECT tool_name,approved FROM mcp_tools WHERE server_id=?").all(id) as { tool_name: string; approved: number }[]).map(row => [row.tool_name, row.approved]));
        db.prepare("DELETE FROM mcp_tools WHERE server_id=?").run(id);
        const add = db.prepare("INSERT INTO mcp_tools(server_id,tool_name,description,approved) VALUES(?,?,?,?)");
        for (const tool of tools) add.run(id, tool.name, tool.description, existing.get(tool.name) ?? 0);
      });
      return Response.json({ tools }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "approve" && Array.isArray(body.tools) && body.tools.length <= 500) {
      const toolInputs = body.tools as unknown[];
      withDatabase(db => {
        const save = db.prepare("UPDATE mcp_tools SET approved=? WHERE server_id=? AND tool_name=?");
        for (const item of toolInputs) {
          if (!item || typeof item !== "object") continue;
          const tool = item as Record<string, unknown>;
          if (typeof tool.name === "string" && typeof tool.approved === "boolean") save.run(tool.approved ? 1 : 0, id, tool.name);
        }
      });
      return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    }
    throw new Error("Operación MCP no válida.");
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "No se pudo completar la operación MCP." }, { status: 400, headers: { "Cache-Control": "no-store" } }); }
}
