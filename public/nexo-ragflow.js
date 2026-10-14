(() => {
  const $ = id => document.getElementById(id);
  const originalGo = window.go;
  const params = new URLSearchParams(location.search);
  fetch("/api/config", { headers: { Accept: "application/json" } }).then(response => response.ok ? response.json() : null).then(config => {
    if (!config?.adminUrl) return;
    const navigation = $("navigation");
    if (!navigation || navigation.querySelector('[data-ragflow-admin]')) return;
    const link = document.createElement("a");
    link.dataset.ragflowAdmin = "true";
    link.href = config.adminUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "RAGFlow Admin";
    link.setAttribute("aria-label", "Abrir panel de administración de RAGFlow en una pestaña nueva");
    link.style.cssText = "color:#9aa7a3;padding:12px 11px;text-decoration:none;border-radius:9px;font-size:13px;display:block";
    link.addEventListener("mouseenter", () => { link.style.background = "#15201d"; link.style.color = "#fff"; });
    link.addEventListener("mouseleave", () => { link.style.background = "transparent"; link.style.color = "#9aa7a3"; });
    navigation.appendChild(link);
  }).catch(() => {});
  const state = { datasetId: params.get("dataset") || "", datasets: [], nodes: [], edges: [], showCenterConnections: true, showRelatedConnections: true, busy: false, chatBusy: false, conversationId: "", screen: params.get("vista") || "dashboard" };
  const dashboard = $("brainDashboard");
  const wrap = dashboard?.parentElement;
  if (!wrap || typeof originalGo !== "function") return;

  // Replace only the simulated dashboard network. All prototype screens and their styles remain intact.
  dashboard.hidden = true;
  const canvas = document.createElement("canvas");
  canvas.id = "ragflowGraphCanvas";
  canvas.className = dashboard.className;
  canvas.setAttribute("aria-label", "Grafo del dataset RAGFlow seleccionado");
  wrap.appendChild(canvas);

  const heading = document.querySelector("#screen-dashboard .brain-top");
  const sourceControl = document.createElement("div");
  sourceControl.className = "ragflow-source-control";
  sourceControl.innerHTML = '<label for="ragflowDataset">FUENTE DE CONOCIMIENTO</label><select id="ragflowDataset"><option value="">Cargando datasets…</option></select><div class="ragflow-edge-toggles" role="group" aria-label="Filtrar conexiones del grafo"><label><input id="ragflowCenterEdges" type="checkbox" checked> Centro ↔ archivos</label><label><input id="ragflowRelatedEdges" type="checkbox" checked> Conexiones entre nodos</label></div><span id="ragflowDatasetStatus" role="status">Conectando con RAGFlow…</span><button type="button" id="ragflowRetry" hidden>Reintentar conexión</button>';
  heading?.appendChild(sourceControl);
  const select = $("ragflowDataset");
  const centerEdges = $("ragflowCenterEdges");
  const relatedEdges = $("ragflowRelatedEdges");
  const status = $("ragflowDatasetStatus");
  const retry = $("ragflowRetry");

  const style = document.createElement("style");
  style.textContent = `
    .ragflow-source-control{position:absolute;right:22px;top:17px;z-index:3;display:grid;gap:5px;width:min(250px,42%)}
    .ragflow-source-control label{color:#8d9a89;font-size:9px;font-weight:700;letter-spacing:1.2px}
    .ragflow-source-control select{width:100%;height:34px;padding:0 10px;border:1px solid #34403b;border-radius:6px;background:#101719;color:#e9eeeb;font:500 11px 'DM Sans',sans-serif;outline:none}
    .ragflow-source-control select:focus{border-color:#bed17a;box-shadow:0 0 0 2px #bed17a22}
    .ragflow-edge-toggles{display:grid;grid-template-columns:1fr 1fr;gap:4px 8px}
    .ragflow-edge-toggles label{display:flex;align-items:center;gap:4px;color:#aab6aa;font-size:9px;font-weight:500;letter-spacing:0;cursor:pointer}
    .ragflow-edge-toggles input{width:12px;height:12px;margin:0;accent-color:#bed17a}
    .ragflow-source-control span{min-height:12px;color:#82928f;font-size:9px}
    .ragflow-source-control button{justify-self:start;border:1px solid #34403b;border-radius:5px;background:#141b1a;color:#c6d78b;padding:5px 8px;font:500 9px 'DM Sans',sans-serif;cursor:pointer}
    #ragflowGraphCanvas{position:absolute;inset:0;z-index:0}
    #brainDashboard[hidden]{display:none!important}
    .brain-overlay{z-index:1}
    @media(max-width:700px){.ragflow-source-control{right:12px;top:12px;width:44%}.ragflow-source-control label{font-size:7px}.ragflow-source-control select{height:30px;font-size:9px}.ragflow-source-control span{font-size:8px}}
  `;
  document.head.appendChild(style);

  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const idOf = item => String(item.id ?? item.entity_id ?? item.key ?? item.name ?? "");
  const labelOf = item => String(item.name ?? item.label ?? item.entity_name ?? item.title ?? idOf(item) ?? "Entidad");
  const detailOf = item => String(item.description ?? item.content ?? item.summary ?? item.entity_type ?? item.type ?? "Sin detalles adicionales.");
  function stablePoint(id) {
    let hash = 2166136261;
    for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    const value = hash >>> 0;
    const y = 1 - 2 * ((value & 0xffffff) / 0xffffff);
    const angle = ((value >>> 8) / 0x1000000) * Math.PI * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    return { x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius };
  }
  function listFrom(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.data?.datasets)) return payload.data.datasets;
    if (Array.isArray(payload?.datasets)) return payload.datasets;
    return [];
  }
  async function getJson(path, init) {
    const response = await fetch(path, init);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `Error de conexión (${response.status}).`);
    return payload;
  }
  function updateUrl({ push = false } = {}) {
    const next = new URL(location.href);
    if (state.datasetId) next.searchParams.set("dataset", state.datasetId); else next.searchParams.delete("dataset");
    if (state.screen && state.screen !== "dashboard") next.searchParams.set("vista", state.screen); else next.searchParams.delete("vista");
    history[push ? "pushState" : "replaceState"]({}, "", next);
  }
  function isSharedNode(node) { return ["keyword", "metadata", "chunk", "concept"].includes(node.kind); }
  function isNodeVisible(node) { return state.showRelatedConnections || !isSharedNode(node); }
  window.go = function (id) {
    const changed = state.screen !== id;
    state.screen = id;
    originalGo(id);
    updateUrl({ push: changed });
    if (id === "assistant") renderChat();
  };

  const baseBrain = document.querySelector("#screen-dashboard .brain-overlay p");
  if (baseBrain) baseBrain.textContent = "Conocimiento conectado a tu dataset de RAGFlow";
  if (typeof initialMessage !== "undefined") initialMessage.text = "Soy el asistente de NEXO conectado a la fuente seleccionada. Hacé una consulta para explorar su contenido.";

  const graphCtx = canvas.getContext("2d");
  let hovered = -1;
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    graphCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { width: rect.width, height: rect.height };
  }
  function animateGraph(time) {
    if (canvas.isConnected) {
      const { width, height } = resizeCanvas();
      graphCtx.clearRect(0, 0, width, height);
      if (state.nodes.length) {
        const scale = Math.min(width / 2.65, height / 2.35);
        const cx = width * .5, cy = height * .5;
        const angle = time * .000065, cos = Math.cos(angle), sin = Math.sin(angle);
        const points = state.nodes.map((node, index) => {
          const x = node.x * cos - node.z * sin, z = node.x * sin + node.z * cos;
          const perspective = 1 + z * .17;
          return { ...node, index, sx: cx + x * scale * perspective, sy: cy + node.y * scale * .91 * perspective, depth: z };
        });
        graphCtx.lineWidth = .8;
        for (const edge of state.edges) {
          if (edge.kind === "membership" ? !state.showCenterConnections : !state.showRelatedConnections) continue;
          const { from, to } = edge;
          const a = points[from], b = points[to];
          if (!a || !b) continue;
          const focus = hovered === from || hovered === to;
          const alpha = focus ? .9 : (a.kind === "dataset" || b.kind === "dataset") ? .42 : .25 + .22 * ((a.depth + b.depth + 2) / 4);
          graphCtx.strokeStyle = edge.kind === "metadata" ? `rgba(104,190,181,${alpha})` : edge.kind === "keyword" ? `rgba(237,159,70,${alpha})` : (from + to) % 5 === 0 ? `rgba(237,159,70,${alpha})` : `rgba(177,207,108,${alpha})`;
          graphCtx.beginPath(); graphCtx.moveTo(a.sx, a.sy); graphCtx.lineTo(b.sx, b.sy); graphCtx.stroke();
        }
        points.forEach(point => {
          if (!isNodeVisible(point)) return;
          const focus = hovered === point.index;
          const pulse = .5 + .5 * Math.sin(time * .002 + point.index * 1.4);
          const radius = focus ? 5.5 : point.kind === "dataset" ? 7 : point.kind === "document" ? 2.4 + pulse * .7 : point.index % 11 === 0 ? 3.5 : 1.1 + pulse * .9;
          graphCtx.fillStyle = point.kind === "dataset" ? "#f1a550" : point.kind === "document" ? "#a9cd71" : point.kind === "metadata" ? "#68beb5" : point.kind === "keyword" ? "#eba34e" : "#b394df";
          graphCtx.globalAlpha = Math.max(.35, (point.depth + 1) / 2);
          graphCtx.shadowColor = graphCtx.fillStyle; graphCtx.shadowBlur = focus ? 13 : 5;
          graphCtx.beginPath(); graphCtx.arc(point.sx, point.sy, radius, 0, Math.PI * 2); graphCtx.fill();
          graphCtx.shadowBlur = 0; graphCtx.globalAlpha = 1;
        });
      }
    }
    requestAnimationFrame(animateGraph);
  }
  function pointerIndex(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    let nearest = -1, distance = 18;
    const scale = Math.min(rect.width / 2.65, rect.height / 2.35), cx = rect.width * .5, cy = rect.height * .5;
    const angle = performance.now() * .000065, cos = Math.cos(angle), sin = Math.sin(angle);
    state.nodes.forEach((node, index) => {
      if (!isNodeVisible(node)) return;
      const nx = node.x * cos - node.z * sin, nz = node.x * sin + node.z * cos, perspective = 1 + nz * .17;
      const dx = x - (cx + nx * scale * perspective), dy = y - (cy + node.y * scale * .91 * perspective);
      const d = Math.hypot(dx, dy);
      if (d < distance) { distance = d; nearest = index; }
    });
    return nearest;
  }
  canvas.addEventListener("mousemove", event => { hovered = pointerIndex(event); canvas.style.cursor = hovered >= 0 ? "pointer" : "default"; });
  canvas.addEventListener("mouseleave", () => { hovered = -1; });
  canvas.addEventListener("click", () => {
    const node = state.nodes[hovered];
    if (!node) return;
    const connections = state.edges.filter(edge => edge.from === hovered || edge.to === hovered).slice(0, 20).map(edge => {
      const other = state.nodes[edge.from === hovered ? edge.to : edge.from];
      return `<li>${escapeHtml(edge.label || "Conexión")}: ${escapeHtml(other?.label || "nodo relacionado")}</li>`;
    }).join("");
    if (typeof openModal === "function") openModal(escapeHtml(node.label), `<p>${escapeHtml(node.detail)}</p>${connections ? `<br><b>Conexiones</b><ul>${connections}</ul>` : ""}<br><b>Identificador:</b> ${escapeHtml(node.sourceId)}<br><b>Fuente:</b> ${escapeHtml(select?.selectedOptions?.[0]?.textContent || "Dataset")}`);
  });
  requestAnimationFrame(animateGraph);

  function clearGraph(message) {
    state.nodes = []; state.edges = [];
    if (status) status.textContent = message;
  }
  async function loadGraph(datasetId) {
    clearGraph("Cargando grafo del dataset…");
    if (!datasetId) { clearGraph("Seleccioná un dataset para explorar su grafo."); return; }
    try {
      const payload = await getJson(`/api/datasets/${encodeURIComponent(datasetId)}/graph`);
      if (state.datasetId !== datasetId) return;
      const graph = payload.graph ?? payload.mindMap ?? payload.data?.graph ?? payload.data?.mind_map;
      const rows = Array.isArray(graph) ? graph : graph?.nodes ?? graph?.entities ?? graph?.entity ?? graph?.items ?? [];
      const nodeRows = Array.isArray(rows) ? rows : [];
      const seen = new Set();
      state.nodes = nodeRows.map((item, index) => {
        const sourceId = idOf(item) || String(index);
        if (seen.has(sourceId)) return null;
        seen.add(sourceId);
        return { ...stablePoint(sourceId), ...(Number.isFinite(Number(item.x)) ? { x: Number(item.x) } : {}), ...(Number.isFinite(Number(item.y)) ? { y: Number(item.y) } : {}), ...(Number.isFinite(Number(item.z)) ? { z: Number(item.z) } : {}), sourceId, label: labelOf(item), detail: detailOf(item), kind: item.kind, index };
      }).filter(Boolean);
      const indexById = new Map(state.nodes.map((node, index) => [node.sourceId, index]));
      const relations = graph?.edges ?? graph?.links ?? graph?.relations ?? [];
      state.edges = (Array.isArray(relations) ? relations : []).map(edge => ({ from: indexById.get(String(edge.source ?? edge.from ?? edge.start ?? "")), to: indexById.get(String(edge.target ?? edge.to ?? edge.end ?? "")), label: String(edge.label ?? edge.kind ?? "Relación"), kind: String(edge.kind ?? "relation") })).filter(edge => Number.isInteger(edge.from) && Number.isInteger(edge.to) && edge.from !== edge.to);
      if (!state.nodes.length) clearGraph(payload.message || "Este dataset todavía no tiene entidades indexadas.");
      else if (status) status.textContent = payload.graphType === "chunks"
        ? `${payload.documentCount} archivos · ${payload.conceptCount} conceptos compartidos · ${payload.connectionCount} conexiones`
        : payload.graphType === "documents"
        ? `${Math.max(0, state.nodes.length - 1)} archivos · conexiones = pertenencia al dataset · ${select?.selectedOptions?.[0]?.textContent || "Dataset"}`
        : `${state.nodes.length} entidades · ${state.edges.length} relaciones · ${select?.selectedOptions?.[0]?.textContent || "Dataset"}`;
    } catch (error) {
      if (state.datasetId !== datasetId) return;
      clearGraph(error instanceof Error ? `${error.message} · Podés volver a intentar.` : "No se pudo cargar el grafo.");
    }
  }
  async function loadDatasets() {
    clearGraph("Cargando datasets disponibles…");
    if (retry) retry.hidden = true;
    if (select) { select.disabled = true; select.innerHTML = '<option value="">Cargando datasets…</option>'; }
    try {
      const payload = await getJson("/api/datasets");
      state.datasets = listFrom(payload).map(row => ({ id: String(row.id ?? row.dataset_id ?? ""), name: String(row.name ?? row.title ?? "Dataset sin nombre") })).filter(row => row.id);
      if (!select) return;
      select.innerHTML = '<option value="">Seleccionar dataset</option>' + state.datasets.map(row => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.name)}</option>`).join("");
      select.disabled = false;
      const fromUrl = new URLSearchParams(location.search).get("dataset");
      state.datasetId = state.datasets.some(row => row.id === fromUrl) ? fromUrl : state.datasets[0]?.id || "";
      select.value = state.datasetId;
      updateUrl();
      await loadGraph(state.datasetId);
      if (!state.datasets.length) clearGraph("No hay datasets disponibles en RAGFlow.");
    } catch (error) {
      if (select) { select.disabled = true; select.innerHTML = '<option value="">RAGFlow no disponible</option>'; }
      const reason = error instanceof Error ? error.message : "No se pudieron cargar los datasets.";
      clearGraph(reason.includes("no está configurado") ? "Configurá el acceso seguro con npm run configure y volvé a intentar." : `${reason} · Verificá la conexión y reintentá.`);
      if (retry) retry.hidden = false;
    }
  }
  retry?.addEventListener("click", () => { void loadDatasets(); });
  centerEdges?.addEventListener("change", () => { state.showCenterConnections = centerEdges.checked; });
  relatedEdges?.addEventListener("change", () => { state.showRelatedConnections = relatedEdges.checked; });
  select?.addEventListener("change", () => {
    state.datasetId = select.value;
    state.conversationId = "";
    if (typeof chatLog !== "undefined") chatLog = [];
    if (typeof renderChat === "function") renderChat();
    updateUrl({ push: true });
    void loadGraph(state.datasetId);
  });

  window.renderChat = function () {
    const feed = $("chatFeed");
    if (!feed) return;
    feed.replaceChildren();
    if (!chatLog.length) chatLog.push({ role: "ai", text: initialMessage.text });
    for (const message of chatLog) {
      const bubble = document.createElement("div");
      bubble.className = `bubble ${message.role === "user" ? "user" : "ai"}`;
      const text = document.createElement("div"); text.className = "nexo-chat-text"; text.textContent = message.text || ""; bubble.appendChild(text);
      if (Array.isArray(message.references) && message.references.length) {
        const evidence = document.createElement("div"); evidence.className = "chat-evidence";
        const title = document.createElement("b"); title.textContent = "Evidencia de RAGFlow"; evidence.appendChild(title);
        message.references.forEach((reference, index) => {
          const source = document.createElement("div"); source.className = "chat-doc";
          const name = document.createElement("b"); name.textContent = reference.document_name || reference.doc_name || reference.document || `Fuente ${index + 1}`;
          const quote = document.createElement("small"); quote.textContent = reference.content || reference.text || reference.chunk || "Fragmento recuperado del dataset seleccionado.";
          source.append(name, quote); evidence.appendChild(source);
        });
        bubble.appendChild(evidence);
      }
      feed.appendChild(bubble);
    }
    feed.scrollTop = feed.scrollHeight;
  };
  window.resetChat = function () { chatLog = []; state.conversationId = ""; renderChat(); };
  window.sendChat = async function () {
    const input = $("chatInput"), question = input?.value?.trim();
    if (!question || state.chatBusy) return;
    if (!state.datasetId) { toast("Seleccioná un dataset en el Centro de Inteligencia antes de consultar."); return; }
    const datasetId = state.datasetId;
    chatLog.push({ role: "user", text: question }); input.value = ""; state.chatBusy = true;
    if ($("brainStatus")) $("brainStatus").textContent = "Consultando RAGFlow…";
    renderChat();
    try {
      const payload = await getJson(`/api/datasets/${encodeURIComponent(datasetId)}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, conversationId: state.conversationId }) });
      if (state.datasetId !== datasetId) return;
      state.conversationId = payload.conversationId || state.conversationId;
      chatLog.push({ role: "ai", text: payload.answer || "RAGFlow no devolvió una respuesta.", references: Array.isArray(payload.references) ? payload.references : [] });
      if ($("brainStatus")) $("brainStatus").textContent = "Respuesta con contexto de RAGFlow";
    } catch (error) {
      if (state.datasetId === datasetId) chatLog.push({ role: "ai", text: error instanceof Error ? `No pude completar la consulta: ${error.message}` : "No pude completar la consulta con RAGFlow." });
      if ($("brainStatus")) $("brainStatus").textContent = "RAGFlow no disponible";
    } finally { state.chatBusy = false; renderChat(); }
  };
  window.addEventListener("popstate", () => {
    const next = new URLSearchParams(location.search);
    const datasetId = next.get("dataset") || "";
    if (datasetId !== state.datasetId && state.datasets.some(row => row.id === datasetId)) {
      state.datasetId = datasetId; if (select) select.value = datasetId; state.conversationId = ""; chatLog = []; void loadGraph(datasetId);
    }
    const screen = next.get("vista") || "dashboard";
    state.screen = screen; originalGo(screen);
  });
  if (state.screen !== "dashboard") originalGo(state.screen);
  void loadDatasets();
})();
