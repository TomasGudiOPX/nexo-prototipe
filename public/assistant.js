// NEXO · Asistente de Inteligencia
//
// This module owns the assistant screen: context selection (space/dataset/assistant),
// prompt suggestions, the chat transcript and the RAGFlow evidence block.
//
// It lives in its own file so the shell (nexo-ragflow.js) can be refactored without
// colliding with this screen. It is wired from nexo-prototipo.html and it wraps
// window.go, so no edit to the shell is required. The selection is mirrored into the
// URL, which is the contract the rest of NEXO already reads.
(() => {
  const screen = document.getElementById("screen-assistant");
  if (!screen) return;

  const WELCOME = "Hola. Soy el asistente de inteligencia de NEXO. Elijo las respuestas a partir de los documentos del dataset seleccionado y te muestro la evidencia que devuelve RAGFlow.";
  const SUGGESTIONS = [
    "Resumí los puntos principales de este dataset.",
    "¿Qué procesos o procedimientos están documentados?",
    "¿Qué roles o responsabilidades se describen?",
    "¿Qué información aparece incompleta o pendiente?",
  ];

  const state = {
    user: null, workspaces: [], workspaceId: "", datasets: [], datasetId: "",
    assistants: [], assistantId: "", sessions: [], conversationId: "", messages: [], busy: false, note: "",
  };
  let hydrated = false;

  // ---------------------------------------------------------------- styles
  const style = document.createElement("style");
  style.textContent = `
    .chat-input{flex-wrap:wrap;padding:10px!important;gap:8px!important}
    #assistantSourceBar{display:flex;flex:1 0 100%;flex-wrap:wrap;gap:7px;align-items:center;padding:0 0 9px;border-bottom:1px solid #26332d}
    #assistantSourceBar label{display:flex;align-items:center;gap:6px;min-width:0;color:#8d9a89;font-size:8px;font-weight:700;letter-spacing:1px;text-transform:uppercase}
    #assistantSourceBar select{height:28px;max-width:154px;padding:0 25px 0 8px;border:1px solid #34403b;border-radius:5px;background:#101719;color:#e9eeeb;font:500 10px 'DM Sans',sans-serif;outline:none}
    #assistantSourceBar select:focus{border-color:#a7c56e}
    #assistantSourceBar select:disabled{opacity:.55}
    #assistantSourceStatus{margin-left:auto;color:#82928f;font-size:10px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:210px}
    .chat-input #chatInput{min-width:0;flex:1}
    @media(max-width:760px){#assistantSourceBar{gap:6px}#assistantSourceBar label{width:100%;justify-content:space-between}#assistantSourceBar select{max-width:74%;flex:1}#assistantSourceStatus{margin-left:0;max-width:100%;width:100%}}
    .chat-evidence{display:grid;gap:8px;margin-top:12px;padding-top:10px;border-top:1px solid #2b3a33}
    .chat-evidence>b{color:#a9bd86;font-size:10px;letter-spacing:1px;text-transform:uppercase}
    .chat-doc-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
    .chat-doc-score{color:#8fa87a;font-size:10px;white-space:nowrap}
    .chat-doc small{display:block;color:#9fb0a4;margin-top:6px;line-height:1.55}
    .chat-doc .btn{margin-top:8px;align-self:flex-start}
    .chat-note{color:#8f9c93;font-size:11px;margin-top:10px;line-height:1.5}
    .chat-note.error{color:#e38575}
    .assistant-ready{display:grid;gap:10px;margin-top:18px;color:#9fb0a4;font-size:11px;line-height:1.6}
    .assistant-ready b{color:#e9eeeb}
  `;
  document.head.appendChild(style);

  // ---------------------------------------------------------------- helpers
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  async function api(path, init = {}) {
    const response = await fetch(path, {
      ...init,
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `La solicitud falló (${response.status}).`);
    return body;
  }

  function currentWorkspace() { return state.workspaces.find(row => row.id === state.workspaceId) || null; }
  function currentDataset() { return state.datasets.find(row => row.id === state.datasetId) || null; }
  const isAdmin = () => state.user?.role === "site-admin";

  // The chat route needs a dataset, and an assistant whenever a workspace is set.
  function notReadyReason() {
    if (!state.user) return "Iniciá sesión para consultar tus documentos.";
    if (!state.workspaceId && !isAdmin()) return "Elegí un espacio de trabajo autorizado para consultar.";
    if (!state.datasetId) return state.workspaceId ? "Este espacio no tiene datasets vinculados." : "Elegí un dataset para consultar.";
    if (state.workspaceId && !state.assistantId) return "Este espacio no tiene asistentes vinculados.";
    return "";
  }

  // ---------------------------------------------------------------- context
  function applyWorkspace(datasetParam, assistantParam) {
    const workspace = currentWorkspace();
    state.datasets = (workspace?.datasets || [])
      .map(row => ({ id: String(row.id ?? row.dataset_id ?? ""), name: String(row.name ?? row.dataset_name ?? "Dataset") }))
      .filter(row => row.id);
    state.assistants = (workspace?.assistants || [])
      .map(row => ({ id: String(row.id ?? row.chat_id ?? ""), name: String(row.name ?? "Asistente") }))
      .filter(row => row.id);
    state.datasetId = state.datasets.some(row => row.id === datasetParam) ? datasetParam : (state.datasets[0]?.id || "");
    state.assistantId = state.assistants.some(row => row.id === assistantParam) ? assistantParam : (state.assistants[0]?.id || "");
    state.conversationId = "";
    state.messages = [];
    state.sessions = [];
  }

  async function loadContext() {
    const params = new URLSearchParams(location.search);
    state.note = "";
    try { state.user = (await api("/api/auth/session")).user || null; }
    catch { state.user = null; }
    state.workspaces = [];
    if (state.user) {
      try { state.workspaces = (await api("/api/workspaces")).workspaces || []; }
      catch (error) { state.note = `No se pudieron cargar los espacios: ${error.message}`; }
    }
    const requested = params.get("workspaceId") || "";
    state.workspaceId = state.workspaces.some(row => row.id === requested) ? requested : "";
    applyWorkspace(params.get("dataset"), params.get("assistantId"));
    await loadSessions(params.get("sessionId"));
  }

  function sessionMessages(session) {
    const raw = session.messages ?? session.message ?? [];
    const rows = Array.isArray(raw) ? raw : (() => { try { return JSON.parse(raw); } catch { return []; } })();
    return rows.filter(row => row && typeof row === "object" && (row.role === "user" || row.role === "assistant"))
      .map(row => ({ role: row.role === "user" ? "user" : "ai", text: String(row.content ?? row.text ?? ""), references: Array.isArray(row.reference) ? row.reference : undefined }));
  }

  async function loadSessions(requestedId) {
    if (!state.datasetId || (state.workspaceId && !state.assistantId)) return;
    const query = new URLSearchParams();
    if (state.workspaceId) query.set("workspaceId", state.workspaceId);
    if (state.assistantId) query.set("assistantId", state.assistantId);
    try {
      const payload = await api(`/api/datasets/${encodeURIComponent(state.datasetId)}/sessions?${query}`);
      state.sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
      const selected = state.sessions.find(row => String(row.id) === requestedId);
      if (selected) { state.conversationId = String(selected.id); state.messages = sessionMessages(selected); }
    } catch (error) { state.note = `No se pudieron cargar las sesiones: ${error.message}`; }
  }

  // Mirror the selection into the URL so refresh, back/forward and the rest of
  // NEXO (which reads these params) stay in agreement.
  function syncUrl() {
    const url = new URL(location.href);
    const set = (key, value) => { if (value) url.searchParams.set(key, value); else url.searchParams.delete(key); };
    set("workspaceId", state.workspaceId);
    set("dataset", state.datasetId);
    set("assistantId", state.workspaceId ? state.assistantId : "");
    set("sessionId", state.conversationId);
    history.replaceState({}, "", url);
  }

  // ---------------------------------------------------------------- render
  // Source selection belongs to the composer, where it remains visible at
  // the exact moment a question is sent instead of becoming a detached bar.
  function sourceBar() {
    document.getElementById("assistantContext")?.remove();
    let bar = document.getElementById("assistantSourceBar");
    if (!bar) {
      bar = el("div");
      bar.id = "assistantSourceBar";
      const composer = screen.querySelector(".chat-input");
      if (composer) composer.prepend(bar); else screen.querySelector(".chatbox")?.append(bar);
    }
    bar.replaceChildren();

    const build = (labelText, rows, selected, onChange) => {
      const label = el("label");
      label.append(el("span", null, labelText));
      const select = el("select");
      select.disabled = !rows.length;
      select.append(new Option("Seleccionar…", ""));
      rows.forEach(row => select.append(new Option(row.name, row.id)));
      select.value = selected || "";
      select.addEventListener("change", () => onChange(select.value));
      label.append(select);
      return label;
    };

    bar.append(
      build("Dataset", state.datasets, state.datasetId, value => {
        state.datasetId = value;
        state.conversationId = ""; state.messages = []; state.sessions = [];
        void loadSessions("").then(() => { syncUrl(); renderAll(); });
      }),
      build("Asistente", state.assistants, state.assistantId, value => {
        state.assistantId = value;
        state.conversationId = ""; state.messages = []; state.sessions = [];
        void loadSessions("").then(() => { syncUrl(); renderAll(); });
      }),
      build("Sesión", [{ id: "", name: "Nueva sesión" }, ...state.sessions.map(row => ({ id: String(row.id), name: String(row.name || "Sesión sin título") }))], state.conversationId, value => {
        const selected = state.sessions.find(row => String(row.id) === value);
        state.conversationId = value;
        state.messages = selected ? sessionMessages(selected) : [];
        syncUrl(); renderAll();
      }),
    );

    const status = el("p");
    status.id = "assistantSourceStatus";
    status.setAttribute("role", "status");
    // The blocking reason is explained next to the input; here we only report
    // load failures and the active source.
    status.textContent = state.note || (notReadyReason() ? "" : `Consultando sobre ${currentDataset()?.name || "el dataset"}`);
    bar.append(status);
  }

  // The shell injects an MCP placeholder into this screen; the assistant has no
  // tool selector, so it is removed whenever it appears.
  function dropMcpPlaceholder() {
    const layout = screen.querySelector(".assistant-layout");
    if (!layout) return;
    const drop = () => document.getElementById("nexoMcpTools")?.remove();
    drop();
    if (layout.dataset.mcpGuarded) return;
    layout.dataset.mcpGuarded = "1";
    new MutationObserver(drop).observe(layout, { childList: true });
  }

  // The design's side panel keeps the brain, its status and the notice. The
  // "ANIMACIÓN ILUSTRATIVA" label, the duplicated prompt list and the redundant
  // source summary are removed.
  function tidySidePanel() {
    const side = screen.querySelector(".assistant-side");
    if (!side) return;
    side.querySelector(".eyebrow")?.remove();
    side.querySelector(".panel-title")?.remove();
    side.querySelectorAll(".recent-query").forEach(node => node.remove());
    document.getElementById("assistantSource")?.remove();
  }

  function renderSuggestions() {
    const container = screen.querySelector(".chat-suggestions");
    if (!container) return;
    container.replaceChildren(...SUGGESTIONS.map(text => {
      const button = el("button", "suggestion", text.length > 42 ? `${text.slice(0, 39)}…` : text);
      button.type = "button";
      button.title = text;
      button.addEventListener("click", () => void send(text));
      return button;
    }));
  }

  // The side panel keeps the design's brain, its status and the notice.
  function renderSidePanel() {
    tidySidePanel();
  }

  function evidenceBlock(references) {
    const wrap = el("div", "chat-evidence");
    wrap.append(el("b", null, "Evidencia de RAGFlow"));
    references.filter(row => row && typeof row === "object").forEach((row, index) => {
      const item = el("div", "chat-doc");
      const head = el("div", "chat-doc-head");
      head.append(el("b", null, row.document_name || row.doc_name || row.document || `Fuente ${index + 1}`));
      const score = Number(row.similarity);
      if (Number.isFinite(score)) head.append(el("span", "chat-doc-score", `similitud ${Math.round(score * 100)}%`));
      item.append(head);
      const content = String(row.content ?? row.text ?? row.chunk ?? "").trim();
      item.append(el("small", null, content ? (content.length > 320 ? `${content.slice(0, 320)}…` : content) : "Sin fragmento devuelto."));
      const datasetId = row.dataset_id || state.datasetId;
      if (datasetId) {
        const open = el("button", "btn ghost small", "Ver documentos ↗");
        open.type = "button";
        open.addEventListener("click", () => {
          const url = new URL(location.href);
          url.searchParams.set("vista", "knowledge");
          url.searchParams.set("dataset", datasetId);
          if (state.workspaceId) url.searchParams.set("workspaceId", state.workspaceId);
          history.pushState({}, "", url);
          window.go?.("knowledge");
        });
        item.append(open);
      }
      wrap.append(item);
    });
    return wrap;
  }

  function bubble(message) {
    const node = el("div", `bubble ${message.role === "user" ? "user" : "ai"}`);
    node.append(el("div", "nexo-chat-text", message.text || ""));
    if (message.error) node.append(el("p", "chat-note error", "No se pudo obtener la respuesta. Revisá la conexión con RAGFlow y reintentá."));
    if (Array.isArray(message.references)) {
      if (message.references.length) node.append(evidenceBlock(message.references));
      else node.append(el("p", "chat-note", "RAGFlow no devolvió fragmentos para esta respuesta. Verificá el dato antes de decidir."));
    }
    return node;
  }

  function renderChat() {
    const feed = document.getElementById("chatFeed");
    if (!feed) return;
    feed.replaceChildren(...(state.messages.length ? state.messages : [{ role: "ai", text: WELCOME }]).map(bubble));
    feed.scrollTop = feed.scrollHeight;
  }

  function renderReadyState() {
    const input = document.getElementById("chatInput");
    const sendButton = screen.querySelector(".chat-input .round");
    const reason = notReadyReason();
    if (input) {
      input.disabled = Boolean(reason) || state.busy;
      input.placeholder = reason || "Escribí tu consulta al cerebro de NEXO…";
    }
    if (sendButton) sendButton.disabled = Boolean(reason) || state.busy;
    let help = document.getElementById("assistantReady");
    if (reason) {
      if (!help) { help = el("div", "assistant-ready"); help.id = "assistantReady"; screen.querySelector(".chatbox")?.prepend(help); }
      help.replaceChildren(el("span", null, reason));
      if (!state.user) {
        const signIn = el("button", "btn secondary small", "Iniciar sesión");
        signIn.type = "button";
        signIn.addEventListener("click", () => window.nexoSignIn?.());
        help.append(signIn);
      }
    } else {
      help?.remove();
    }
  }

  function renderStatus(text) {
    const status = document.getElementById("brainStatus");
    if (status) status.textContent = text || (notReadyReason() ? "Esperando selección" : "●  Listo para consultar");
  }

  function renderAll() {
    dropMcpPlaceholder();
    sourceBar(); renderSuggestions(); renderSidePanel(); renderChat(); renderReadyState(); renderStatus();
  }

  // ---------------------------------------------------------------- actions
  async function send(question) {
    const input = document.getElementById("chatInput");
    const text = String(question ?? input?.value ?? "").trim();
    if (!text || state.busy) return;
    const reason = notReadyReason();
    if (reason) { state.note = reason; renderAll(); return; }
    if (input) input.value = "";
    const datasetId = state.datasetId;
    state.busy = true;
    state.messages.push({ role: "user", text });
    renderChat(); renderReadyState(); renderStatus("Consultando RAGFlow…");
    try {
      const body = { question: text, conversationId: state.conversationId };
      if (state.workspaceId) { body.workspaceId = state.workspaceId; body.assistantId = state.assistantId; }
      const payload = await api(`/api/datasets/${encodeURIComponent(datasetId)}/chat`, { method: "POST", body: JSON.stringify(body) });
      if (datasetId !== state.datasetId) return;
      state.conversationId = payload.conversationId || state.conversationId;
      const references = Array.isArray(payload.references) ? payload.references : null;
      state.messages.push({ role: "ai", text: payload.answer || "RAGFlow no devolvió una respuesta.", references });
      renderStatus(references?.length ? `Respuesta con ${references.length} fragmento(s) de evidencia` : "Respuesta sin evidencia devuelta");
    } catch (error) {
      if (datasetId !== state.datasetId) return;
      state.messages.push({ role: "ai", text: `No pude completar la consulta: ${error.message}`, error: true });
      renderStatus("RAGFlow no disponible");
    } finally {
      state.busy = false;
      renderChat(); renderReadyState();
    }
  }

  function reset() {
    state.messages = [];
    state.conversationId = "";
    state.note = "";
    syncUrl();
    renderChat(); renderReadyState(); renderStatus();
  }

  // ---------------------------------------------------------------- wiring
  window.renderChat = renderChat;
  window.sendChat = () => void send();
  window.ask = text => { window.go?.("assistant"); void send(text); };
  window.resetChat = reset;

  const previousGo = window.go;
  window.go = function (id) {
    const result = typeof previousGo === "function" ? previousGo.apply(this, arguments) : undefined;
    if (id === "assistant") { void hydrate().then(renderAll); }
    return result;
  };

  async function hydrate() {
    if (hydrated) return;
    hydrated = true;
    await loadContext();
  }
  async function refresh() { hydrated = false; await hydrate(); renderAll(); }

  window.addEventListener("popstate", () => void refresh());
  window.addEventListener("nexo-workspaces-changed", () => void refresh());
  window.addEventListener("nexo-session-changed", () => void refresh());
  document.getElementById("nexoWorkspace")?.addEventListener("change", () => void refresh());

  window.NexoAssistant = { refresh, send, state };

  const start = new URLSearchParams(location.search).get("vista") === "assistant";
  void (start ? refresh() : hydrate().then(renderAll));
})();
