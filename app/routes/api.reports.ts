import { requireUser } from "../server/auth.server";
import { withDatabase } from "../server/database.server";
import { requireWorkspaceAccess } from "../server/workspaces.server";

// RAGFlow exposes no usage analytics yet, so the per-assistant figures live under
// `demo` and are labelled as a demonstration everywhere they surface. Everything
// outside `demo` is measured from recorded activity.
const DEMO_ACCOUNT = {
  queries: 1284, resolvedRate: 92.6, documentsProcessed: 86, averageResponseSeconds: 2.2,
  trend: [{ day: "Lun", value: 142 }, { day: "Mar", value: 176 }, { day: "Mié", value: 158 }, { day: "Jue", value: 209 }, { day: "Vie", value: 193 }, { day: "Sáb", value: 87 }, { day: "Dom", value: 74 }],
  assistants: [{ name: "Asistente de Obra", queries: 512, resolvedRate: 94.2 }, { name: "Consultor de Licitaciones", queries: 418, resolvedRate: 91.4 }, { name: "Mesa Técnica", queries: 354, resolvedRate: 89.1 }],
  insights: ["Las consultas sobre cómputos aumentaron frente a la semana anterior.", "La calidad de respuesta se mantiene por encima del objetivo del 90%.", "La mayoría de las consultas usa documentación actualizada en los últimos 30 días."],
};

const DEMO_SCOPE = {
  queries: 486, resolvedRate: 91.8, documentsProcessed: 34, averageResponseSeconds: 2.4,
  trend: [{ day: "Lun", value: 48 }, { day: "Mar", value: 61 }, { day: "Mié", value: 55 }, { day: "Jue", value: 72 }, { day: "Vie", value: 68 }, { day: "Sáb", value: 34 }, { day: "Dom", value: 29 }],
  assistants: [{ name: "Asistente de Obra", queries: 214, resolvedRate: 94.2 }, { name: "Consultor de Licitaciones", queries: 161, resolvedRate: 90.1 }, { name: "Mesa Técnica", queries: 111, resolvedRate: 87.3 }],
  insights: ["Las consultas sobre cómputos aumentaron frente a la semana anterior.", "La mayoría de las consultas se resolvió con fuentes del espacio actual.", "La mayor actividad ocurre entre las 09:00 y las 12:00."],
};

export async function loader({ request }: { request: Request }) {
  const auth = requireUser(request);
  if (!auth.user) return auth.response;
  const user = auth.user;
  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (workspaceId && !requireWorkspaceAccess(user, workspaceId)) return Response.json({ error: "Workspace not found." }, { status: 404 });
  const measured = withDatabase(db => {
    const eventRow = workspaceId
      ? db.prepare("SELECT COUNT(*) AS count FROM activity_events WHERE created_at >= datetime('now','-30 days') AND workspace_id=?").get(workspaceId)
      : user.role === "site-admin"
        ? db.prepare("SELECT COUNT(*) AS count FROM activity_events WHERE created_at >= datetime('now','-30 days')").get()
        : db.prepare(`SELECT COUNT(DISTINCT e.id) AS count FROM activity_events e WHERE e.created_at >= datetime('now','-30 days') AND (e.actor_id=? OR EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id=e.workspace_id AND m.user_id=?))`).get(user.id, user.id);
    const workspaceRow = user.role === "site-admin"
      ? db.prepare("SELECT COUNT(*) AS count FROM workspaces").get()
      : db.prepare("SELECT COUNT(*) AS count FROM workspace_members WHERE user_id=?").get(user.id);
    return { events: Number((eventRow as { count: number }).count), workspaceCount: workspaceId ? 1 : Number((workspaceRow as { count: number }).count) };
  });
  return Response.json({
    period: "30d",
    ...measured,
    isDemo: true,
    demo: workspaceId ? DEMO_SCOPE : DEMO_ACCOUNT,
    unavailable: ["Los indicadores de uso (consultas, respuestas útiles, documentos procesados y tiempo de respuesta) todavía no provienen de una fuente medida: se muestran como demostración hasta integrar la analítica de RAGFlow. Los eventos y los espacios de trabajo sí son medidos."],
  }, { headers: { "Cache-Control": "no-store" } });
}
