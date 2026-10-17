import { openDocumentUpload } from "./document-upload.js";

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

  const WELCOME = "Hola. Soy el asistente de inteligencia de NEXO. Elijo las respuestas a partir de los documentos de la fuente seleccionada y te muestro la evidencia que devuelve RAGFlow.";
  const SUGGESTIONS = [
    "Resumí los puntos principales de esta fuente.",
    "¿Qué procesos o procedimientos están documentados?",
    "¿Qué roles o responsabilidades se describen?",
    "¿Qué información aparece incompleta o pendiente?",
  ];

  const state = {
    user: null, workspaces: [], workspaceId: "", datasets: [], datasetId: "",
    assistants: [], assistantId: "", sessions: [], conversationId: "", messages: [], busy: false, note: "",
  };
  let hydrated = false;

  // Voice-to-text (Web Speech API) and its UI state. `voiceBase` keeps the text
  // already typed so dictation appends instead of replacing the draft.
  const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null, listening = false, voiceBase = "", voiceMessage = "";

  // ---------------------------------------------------------------- styles
  const style = document.createElement("style");
  style.textContent = `
    .chat-input{display:flex!important;flex-direction:column;gap:12px;padding:12px 14px 14px!important;border-color:#354139!important;background:#121a1a!important;box-shadow:0 12px 34px rgba(0,0,0,.18)}
    #assistantSourceBar{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:0;border-bottom:1px solid rgba(165,190,165,.14)}
    #assistantSourceBar label{position:relative;display:grid;gap:3px;min-width:0;padding:7px 28px 7px 10px;border:1px solid rgba(165,190,165,.13);border-radius:7px;background:rgba(6,11,14,.34);color:#89968d;font-size:8px;font-weight:700;letter-spacing:.85px;line-height:1;text-transform:uppercase;transition:border-color 160ms ease,background-color 160ms ease}
    #assistantSourceBar label::after{content:'⌄';position:absolute;right:10px;bottom:8px;color:#9caf7d;font-size:13px;font-weight:400;pointer-events:none}
    #assistantSourceBar label:focus-within{border-color:rgba(181,207,126,.68);background:rgba(181,207,126,.055)}
    #assistantSourceBar select{width:100%;min-width:0;padding:0;border:0;appearance:none;background:transparent;color:#e8eee9;color-scheme:dark;font:600 12px/1.25 'DM Sans',sans-serif;outline:none;cursor:pointer;text-overflow:ellipsis}
    #assistantSourceBar select:disabled{opacity:.48;cursor:not-allowed}
    #assistantSourceBar option{background:#0d1517;color:#e8eee9}
    #assistantSourceStatus{grid-column:1/-1;margin:0;color:#d58d7c;font-size:11px;line-height:1.35}
    #assistantSourceStatus:empty{display:none}
    .chat-composer{display:flex;align-items:center;gap:4px;padding:5px 6px 5px 14px;border:1px solid #2a3833;border-radius:12px;background:#0d1517;transition:border-color 160ms ease,box-shadow 160ms ease}
    .chat-composer:focus-within{border-color:#778d5b;box-shadow:0 0 0 3px rgba(183,212,126,.12)}
    .chat-composer #chatInput{flex:1;min-width:0;min-height:34px;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;color:#e1e8df;box-shadow:none!important}
    .chat-composer .composer-btn{flex:0 0 auto;width:36px;height:36px;display:grid;place-items:center;padding:0;border:0;border-radius:9px;background:transparent;color:#aebba6;cursor:pointer;transition:background-color 160ms ease,color 160ms ease,transform 160ms ease}
    .chat-composer .composer-btn:hover:not(:disabled){background:#1c2723;color:#e6f0d8}
    .chat-composer .composer-btn:disabled{opacity:.38;cursor:not-allowed}
    .chat-composer .composer-btn svg{width:18px;height:18px;display:block}
    .chat-composer .voice-control{position:relative}
    .chat-composer .voice-control.listening{background:rgba(184,206,125,.16);color:#d8e8ab}
    .chat-composer .voice-control.listening::after{content:'';position:absolute;inset:0;border-radius:9px;border:1px solid rgba(184,206,125,.55);animation:nexoMicPulse 1.5s ease-out infinite}
    @keyframes nexoMicPulse{0%{transform:scale(.92);opacity:.8}100%{transform:scale(1.28);opacity:0}}
    .chat-composer .round{flex:0 0 auto;width:38px;height:38px;display:grid;place-items:center;padding:0;border:0;border-radius:9px;background:#b8ce7d;color:#162019;cursor:pointer;transition:transform 160ms ease,background-color 160ms ease}
    .chat-composer .round:hover:not(:disabled){background:#c8dc91;transform:translateY(-1px)}
    .chat-composer .round:disabled{opacity:.45;cursor:not-allowed;transform:none}
    .chat-composer .round svg{width:18px;height:18px;display:block}
    @media(max-width:760px){.chat-input{padding:10px!important}#assistantSourceBar{grid-template-columns:1fr;gap:6px;padding-bottom:10px}#assistantSourceBar label{min-height:44px;padding:8px 31px 8px 11px}#assistantSourceBar label::after{bottom:13px}.chat-composer{padding-left:12px}.chat-composer .composer-btn{width:40px;height:40px}.chat-composer .round{width:42px;height:42px}}
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
    .assistant-side .notice{display:grid;gap:7px;margin-top:22px;padding-top:14px;border-top:1px solid rgba(165,190,165,.14);color:#93a098!important}
    .assistant-side .notice b{color:#c8d9a8;font-size:9px;letter-spacing:1px;text-transform:uppercase}
    .assistant-side .notice span{font-size:11px;line-height:1.55}
    .assistant-side .notice .notice-summary{color:#d8e1d8;font-weight:600}
    .assistant-side .notice .notice-detail{padding-left:9px;border-left:1px solid rgba(184,206,125,.42);color:#9eaaa1}
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
  function currentAssistant() { return state.assistants.find(row => row.id === state.assistantId) || null; }
  const isAdmin = () => state.user?.role === "site-admin";

  // The chat route needs a dataset, and an assistant whenever a workspace is set.
  function notReadyReason() {
    if (!state.user) return "Iniciá sesión para consultar tus documentos.";
    if (!state.workspaceId && !isAdmin()) return "Elegí un espacio de trabajo autorizado para consultar.";
    if (!state.datasetId) return state.workspaceId ? "Este espacio no tiene fuentes vinculadas." : "Elegí una fuente para consultar.";
    if (state.workspaceId && !state.assistantId) return "Este espacio no tiene asistentes vinculados.";
    return "";
  }

  // ---------------------------------------------------------------- context
  function applyWorkspace(datasetParam, assistantParam) {
    const workspace = currentWorkspace();
    state.datasets = (workspace?.datasets || [])
      .map(row => ({ id: String(row.id ?? row.dataset_id ?? ""), name: String(row.name ?? row.dataset_name ?? "Fuente") }))
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
      build("Fuente", state.datasets, state.datasetId, value => {
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
    status.textContent = state.note;
    bar.append(status);
  }

  // The shell injects an MCP placeholder and a source strip into this screen.
  // The assistant owns both concerns here, so they are removed on sight.
  function dropShellExtras() {
    const layout = screen.querySelector(".assistant-layout");
    if (!layout) return;
    const drop = () => {
      document.getElementById("nexoMcpTools")?.remove();
      document.getElementById("assistantContextStrip")?.remove();
    };
    drop();
    if (layout.dataset.shellExtrasGuarded) return;
    layout.dataset.shellExtrasGuarded = "1";
    new MutationObserver(drop).observe(layout, { childList: true, subtree: true });
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
    const notice = side.querySelector(".notice");
    if (notice) notice.replaceChildren(
      el("b", null, "Fuentes y contexto"),
      el("span", "notice-summary", currentDataset() ? `Consultando ${currentDataset().name} con ${currentAssistant()?.name || "el asistente seleccionado"}.` : "Elegí una fuente y un asistente para comenzar."),
      el("span", "notice-detail", "Subí documentos desde la barra y aparecerán junto a cada respuesta."),
      el("span", "notice-detail", state.conversationId ? "Esta sesión conserva el contexto de la conversación." : "Una nueva consulta iniciará una sesión de conversación."),
    );
    // The shell prepends a redundant "Espacio · Datasets · Cambiar" strip to the
    // chatbox; the composer already shows the active source.
    document.getElementById("assistantSource")?.remove();
    document.getElementById("assistantContextStrip")?.remove();
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

  // ---------------------------------------------------------------- composer
  // The composer is a single bar: the text field, the attachment control, the
  // dictation microphone and the send action share one border, so the mic sits
  // inside the bar instead of beside it.
  const ICONS = {
    attach: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
  };

  function composerButton(className, label, title, icon, onClick) {
    const button = el("button", `composer-btn ${className}`);
    button.type = "button";
    button.innerHTML = icon;
    button.setAttribute("aria-label", label);
    button.title = title;
    button.addEventListener("click", onClick);
    return button;
  }

  function ensureComposer() {
    const host = screen.querySelector(".chat-input");
    if (!host) return null;
    const existing = host.querySelector(".chat-composer");
    if (existing) return existing;
    const bar = el("div", "chat-composer");
    const input = host.querySelector("#chatInput");
    const send = host.querySelector(".round");
    bar.append(composerButton("attach-control", "Subir documentos al agente", "Subir documentos", ICONS.attach, openUpload));
    if (input) bar.append(input);
    const voice = composerButton("voice-control", "Dictar por voz", "Dictar por voz", ICONS.mic, toggleVoiceRecognition);
    voice.setAttribute("aria-pressed", "false");
    bar.append(voice);
    if (send) { send.innerHTML = ICONS.send; send.setAttribute("aria-label", "Enviar consulta"); bar.append(send); }
    host.append(bar);
    return bar;
  }

  // Dictated words are inserted into the composer; the draft stays editable so
  // the transcript can be corrected before sending.
  function voiceSupported() {
    return Boolean(SpeechRecognitionImpl) && window.isSecureContext !== false;
  }

  function setListening(on) {
    listening = on;
    const mic = screen.querySelector(".chat-composer .voice-control");
    if (mic) {
      mic.classList.toggle("listening", on);
      mic.setAttribute("aria-pressed", String(on));
      mic.setAttribute("aria-label", on ? "Detener dictado por voz" : "Dictar por voz");
      mic.title = on ? "Detener dictado" : "Dictar por voz";
    }
    document.getElementById("voiceOrb")?.classList.toggle("listening", on);
    renderStatus();
  }

  function toggleVoiceRecognition() {
    if (listening) { recognition?.stop(); return; }
    if (!voiceSupported()) return;
    if (!recognition) {
      recognition = new SpeechRecognitionImpl();
      recognition.lang = navigator.language || "es-AR";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.onstart = () => setListening(true);
      recognition.onresult = event => {
        let finalText = "", interim = "";
        for (let index = event.resultIndex; index < event.results.length; index++) {
          const result = event.results[index];
          if (result.isFinal) finalText += result[0].transcript;
          else interim += result[0].transcript;
        }
        if (finalText.trim()) voiceBase = `${voiceBase} ${finalText}`.replace(/\s+/g, " ").trim();
        const field = document.getElementById("chatInput");
        if (field) field.value = [voiceBase, interim.trim()].filter(Boolean).join(" ").trim();
      };
      recognition.onerror = event => {
        voiceMessage = ({
          "not-allowed": "Permiso de micrófono denegado.",
          "service-not-allowed": "El navegador bloqueó el dictado por voz.",
          "audio-capture": "No se encontró un micrófono disponible.",
          "no-speech": "No se detectó voz. Probá de nuevo.",
          network: "El servicio de voz no respondió.",
        })[event.error] || "No se pudo iniciar el dictado por voz.";
        setListening(false);
      };
      recognition.onend = () => { setListening(false); document.getElementById("chatInput")?.focus(); };
    }
    voiceMessage = "";
    voiceBase = String(document.getElementById("chatInput")?.value || "").trim();
    try { recognition.start(); }
    catch { /* A start while the engine is already running is ignored. */ }
  }

  // Documents are uploaded to the dataset selected in the composer, reusing the
  // same dialog as the Documentos screen.
  function canUpload() { return Boolean(state.datasetId && (state.workspaceId || isAdmin())); }

  function uploadEndpoint() {
    if (!state.datasetId) return "";
    return state.workspaceId
      ? `/api/workspaces/${encodeURIComponent(state.workspaceId)}/datasets/${encodeURIComponent(state.datasetId)}/documents`
      : `/api/admin/datasets/${encodeURIComponent(state.datasetId)}/documents`;
  }

  async function uploadFile(endpoint, init) {
    const response = await fetch(endpoint, init);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `La carga falló (${response.status}).`);
    return body;
  }

  function openUpload() {
    if (!canUpload()) { state.note = notReadyReason() || "Elegí una fuente antes de subir documentos."; renderAll(); return; }
    openDocumentUpload({
      endpoint: uploadEndpoint(),
      datasetName: currentDataset()?.name || "la fuente seleccionada",
      upload: uploadFile,
      onComplete: () => { voiceMessage = ""; renderStatus("Documentos cargados. Procesalos en Documentos para que el asistente pueda consultarlos."); },
    });
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
    const micButton = screen.querySelector(".chat-composer .voice-control");
    const attachButton = screen.querySelector(".chat-composer .attach-control");
    const reason = notReadyReason();
    const blocked = Boolean(reason) || state.busy;
    if (input) {
      input.disabled = blocked;
      input.placeholder = reason || "Escribí tu consulta al cerebro de NEXO…";
    }
    if (sendButton) sendButton.disabled = blocked;
    if (micButton) {
      micButton.disabled = blocked || !voiceSupported();
      if (!voiceSupported()) { micButton.title = "Dictado por voz no disponible en este navegador"; micButton.setAttribute("aria-label", "Dictado por voz no disponible"); }
    }
    if (attachButton) {
      attachButton.disabled = blocked || !canUpload();
      const uploadable = canUpload();
      attachButton.title = uploadable ? "Subir documentos" : "Elegí una fuente para subir documentos";
      attachButton.setAttribute("aria-label", uploadable ? "Subir documentos al agente" : "Subir documentos, requiere una fuente seleccionada");
    }
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
    if (!status) return;
    if (text) { status.textContent = text; return; }
    if (listening) { status.textContent = "◉  Escuchando…"; return; }
    if (voiceMessage) { status.textContent = voiceMessage; return; }
    status.textContent = notReadyReason() ? "Esperando selección" : "●  Listo para consultar";
  }

  function renderAll() {
    dropShellExtras();
    sourceBar(); ensureComposer(); renderSuggestions(); renderSidePanel(); renderChat(); renderReadyState(); renderStatus();
  }

  // ---------------------------------------------------------------- actions
  async function send(question) {
    const input = document.getElementById("chatInput");
    const text = String(question ?? input?.value ?? "").trim();
    if (!text || state.busy) return;
    if (listening) recognition?.stop();
    voiceMessage = ""; voiceBase = "";
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
    voiceMessage = "";
    syncUrl();
    renderChat(); renderReadyState(); renderStatus();
  }

  // ---------------------------------------------------------------- wiring
  window.renderChat = renderChat;
  window.sendChat = () => void send();
  window.ask = text => { window.go?.("assistant"); void send(text); };
  window.resetChat = reset;
  window.toggleVoice = toggleVoiceRecognition;

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

  window.NexoAssistant = { refresh, send, state, upload: openUpload };

  const start = new URLSearchParams(location.search).get("vista") === "assistant";
  void (start ? refresh() : hydrate().then(renderAll));
})();
