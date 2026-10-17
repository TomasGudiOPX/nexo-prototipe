// NEXO · Vista previa de documentos
//
// Opens a modal preview for a dataset document, adapting the stored file to what
// the browser renders natively: PDFs and images use the built-in viewers, text
// formats (markdown, txt, csv, json, logs) are shown as plain text, DOCX files
// are unzipped in place and EML messages are MIME-decoded. The rest falls back
// to a download prompt. Content is always written with textContent, so a
// document can never inject markup.

const TEXT_EXT = new Set(["txt", "text", "md", "markdown", "csv", "tsv", "json", "jsonl", "log", "yaml", "yml", "xml", "ini", "cfg", "conf", "sql"]);
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif", "ico"]);

const DOWNLOAD_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M5 21h14"/></svg>';
const OPEN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';

function extension(name) {
  const parts = String(name || "").toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() : "";
}

export function openDocumentPreview({ url, name, downloadUrl }) {
  const ext = extension(name);
  const dialog = document.createElement("dialog");
  dialog.className = "nexo-preview";
  dialog.setAttribute("aria-labelledby", "nexoPreviewTitle");
  dialog.innerHTML = `
    <header class="nexo-preview-head">
      <div class="nexo-preview-title">
        <b id="nexoPreviewTitle"></b>
        <span class="nexo-preview-ext"></span>
      </div>
      <div class="nexo-preview-actions">
        <a class="nexo-preview-action" data-download>${DOWNLOAD_ICON}<span>Descargar</span></a>
        <a class="nexo-preview-action" data-open target="_blank" rel="noopener" title="Abrir en una pestaña nueva">${OPEN_ICON}<span>Abrir</span></a>
        <button type="button" class="nexo-preview-close" data-close aria-label="Cerrar">✕</button>
      </div>
    </header>
    <div class="nexo-preview-stage" data-stage>
      <p class="nexo-preview-status" role="status">Cargando vista previa…</p>
    </div>`;
  dialog.querySelector("#nexoPreviewTitle").textContent = name || "Documento";
  dialog.querySelector(".nexo-preview-ext").textContent = ext ? ext.toUpperCase() : "";
  const download = dialog.querySelector("[data-download]");
  download.href = downloadUrl || url;
  download.setAttribute("download", "");
  dialog.querySelector("[data-open]").href = url;

  const stage = dialog.querySelector("[data-stage]");
  const clearStatus = () => dialog.querySelector(".nexo-preview-status")?.remove();
  const status = text => { const node = dialog.querySelector(".nexo-preview-status"); if (node) node.textContent = text; };
  const fail = message => {
    stage.replaceChildren();
    const box = document.createElement("div");
    box.className = "nexo-preview-fallback";
    const strong = document.createElement("strong");
    strong.textContent = "No se pudo mostrar la vista previa";
    const small = document.createElement("small");
    small.textContent = message || "Descargá el archivo para verlo en tu equipo.";
    box.append(strong, small);
    stage.append(box);
  };
  const textView = () => {
    const pre = document.createElement("pre");
    pre.className = "nexo-preview-text";
    stage.append(pre);
    return pre;
  };
  const fetchResponse = async () => {
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error(`El servidor respondió ${response.status}.`);
    return response;
  };

  if (ext === "pdf") {
    const frame = document.createElement("iframe");
    frame.className = "nexo-preview-frame";
    frame.title = name || "Documento PDF";
    frame.addEventListener("load", clearStatus);
    frame.addEventListener("error", () => fail("El navegador no pudo abrir el PDF."));
    frame.src = url;
    stage.append(frame);
    // Some PDF viewers never fire `load`; never leave the overlay stuck.
    setTimeout(clearStatus, 2500);
  } else if (IMAGE_EXT.has(ext)) {
    const image = document.createElement("img");
    image.className = "nexo-preview-image";
    image.alt = name || "Documento";
    image.addEventListener("load", clearStatus);
    image.addEventListener("error", () => fail("No se pudo cargar la imagen."));
    image.src = url;
    stage.append(image);
  } else if (ext === "docx") {
    status("Leyendo el documento…");
    const pre = textView();
    fetchResponse()
      .then(response => response.arrayBuffer())
      .then(buffer => extractDocxText(buffer))
      .then(text => { clearStatus(); pre.textContent = text.slice(0, 500000); })
      .catch(error => fail(error.message || "No se pudo leer el DOCX."));
  } else if (ext === "eml") {
    status("Leyendo el correo…");
    fetchResponse()
      .then(response => response.text())
      .then(source => { clearStatus(); stage.append(emlView(parseEml(source))); })
      .catch(error => fail(error.message || "No se pudo leer el correo."));
  } else if (TEXT_EXT.has(ext)) {
    const pre = textView();
    fetchResponse()
      .then(response => response.text())
      .then(text => { clearStatus(); pre.textContent = text.slice(0, 500000); })
      .catch(error => fail(error.message));
  } else {
    fail("Este formato no tiene vista previa en el navegador.");
  }

  const close = () => dialog.close();
  dialog.querySelector("[data-close]").addEventListener("click", close);
  // Clicking the backdrop (outside the dialog box) dismisses it.
  dialog.addEventListener("click", event => { if (event.target === dialog) close(); });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

function emlView(message) {
  const wrap = document.createElement("div");
  wrap.className = "nexo-preview-body";
  const meta = document.createElement("dl");
  meta.className = "nexo-preview-meta";
  const rows = [["De", message.from], ["Para", message.to], ["CC", message.cc], ["Asunto", message.subject], ["Fecha", message.date], ["Adjuntos", message.attachments.join(", ")]];
  for (const [label, value] of rows) {
    if (!value) continue;
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = value;
    meta.append(term, detail);
  }
  const pre = document.createElement("pre");
  pre.className = "nexo-preview-text";
  pre.textContent = message.text.slice(0, 500000);
  wrap.append(meta, pre);
  return wrap;
}

// ---------------------------------------------------------------- DOCX
// A .docx is a ZIP whose visible text lives in word/document.xml. Parsing the
// central directory lets us inflate that one entry with the browser's native
// DecompressionStream, so no bundler or third-party library is required.
export async function extractDocxText(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const entries = readZipDirectory(bytes);
  const entry = entries.get("word/document.xml");
  if (!entry) throw new Error("El archivo no parece ser un DOCX válido.");
  const xml = new TextDecoder("utf-8").decode(await inflateEntry(bytes, entry));
  const text = documentXmlToText(xml);
  return text || "El documento no contiene texto visible.";
}

function readZipDirectory(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view);
  if (eocd < 0) throw new Error("El archivo comprimido está dañado.");
  const count = view.getUint16(eocd + 10, true);
  let pointer = view.getUint32(eocd + 16, true);
  const entries = new Map();
  for (let index = 0; index < count; index++) {
    if (pointer + 46 > view.byteLength || view.getUint32(pointer, true) !== 0x02014b50) break;
    const method = view.getUint16(pointer + 10, true);
    const compressedSize = view.getUint32(pointer + 20, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const localOffset = view.getUint32(pointer + 42, true);
    const name = new TextDecoder("utf-8").decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength));
    // Local header name/extra may differ in length from the central directory,
    // so read them to locate the actual data start.
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    entries.set(name, { method, compressedSize, dataStart: localOffset + 30 + localNameLength + localExtraLength });
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function findEndOfCentralDirectory(view) {
  const start = Math.max(0, view.byteLength - 22 - 65535);
  for (let index = view.byteLength - 22; index >= start; index--) {
    if (view.getUint32(index, true) === 0x06054b50) return index;
  }
  return -1;
}

async function inflateEntry(bytes, entry) {
  const slice = bytes.subarray(entry.dataStart, entry.dataStart + entry.compressedSize);
  if (entry.method === 0) return slice;
  if (entry.method !== 8) throw new Error(`Método de compresión no soportado (${entry.method}).`);
  if (typeof DecompressionStream !== "function") throw new Error("Este navegador no puede descomprimir el DOCX.");
  const stream = new Blob([slice]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function documentXmlToText(xml) {
  const paragraphs = xml.split("</w:p>").map(paragraph => {
    let text = "";
    for (const match of paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)) text += decodeXmlEntities(match[1]);
    return text;
  });
  return paragraphs.join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function decodeXmlEntities(value) {
  return value.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (whole, entity) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[entity] || whole;
  });
}

// ---------------------------------------------------------------- EML
// An .eml is an RFC 822 message. Parse the headers and walk the MIME tree,
// decoding base64 / quoted-printable parts, so the preview shows the real
// message text instead of a wall of encoded source. Attachments are listed but
// not rendered.
export function parseEml(source) {
  const { headerText, body } = splitMessage(String(source));
  const headers = parseHeaderLines(headerText);
  const parts = collectParts(headers.get("content-type") || "text/plain", body, headers);
  const inline = parts.filter(part => !part.attachment && part.text !== undefined);
  const plain = inline.find(part => part.type === "text/plain");
  const html = inline.find(part => part.type === "text/html");
  const text = plain ? plain.text : html ? htmlToText(html.text) : "";
  return {
    from: headerValue(headers, "from"),
    to: headerValue(headers, "to"),
    cc: headerValue(headers, "cc"),
    subject: headerValue(headers, "subject"),
    date: headerValue(headers, "date"),
    attachments: parts.filter(part => part.attachment).map(part => part.filename || part.type),
    text: text.trim() || "El correo no contiene texto visible.",
  };
}

function splitMessage(source) {
  const match = /\r?\n\r?\n/.exec(source);
  if (!match || match.index === undefined) return { headerText: source, body: "" };
  return { headerText: source.slice(0, match.index), body: source.slice(match.index + match[0].length) };
}

function parseHeaderLines(block) {
  const headers = new Map();
  const unfolded = String(block).replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    headers.set(name, headers.has(name) ? `${headers.get(name)}, ${value}` : value);
  }
  return headers;
}

function headerValue(headers, name) {
  const value = headers.get(name);
  return value ? decodeHeaderValue(value) : "";
}

function parseContentType(value) {
  const [main, ...rest] = String(value || "text/plain").split(";");
  const params = {};
  for (const segment of rest) {
    const index = segment.indexOf("=");
    if (index < 1) continue;
    const key = segment.slice(0, index).trim().toLowerCase();
    let param = segment.slice(index + 1).trim();
    if (param.startsWith('"') && param.endsWith('"')) param = param.slice(1, -1);
    params[key] = param;
  }
  return { type: main.trim().toLowerCase(), params };
}

function collectParts(contentType, body, headers) {
  const { type, params } = parseContentType(contentType);
  if (type.startsWith("multipart/") && params.boundary) return splitParts(body, params.boundary);
  const disposition = parseContentType(headers.get("content-disposition") || "");
  return [{
    type,
    text: decodeBody(body, headers.get("content-transfer-encoding"), params.charset),
    attachment: disposition.type === "attachment",
    filename: disposition.params.filename || params.name || "",
  }];
}

function splitParts(body, boundary) {
  const chunks = String(body).split(`--${boundary}`);
  const parts = [];
  for (let index = 1; index < chunks.length; index++) {
    const chunk = chunks[index];
    if (chunk.startsWith("--")) break; // closing delimiter
    const { headerText, body: partBody } = splitMessage(chunk.replace(/^\r?\n/, ""));
    const headers = parseHeaderLines(headerText);
    parts.push(...collectParts(headers.get("content-type") || "text/plain", partBody, headers));
  }
  return parts;
}

function decodeBody(body, encoding, charset) {
  const value = String(body);
  const kind = String(encoding || "").trim().toLowerCase();
  if (kind === "base64") {
    try { return decodeBytes(base64ToBytes(value.replace(/\s+/g, "")), charset); }
    catch { return value; }
  }
  if (kind === "quoted-printable") return decodeBytes(quotedPrintableToBytes(value, false), charset);
  return decodeBytes(new TextEncoder().encode(value), charset);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

// Decodes `=XX` escapes and, for quoted-printable (not Q-encoding), soft line
// breaks. Literal characters are encoded to UTF-8 so the charset decoder sees
// the original bytes.
function quotedPrintableToBytes(value, forHeader) {
  const encoder = new TextEncoder();
  const bytes = [];
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char === "=" && /^[0-9A-Fa-f]{2}$/.test(value.slice(index + 1, index + 3))) {
      bytes.push(parseInt(value.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }
    if (!forHeader && char === "=" && value[index + 1] === "\r" && value[index + 2] === "\n") { index += 2; continue; }
    if (!forHeader && char === "=" && value[index + 1] === "\n") { index += 1; continue; }
    if (forHeader && char === "_") { bytes.push(0x20); continue; }
    bytes.push(...encoder.encode(char));
  }
  return new Uint8Array(bytes);
}

function decodeBytes(bytes, charset) {
  const label = String(charset || "utf-8").trim().toLowerCase().replace(/^"|"$/g, "");
  try { return new TextDecoder(label).decode(bytes); }
  catch { return new TextDecoder("utf-8").decode(bytes); }
}

// RFC 2047 encoded words, e.g. =?utf-8?Q?Cr=C3=A9dito?=
function decodeHeaderValue(value) {
  return String(value).replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (whole, charset, encoding, text) => {
    try {
      if (encoding.toLowerCase() === "b") return decodeBytes(base64ToBytes(text.replace(/\s+/g, "")), charset);
      return decodeBytes(quotedPrintableToBytes(text, true), charset);
    } catch { return whole; }
  });
}

function htmlToText(html) {
  if (typeof DOMParser === "function") {
    try {
      const parsed = new DOMParser().parseFromString(String(html), "text/html");
      parsed.querySelectorAll("script, style, head").forEach(node => node.remove());
      return parsed.body ? parsed.body.textContent : "";
    } catch { /* fall through to the regex strip */ }
  }
  return String(html).replace(/<[^>]*>/g, " ");
}
