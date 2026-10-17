import { RagflowError, ragflowFetch } from "./ragflow.server";

// RAGFlow always answers DownloadDocument with `application/octet-stream`, which
// makes browsers save the file instead of rendering it. Map the real type from
// the filename so PDFs and images preview inline.
const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  bmp: "image/bmp", svg: "image/svg+xml", avif: "image/avif", ico: "image/x-icon",
  txt: "text/plain; charset=utf-8", md: "text/plain; charset=utf-8", markdown: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8", tsv: "text/tab-separated-values; charset=utf-8",
  json: "application/json; charset=utf-8", jsonl: "application/x-ndjson; charset=utf-8",
  log: "text/plain; charset=utf-8", yaml: "text/yaml; charset=utf-8", yml: "text/yaml; charset=utf-8",
  xml: "text/plain; charset=utf-8", ini: "text/plain; charset=utf-8", cfg: "text/plain; charset=utf-8",
  conf: "text/plain; charset=utf-8", sql: "text/plain; charset=utf-8",
  eml: "text/plain; charset=utf-8",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function contentTypeFor(name: string, upstream: string | null) {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (CONTENT_TYPES[ext]) return CONTENT_TYPES[ext];
  const type = (upstream || "").trim();
  // Keep a specific upstream type, but never echo the generic download type.
  return type && !/^application\/octet-stream/i.test(type) ? type : "application/octet-stream";
}

// Streams a stored document back to the browser. Kept in a server-only module so
// route files export nothing but `loader` (React Router strips server code only
// from known route exports, so a shared helper must live here).
export async function serveDocumentFile(request: Request, datasetId: string, documentId: string) {
  const query = new URL(request.url).searchParams;
  const download = query.get("download") === "1";
  try {
    const upstream = await ragflowFetch(`/api/v1/datasets/${encodeURIComponent(datasetId)}/documents/${encodeURIComponent(documentId)}`);
    if (!upstream.ok || !upstream.body) throw new RagflowError("No se pudo obtener el documento.", upstream.status >= 400 ? upstream.status : 502);
    const name = upstreamFileName(upstream.headers.get("content-disposition")) || query.get("name")?.trim() || "documento";
    const headers = new Headers();
    headers.set("Content-Type", contentTypeFor(name, upstream.headers.get("content-type")));
    // `download=1` saves the file; otherwise it renders inline so PDFs preview.
    headers.set("Content-Disposition", `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(name)}`);
    headers.set("Cache-Control", "private, max-age=60");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(upstream.body, { status: 200, headers });
  } catch (error) {
    const e = error instanceof RagflowError ? error : new RagflowError("No se pudo obtener el documento.");
    return Response.json({ error: e.message }, { status: e.status });
  }
}

function upstreamFileName(disposition: string | null) {
  if (!disposition) return "";
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) { try { return decodeURIComponent(utf8[1].trim()); } catch { /* fall through to the plain form */ } }
  const plain = disposition.match(/filename="?([^";]+)"?/i);
  return plain ? plain[1].trim() : "";
}
