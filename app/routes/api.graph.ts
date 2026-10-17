import { asList, asRecord, RagflowError, ragflow, validateDataset } from "../server/ragflow.server";
import { requireUser } from "../server/auth.server";
import { workspaceHasResource } from "../server/workspaces.server";
import type { Route } from "./+types/api.graph";

type GraphDoc = Record<string, unknown>;
type TermKind = "keyword" | "metadata" | "chunk";

const STOP_WORDS = new Set(("para como desde hasta sobre entre donde cuando quien cual cuales este esta estos estas ese esa esos esas aquel aquella aqui alli todo todos toda todas cada otros otras mismo misma puede pueden debe deben sido ser estar hacer hace hizo tiene tienen tener por con sin del las los una uno unos unas de la el en y o u a al que se su sus es son fue han hay mas muy ya pero porque también tambien solo según segun documento documentos archivo archivos informacion información datos dato proceso procesos sistema sistemas parte partes caso casos ejemplo ejemplos nivel forma formas permite permite mediante dentro fuera antes despues después durante cada siendo cual cuales este esta hacia contra bajo tras ante sobre manera siguiente siguientes contenido contenidos texto textos incluye incluyen contiene contienen generado generada generado generados puede pueden fueron era eran" ).split(/\s+/));

function normalizedTerm(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function termsFrom(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,;|]+/) : [];
  return values.flatMap(item => {
    if (typeof item !== "string") return [];
    const term = item.trim();
    return term ? [term] : [];
  });
}

function wordsFrom(value: string) {
  return (value.match(/[\p{L}][\p{L}\p{N}_-]{3,}/gu) ?? []).filter(word => !STOP_WORDS.has(normalizedTerm(word)));
}

async function mapWithLimit<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      output[index] = await mapper(items[index]);
    }
  }));
  return output;
}

async function listChunks(datasetId: string, doc: GraphDoc) {
  const documentId = String(doc.id ?? doc.document_id ?? "");
  if (!documentId || Number(doc.chunk_count ?? 0) <= 0) return [] as GraphDoc[];
  const chunks: GraphDoc[] = [];
  const pageSize = 100;
  for (let page = 1; chunks.length < 500; page += 1) {
    const raw = asRecord(await ragflow(`/api/v1/datasets/${encodeURIComponent(datasetId)}/documents/${encodeURIComponent(documentId)}/chunks?page=${page}&page_size=${pageSize}`));
    const data = asRecord(raw.data);
    const rows = Array.isArray(data.chunks) ? data.chunks.map(asRecord) : [];
    chunks.push(...rows);
    if (!rows.length || rows.length < pageSize || (Number(data.total) > 0 && chunks.length >= Number(data.total))) break;
  }
  return chunks;
}

async function buildDocumentConnections(datasetId: string, datasetName: string, documents: GraphDoc[]) {
  const sourceDocs = documents.slice(0, 1000);
  const chunkLists = await mapWithLimit(sourceDocs, 8, async doc => {
    try { return await listChunks(datasetId, doc); } catch { return [] as GraphDoc[]; }
  });
  const termByKey = new Map<string, { label: string; kind: TermKind; documentIds: Set<string> }>();
  const addTerm = (docId: string, rawTerm: string, kind: TermKind) => {
    const normalized = normalizedTerm(rawTerm);
    if (!normalized || normalized.length < 4 || normalized.length > 90) return;
    const words = normalized.split(" ");
    if (words.every(word => STOP_WORDS.has(word))) return;
    const key = `${kind}:${normalized}`;
    let term = termByKey.get(key);
    if (!term) { term = { label: rawTerm.trim().slice(0, 90), kind, documentIds: new Set() }; termByKey.set(key, term); }
    term.documentIds.add(docId);
  };

  sourceDocs.forEach((doc, index) => {
    const docId = String(doc.id ?? doc.document_id ?? doc.name ?? index);
    const fileName = String(doc.name ?? doc.location ?? "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
    wordsFrom(fileName).slice(0, 8).forEach(word => addTerm(docId, word, "chunk"));

    for (const field of ["meta_fields", "metadata"]) {
      const metadata = asRecord(doc[field]);
      for (const [name, value] of Object.entries(metadata)) {
        const values = Array.isArray(value) ? value : [value];
        for (const item of values) if (typeof item === "string" || typeof item === "number") addTerm(docId, `${name}: ${String(item)}`, "metadata");
      }
    }

    const chunks = chunkLists[index] ?? [];
    const hasExplicitTerms = chunks.some(chunk => [chunk.important_keywords, chunk.important_kwd, chunk.tag_kwd].some(value => termsFrom(value).length > 0));
    const wordCounts = new Map<string, number>();
    for (const chunk of chunks) {
      for (const value of [chunk.important_keywords, chunk.important_kwd, chunk.tag_kwd]) {
        for (const term of termsFrom(value)) addTerm(docId, term, "keyword");
      }
      if (!hasExplicitTerms) {
        const content = String(chunk.content_with_weight ?? chunk.content ?? "").replace(/<[^>]*>/g, " ");
        for (const word of wordsFrom(content)) wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
      }
    }
    [...wordCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8)
      .forEach(([word]) => addTerm(docId, word, "chunk"));
  });

  const allTerms = [...termByKey.entries()];
  const sharedTerms = allTerms
    .filter(([, term]) => term.documentIds.size >= 2 && term.documentIds.size <= 30)
    .sort((a, b) => b[1].documentIds.size - a[1].documentIds.size || a[1].label.localeCompare(b[1].label))
    .slice(0, 300);
  // Shared terms are the inter-document bridges. A dataset with a single
  // document (or documents with nothing in common) has none, so fall back to
  // each file's own terms instead of rendering a graph with no concepts.
  const localOnly = sharedTerms.length === 0;
  const terms = localOnly ? allTerms.slice(0, 300) : sharedTerms;
  const docNodes = sourceDocs.map((doc, index) => ({
    id: String(doc.id ?? doc.document_id ?? doc.name ?? index),
    name: String(doc.name ?? doc.location ?? "Documento"),
    description: `${String(doc.ingestion_status ?? "Estado desconocido")}${doc.chunk_count !== undefined ? ` · ${String(doc.chunk_count)} fragmentos` : ""}`,
    kind: "document",
  }));
  const termNodes = terms.map(([key, term]) => {
    const shared = term.documentIds.size > 1;
    const base = term.kind === "metadata" ? "Metadato" : term.kind === "keyword" ? "Palabra clave de RAGFlow" : shared ? "Término compartido en fragmentos o nombres" : "Término del archivo (fragmentos o nombre)";
    return {
      id: `term:${encodeURIComponent(key)}`,
      name: term.label,
      description: `${base} · ${shared ? `presente en ${term.documentIds.size} documentos` : "presente en este archivo"}`,
      kind: term.kind,
      // Single-file terms are not shared bridges, so the sharing threshold
      // must not hide them and leave the graph empty.
      documentCount: shared ? term.documentIds.size : null,
    };
  });
  const hubId = `dataset:${datasetId}`;
  const hub = { id: hubId, name: datasetName || "Dataset", description: `Dataset con ${sourceDocs.length} documentos.`, kind: "dataset", x: 0, y: 0, z: 0 };
  const edges: { source: string; target: string; kind: TermKind | "membership" | "shared-document"; label: string }[] = terms.flatMap(([key, term]) => [...term.documentIds].map(docId => ({ source: docId, target: `term:${encodeURIComponent(key)}`, kind: term.kind, label: term.kind === "metadata" ? "Metadato compartido" : term.kind === "keyword" ? "Palabra clave" : "Término compartido" })));
  const documentPairs = new Set<string>();
  for (const [, term] of terms) {
    const ids = [...term.documentIds];
    for (let index = 1; index < ids.length && documentPairs.size < 1000; index += 1) {
      const first = ids[0], second = ids[index];
      const pairKey = [first, second].sort().join("|");
      if (documentPairs.has(pairKey)) continue;
      documentPairs.add(pairKey);
      edges.push({ source: first, target: second, kind: "shared-document", label: `Comparte ${term.kind === "metadata" ? "metadato" : term.kind === "keyword" ? "palabra clave" : "término"}: ${term.label}` });
    }
  }
  for (const doc of docNodes) edges.push({ source: hubId, target: doc.id, kind: "membership", label: "Pertenece al dataset" });
  return {
    datasetId,
    graph: { nodes: [hub, ...docNodes, ...termNodes], edges },
    mindMap: null,
    graphType: "chunks",
    documentCount: docNodes.length,
    conceptCount: termNodes.length,
    connectionCount: edges.length,
    message: `${docNodes.length} archivos · ${termNodes.length} ${localOnly ? "conceptos del archivo" : "conceptos compartidos"} desde chunks, nombres y metadatos.`,
  };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const auth = requireUser(request); if (!auth.user) return auth.response;
  const id = params.datasetId;
  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!id) return Response.json({ error: "Dataset is invalid." }, { status: 400 });
  if (auth.user.role !== "site-admin" && (!workspaceId || !workspaceHasResource(auth.user, workspaceId, "datasets", id))) return Response.json({ error: "Dataset is not linked to an authorized workspace." }, { status: 404 });
  try {
    const dataset = await validateDataset(id);
    const raw = asRecord(await ragflow(`/api/v1/datasets/${encodeURIComponent(id)}/graph`));
    const data = asRecord(raw.data ?? raw);
    const graph = asRecord(data.graph);
    const mindMap = asRecord(data.mind_map ?? data.mindMap);
    const hasKnowledgeGraph = Object.keys(graph).length > 0 || Object.keys(mindMap).length > 0;
    if (hasKnowledgeGraph) return Response.json({ datasetId: id, graph: Object.keys(graph).length ? graph : null, mindMap: Object.keys(mindMap).length ? mindMap : null, graphType: "knowledge" });

    // General-parser datasets may lack an extracted knowledge graph; derive explainable
    // document links from shared chunk terms and metadata instead.
    const pageSize = 100;
    const maxDocuments = 5000;
    const docs: Record<string, unknown>[] = [];
    let total = 0;
    for (let page = 1; docs.length < maxDocuments; page += 1) {
      const docsPayload = asRecord(await ragflow(`/api/v1/datasets/${encodeURIComponent(id)}/documents?page=${page}&page_size=${pageSize}`));
      const docsData = asRecord(docsPayload.data);
      const rows = Array.isArray(docsData.docs) ? docsData.docs.map(asRecord) : asList(docsPayload).map(asRecord);
      if (page === 1) total = Number(docsData.total) || rows.length;
      docs.push(...rows);
      if (!rows.length || docs.length >= total || rows.length < pageSize) break;
    }
    const uniqueDocs = [...new Map(docs.map(doc => [String(doc.id ?? doc.document_id ?? doc.name ?? ""), doc])).values()]
      .filter(doc => String(doc.id ?? doc.document_id ?? doc.name ?? ""));
    if (!uniqueDocs.length) return Response.json({ datasetId: id, graph: null, mindMap: null, graphType: "documents", message: "Este dataset todavía no tiene archivos asociados." });
    return Response.json(await buildDocumentConnections(id, String(dataset.name ?? "Dataset"), uniqueDocs));
  } catch (error) {
    const e = error instanceof RagflowError ? error : new RagflowError("No se pudo cargar el grafo.");
    return Response.json({ error: e.message }, { status: e.status });
  }
}
