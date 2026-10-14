import { serverConfigValue } from "../server/ragflow";

export async function loader() {
  const configured = serverConfigValue("RAGFLOW_ADMIN_URL")?.trim();
  if (!configured) return Response.json({ adminUrl: null }, { headers: { "Cache-Control": "no-store" } });

  try {
    const url = new URL(configured);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error();
    return Response.json({ adminUrl: url.toString() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ adminUrl: null }, { headers: { "Cache-Control": "no-store" } });
  }
}
