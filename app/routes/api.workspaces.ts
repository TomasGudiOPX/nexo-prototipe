import { canMutate, requireUser, validateMutationOrigin } from "../server/auth.server";
import { createWorkspace, listWorkspaces } from "../server/workspaces.server";

export async function loader({ request }: { request: Request }) {
  const auth = requireUser(request);
  if (!auth.user) return auth.response;
  return Response.json({ workspaces: listWorkspaces(auth.user) }, { headers: { "Cache-Control": "no-store" } });
}

export async function action({ request }: { request: Request }) {
  const auth = requireUser(request);
  if (!auth.user) return auth.response;
  if (!validateMutationOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  if (request.method !== "POST") return Response.json({ error: "Method not allowed." }, { status: 405 });
  if (!canMutate(auth.user)) return Response.json({ error: "Un auditor no puede crear espacios de trabajo." }, { status: 403 });
  try {
    const body = await request.json() as { name?: unknown; description?: unknown };
    if (typeof body.name !== "string" || (body.description !== undefined && typeof body.description !== "string")) return Response.json({ error: "Invalid workspace details." }, { status: 400 });
    return Response.json({ workspace: createWorkspace(auth.user, { name: body.name, description: body.description as string | undefined }) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not create workspace." }, { status: 400 });
  }
}
