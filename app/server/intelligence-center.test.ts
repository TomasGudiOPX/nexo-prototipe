import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import type { NexoUser } from "./auth.server";

const dataDir = mkdtempSync(join(tmpdir(), "nexo-center-"));
process.env.NEXO_DATA_DIR = dataDir;
process.env.NEXO_SESSION_SECRET = randomBytes(32).toString("hex");
process.env.RAGFLOW_BASE_URL = "https://ragflow.example.test";
process.env.RAGFLOW_API_KEY = randomBytes(32).toString("hex");
const auth = await import("./auth.server");
const workspaces = await import("./workspaces.server");
const { withDatabase } = await import("./database.server");
const sessionRoute = await import("../routes/api.auth.session");
const datasetsRoute = await import("../routes/api.datasets");
const graphRoute = await import("../routes/api.graph");
const chatRoute = await import("../routes/api.chat");
const mcpRoute = await import("../routes/api.mcp.tools");
const activityRoute = await import("../routes/api.activity");
const reportRoute = await import("../routes/api.reports");
const workspaceRoute = await import("../routes/api.workspaces");
after(() => rmSync(dataDir, { recursive: true, force: true }));

test("center contracts preserve membership, answer evidence, unavailable MCP, and truthful activity", async () => {
  const admin = auth.createUser({email:"admin@center.test",displayName:"Admin",password:randomBytes(24).toString("hex"),role:"site-admin"})! as NexoUser;
  const member = auth.createUser({email:"member@center.test",displayName:"Member",password:randomBytes(24).toString("hex"),role:"user"})! as NexoUser;
  const outsider = auth.createUser({email:"outsider@center.test",displayName:"Outsider",password:randomBytes(24).toString("hex"),role:"user"})! as NexoUser;
  const workspace = workspaces.createWorkspace(admin, {name:"Project knowledge"})!;
  workspaces.bindWorkspaceResource(admin, workspace.id, "datasets", "d", "Plans");
  workspaces.bindWorkspaceResource(admin, workspace.id, "assistants", "a", "Project assistant");
  withDatabase(db => db.prepare("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(?,?,'member')").run(workspace.id,member.id));
  function request(path: string, user: typeof admin | null = member, body?: unknown) {
    const cookie = user ? auth.createSession(user,new Request("https://nexo.test")).cookie.split(";")[0] : "";
    return new Request("https://nexo.test" + path, {method:body ? "POST" : "GET", headers:{cookie,origin:"https://nexo.test","Content-Type":"application/json"}, ...(body ? {body:JSON.stringify(body)} : {})});
  }
  const originalFetch = globalThis.fetch;
  let fail = false;
  let references: unknown = {chunks:[{document_name:"Plan.pdf",content:"Returned excerpt"}]};
  globalThis.fetch = async input => {
    if (fail) throw new Error("offline");
    const url = String(input);
    if (url.includes("chat/completions")) return Response.json({choices:[{message:{content:"Returned answer",reference:references}}]});
    if (url.includes("/graph")) return Response.json({data:{graph:{nodes:[{id:"n",name:"Plan"}],edges:[]}}});
    if (url.includes("/chats")) return Response.json({data:{chats:[{id:"a",dataset_ids:["d"]}]}});
    return Response.json({data:[{id:"d",name:"Plans"},{id:"secret",name:"Other workspace"}]});
  };
  const args = (req: Request) => ({request:req,params:{datasetId:"d"},context:{}} as any);
  try {
    assert.equal((await sessionRoute.loader({request:request("/api/auth/session")})).status,200);
    assert.equal((await datasetsRoute.loader({request:request("/api/datasets",null)})).status,401);
    assert.equal((await datasetsRoute.loader({request:request("/api/datasets")})).status,403);
    const list = await datasetsRoute.loader({request:request(`/api/datasets?workspaceId=${workspace.id}`)});
    assert.deepEqual(await list.json(),{datasets:[{id:"d",name:"Plans"}]});
    assert.equal((await graphRoute.loader(args(request(`/api/datasets/d/graph?workspaceId=${workspace.id}`,outsider)))).status,404);
    const graph = await (await graphRoute.loader(args(request(`/api/datasets/d/graph?workspaceId=${workspace.id}`)))).json();
    assert.equal(graph.graphType,"knowledge"); assert.equal(graph.graph.nodes[0].id,"n");
    assert.equal(graph.syncedAt,undefined);
    const body = {question:"Question",workspaceId:workspace.id,assistantId:"a"};
    assert.equal((await chatRoute.action(args(request("/api/datasets/d/chat",outsider,body)))).status,404);
    const answer = await (await chatRoute.action(args(request("/api/datasets/d/chat",member,body)))).json();
    assert.equal(answer.answer,"Returned answer"); assert.deepEqual(answer.references,[{document_name:"Plan.pdf",content:"Returned excerpt"}]);
    references = [];
    assert.deepEqual((await (await chatRoute.action(args(request("/api/datasets/d/chat",member,body)))).json()).references,[]);
    assert.equal((await mcpRoute.loader(args(request("/api/mcp/tools",null)))).status,401);
    const mcp = await (await mcpRoute.loader(args(request("/api/mcp/tools")))).json();
    assert.equal(mcp.invocationAvailable,false); assert.deepEqual(mcp.tools,[]);
    assert.equal((await chatRoute.action(args(request("/api/datasets/d/chat",member,{...body,toolInvocations:[{name:"tool"}]})))).status,501);
    assert.equal((await (await workspaceRoute.loader({request:request("/api/workspaces")})).json()).workspaces[0].id,workspace.id);
    const activity = await (await activityRoute.loader({request:request("/api/activity")})).json();
    assert.ok(activity.events.some((event: {type:string}) => event.type === "assistant.query.succeeded"));
    const report = await (await reportRoute.loader({request:request("/api/reports")})).json();
    assert.equal(report.period,"30d"); assert.equal(report.workspaceCount,1);
    // Usage analytics are an explicitly labelled demonstration, never presented
    // as measured results; the measured fields stay outside that block.
    assert.equal(report.isDemo,true); assert.ok(report.events >= 1);
    assert.equal(report.queries,undefined); assert.ok(report.demo.queries > 0); assert.ok(report.demo.trend.length === 7);
    assert.ok(report.unavailable.some((item: string) => /demostración/i.test(item)));
    fail = true;
    assert.equal((await graphRoute.loader(args(request(`/api/datasets/d/graph?workspaceId=${workspace.id}`)))).status,502);
    assert.equal((await chatRoute.action(args(request("/api/datasets/d/chat",member,body)))).status,502);
  } finally { globalThis.fetch = originalFetch; }
});

test("a single-document dataset renders its file and its own concepts instead of an empty graph", async () => {
  const admin = auth.createUser({email:"single@center.test",displayName:"Single",password:randomBytes(24).toString("hex"),role:"site-admin"})! as NexoUser;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.includes("/graph")) return Response.json({data:{graph:{},mind_map:{}}});
    if (url.includes("/documents")) return Response.json({data:{docs:[{id:"doc1",name:"Boleta-Pago (1).pdf",chunk_count:0}],total:1}});
    return Response.json({data:[{id:"d1",name:"Boleta"}]});
  };
  try {
    const cookie = auth.createSession(admin,new Request("https://nexo.test")).cookie.split(";")[0];
    const request = new Request("https://nexo.test/api/datasets/d1/graph", {headers:{cookie}});
    const payload = await (await graphRoute.loader({request,params:{datasetId:"d1"},context:{}} as any)).json();
    assert.equal(payload.graphType,"chunks");
    assert.deepEqual(payload.graph.nodes.filter((node: {kind:string}) => node.kind === "document").map((node: {id:string}) => node.id),["doc1"]);
    const concepts = payload.graph.nodes.filter((node: {kind:string}) => node.kind !== "document" && node.kind !== "dataset");
    assert.ok(concepts.length >= 1, "a single-file dataset must expose the file's own concepts");
    // Local concepts are not shared bridges, so the sharing threshold cannot hide them.
    assert.ok(concepts.every((node: {documentCount:number|null}) => node.documentCount === null));
    assert.ok(payload.graph.edges.some((edge: {source:string;target:string}) => edge.source === "doc1" && String(edge.target).startsWith("term:")));
  } finally { globalThis.fetch = originalFetch; }
});
