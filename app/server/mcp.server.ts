import { randomInt } from "node:crypto";
import { asRecord } from "./ragflow.server";

export type McpTool = { name: string; description: string; inputSchema?: unknown };

function endpoint(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) throw new Error("Usá una URL HTTP(S) válida sin usuario, contraseña ni fragmento.");
  if ([...url.searchParams.keys()].some(key => /token|secret|password|credential|auth|api[_-]?key/i.test(key))) throw new Error("Guardá la credencial en el campo Token y no en la URL.");
  return url;
}

async function request(url: URL, token: string, method: string, params: Record<string, unknown>, sessionId?: string) {
  const headers = new Headers({ "Content-Type": "application/json", Accept: "application/json, text/event-stream" });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (sessionId) { headers.set("MCP-Session-Id", sessionId); headers.set("MCP-Protocol-Version", "2024-11-05"); }
  const response = await fetch(url, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(15000), headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: randomInt(1, 2 ** 30), method, params }),
  });
  if (!response.ok) throw new Error(`El servidor MCP respondió HTTP ${response.status}.`);
  const session = response.headers.get("mcp-session-id") ?? sessionId;
  const text = await response.text();
  let result: Record<string, unknown>;
  try {
    if (text.includes("data:")) {
      const payload = text.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n");
      result = asRecord(JSON.parse(payload));
    } else result = asRecord(JSON.parse(text));
  } catch { throw new Error("El servidor MCP devolvió una respuesta no válida."); }
  if (result.error) throw new Error("El servidor MCP rechazó la solicitud.");
  return { result: asRecord(result.result), session };
}

async function initialized(url: URL, token: string) {
  const init = await request(url, token, "initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "nexo", version: "1.0.0" } });
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.session) { headers.set("MCP-Session-Id", init.session); headers.set("MCP-Protocol-Version", "2024-11-05"); }
  const notification = await fetch(url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15000), headers, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
  if (!notification.ok) throw new Error(`El servidor MCP respondió HTTP ${notification.status}.`);
  return init.session;
}

export async function discoverMcpTools(address: string, token: string): Promise<McpTool[]> {
  const url = endpoint(address); const session = await initialized(url, token);
  const listed = await request(url, token, "tools/list", {}, session ?? undefined);
  return Array.isArray(listed.result.tools) ? listed.result.tools.map(asRecord).filter(row => typeof row.name === "string" && /^[\w.-]{1,128}$/.test(row.name)).map(row => ({ name: String(row.name), description: typeof row.description === "string" ? row.description.slice(0, 2000) : "", inputSchema: row.inputSchema })) : [];
}

