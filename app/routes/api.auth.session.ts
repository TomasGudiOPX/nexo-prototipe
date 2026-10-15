import { currentUser } from "../server/auth.server";

export function loader({ request }: { request: Request }) {
  try { return Response.json({ user: currentUser(request) }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ user: null }, { headers: { "Cache-Control": "no-store" } }); }
}
