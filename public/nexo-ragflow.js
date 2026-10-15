(() => {
  const $ = id => document.getElementById(id);
  const originalGo = window.go;
  const params = new URLSearchParams(location.search);
  let restoring = false;
  let contextVersion = 0;
  const graphCache = new Map();
  const state = {
    datasetId: params.get("dataset") || "", datasetIds: [], workspaceId: "", assistantId: "",
    projectTab: "summary", datasets: [], datasetsLoaded: false, workspaces: [], assistants: [],
    nodes: [], edges: [], mergedNodes: [], mergedEdges: [], searchMatch: new Set(),
    documentCount: null, workspaceCount: null, eventCount: null, recentEvents: [], activityError: "",
    dashboardStatus: "Iniciá sesión para conectar tu espacio con RAGFlow.",
    showCenterConnections: true, showRelatedConnections: true,
    hiddenKinds: new Set(), searchQuery: "", mode: "merged",
    sharingThreshold: 2, minDegree: 0, paused: false, layout2d: false, rotationSpeed: 1, showLabels: true, maxDatasets: 3, zoom: 1, panX: 0, panY: 0,
    busy: false, chatBusy: false, conversationId: "", screen: "dashboard", user: null, tools: [], mcpUnavailableReason: "", configuredToolCount: 0,
    selectedNode: "",
  };
  // Pending advanced edits; committed only on "Actualizar". Basic options apply live.
  const draft = { threshold: 2, minDegree: 0, layout2d: false, rotation: 1, maxDatasets: 3 };
  function seedDraft() {
    draft.threshold = state.sharingThreshold;
    draft.minDegree = state.minDegree;
    draft.layout2d = state.layout2d;
    draft.rotation = state.rotationSpeed;
    draft.maxDatasets = state.maxDatasets;
  }
  const dashboard = $("brainDashboard");
  const wrap = dashboard?.parentElement;
  if (!wrap || typeof originalGo !== "function") return;

  // Preserve the original centerpiece geometry and palette with authorized graph data.
  dashboard.hidden = true;
  const canvas = document.createElement("canvas");
  canvas.id = "ragflowGraphCanvas";
  canvas.className = dashboard.className;
  canvas.setAttribute("aria-label", "Grafo del dataset RAGFlow seleccionado");
  wrap.appendChild(canvas);
  const brainPanel = document.querySelector(".brain-panel") || wrap;

  const heading = document.querySelector("#screen-dashboard .brain-top");
  const baseBrain = document.querySelector("#screen-dashboard .brain-overlay p");
  if (baseBrain) baseBrain.textContent = "Conocimiento conectado a tus datasets de RAGFlow";

  // ---- Intro banner (replaces the old source-selection row) ----
  const contextControls = document.createElement("div");
  contextControls.className = "panel panel-pad nexo-intro-row";
  contextControls.innerHTML = '<div class="nexo-intro"><h3>Explorá tu conocimiento como un grafo</h3><p id="nexoIntro">NEXO conecta los documentos de tus datasets de RAGFlow y muestra cómo se relacionan por <b>palabras clave</b>, <b>metadatos</b> y <b>fragmentos compartidos</b>. Elegí un espacio en la barra superior, abrí <b>Configurar grafo</b> y seleccioná uno o más datasets para explorar.</p><div class="nexo-context-status"><span id="ragflowDatasetStatus" role="status">Conectando con RAGFlow…</span><button type="button" id="ragflowRetry" hidden>Reintentar conexión</button></div></div>';
  $("screen-dashboard")?.prepend(contextControls);
  const status = $("ragflowDatasetStatus");
  const retry = $("ragflowRetry");

  // Workspace selector lives in the navbar; falls back into the intro row when there is no header.
  const workspaceField = document.createElement("label");
  workspaceField.className = "nexo-header-workspace";
  workspaceField.innerHTML = '<span>Espacio</span> <select id="nexoWorkspace" aria-label="Espacio"><option value="">Seleccionar espacio</option></select>';
  const header = document.querySelector("header") || document.querySelector(".headtools")?.parentElement;
  const headerTools = header?.querySelector?.(".headtools");
  if (header && headerTools) header.insertBefore(workspaceField, headerTools);
  else if (header) header.appendChild(workspaceField);
  else contextControls.appendChild(workspaceField);
  const workspaceSelect = $("nexoWorkspace");

  // ---- Graph config window inside the graph panel ----
  function mountGraphConfig(container) {
    if (!container) return;
    if ($("nexoGraphConfig")) return;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.id = "nexoConfigToggle";
    toggle.className = "nexo-config-toggle";
    toggle.textContent = "⚙ Configurar grafo";
    (heading || container).appendChild(toggle);

    const win = document.createElement("div");
    win.id = "nexoGraphConfig";
    win.className = "nexo-graph-config";
    win.hidden = true;
    win.innerHTML = '<div id="nexoConfigHeader" class="nexo-config-header"><span>Configurar grafo</span><button type="button" id="nexoConfigClose" aria-label="Cerrar">✕</button></div>' +
      '<div id="nexoConfigBody" class="nexo-config-body">' +
      '<div class="cfg-group"><span class="nexo-field-label">Datasets</span><div id="nexoDatasetChips" class="nexo-dataset-chips" role="group" aria-label="Datasets del espacio"></div></div>' +
      '<div class="cfg-group cfg-pair" role="group" aria-label="Conexiones del grafo"><label><input id="ragflowCenterEdges" type="checkbox" checked> Relación con dataset</label><label><input id="ragflowRelatedEdges" type="checkbox" checked> Relaciones entre nodos</label></div>' +
      '<div class="cfg-group"><label>Modo <select id="nexoGraphMode" aria-label="Modo del grafo"><option value="merged">Mezclado</option><option value="per-dataset">Separado</option></select></label><label class="cfg-grow">Buscar <input id="nexoEntitySearch" type="search" placeholder="Entidad…" aria-label="Buscar entidad"></label></div>' +
      '<div class="cfg-group"><span class="nexo-field-label">Tipos de nodo (clic para filtrar)</span><div id="nexoKindFilter" class="nexo-kind-filter"></div></div>' +
      '<div class="cfg-group cfg-pair"><label><input id="nexoLabels" type="checkbox" checked> Etiquetas</label><label><input id="nexoPause" type="checkbox"> Pausa</label></div>' +
      '<div class="cfg-group"><span class="nexo-field-label">Zoom</span><div class="nexo-zoom"><button type="button" id="nexoZoomOut" aria-label="Alejar">−</button><button type="button" id="nexoZoomReset" aria-label="Restablecer vista">100%</button><button type="button" id="nexoZoomIn" aria-label="Acercar">+</button></div></div>' +
      '<details id="nexoAdvanced"><summary>Opciones avanzadas</summary>' +
      '<div class="cfg-advanced">' +
      '<label>Términos en ≥ <input id="nexoShareThreshold" type="number" min="2" value="2"> documentos</label>' +
      '<label>Mín. conexiones <input id="nexoMinDegree" type="number" min="0" value="0"></label>' +
      '<label>Vista <select id="nexoLayout" aria-label="Vista"><option value="3d">3D</option><option value="2d">2D</option></select></label>' +
      '<label>Velocidad <input id="nexoRotation" type="range" min="0" max="3" step="0.5" value="1"></label>' +
      '<label>Máx. datasets <input id="nexoMaxDatasets" type="number" min="1" max="6" value="3"></label>' +
      '</div><div class="cfg-advanced-actions"><button type="button" id="nexoReset">Restablecer</button><button type="button" id="nexoApply">Actualizar</button></div></details>' +
      '</div>';
    container.appendChild(win);

    const openWindow = () => { seedDraft(); renderConfigControls(); renderDatasetChips(); renderKindFilter(); renderZoom(); win.hidden = false; toggle.hidden = true; };
    const closeWindow = () => { win.hidden = true; toggle.hidden = false; };
    toggle.addEventListener("click", openWindow);
    $("nexoConfigClose")?.addEventListener("click", closeWindow);
    $("nexoApply")?.addEventListener("click", () => applyAdvanced());
    $("nexoReset")?.addEventListener("click", () => resetAdvanced());

    const centerEdges = $("ragflowCenterEdges"), relatedEdges = $("ragflowRelatedEdges"), modeSel = $("nexoGraphMode"), searchEl = $("nexoEntitySearch"), labelsEl = $("nexoLabels"), pauseEl = $("nexoPause"), thrEl = $("nexoShareThreshold"), degEl = $("nexoMinDegree"), layoutEl = $("nexoLayout"), rotEl = $("nexoRotation"), maxEl = $("nexoMaxDatasets");
    // Basic options apply live.
    centerEdges?.addEventListener("change", () => { state.showCenterConnections = centerEdges.checked; updateUrl(); });
    relatedEdges?.addEventListener("change", () => { state.showRelatedConnections = relatedEdges.checked; updateUrl(); });
    modeSel?.addEventListener("change", () => { state.mode = modeSel.value === "per-dataset" ? "per-dataset" : "merged"; updateUrl({ push: true }); renderGraph(); });
    searchEl?.addEventListener("input", () => { state.searchQuery = searchEl.value || ""; updateUrl(); renderGraph(); });
    labelsEl?.addEventListener("change", () => { state.showLabels = labelsEl.checked; saveAdvanced(); });
    pauseEl?.addEventListener("change", () => { state.paused = pauseEl.checked; saveAdvanced(); });
    $("nexoZoomOut")?.addEventListener("click", () => { state.zoom = Math.max(0.4, Math.round((state.zoom - 0.2) * 10) / 10); renderZoom(); });
    $("nexoZoomIn")?.addEventListener("click", () => { state.zoom = Math.min(3, Math.round((state.zoom + 0.2) * 10) / 10); renderZoom(); });
    $("nexoZoomReset")?.addEventListener("click", () => { state.zoom = 1; state.panX = 0; state.panY = 0; renderZoom(); });
    // Advanced options are staged in the draft until "Actualizar".
    thrEl?.addEventListener("input", () => { draft.threshold = Math.max(2, Number(thrEl.value) || 2); });
    degEl?.addEventListener("input", () => { draft.minDegree = Math.max(0, Number(degEl.value) || 0); });
    layoutEl?.addEventListener("change", () => { draft.layout2d = layoutEl.value === "2d"; });
    rotEl?.addEventListener("input", () => { draft.rotation = Number(rotEl.value) || 0; });
    maxEl?.addEventListener("input", () => { draft.maxDatasets = Math.min(6, Math.max(1, Number(maxEl.value) || 3)); });

    makeDraggable(win, $("nexoConfigHeader"));
  }
  mountGraphConfig(brainPanel);

  const tooltip = document.createElement("div");
  tooltip.id = "nexoGraphTooltip";
  tooltip.className = "nexo-graph-tooltip";
  tooltip.hidden = true;
  brainPanel.appendChild(tooltip);
  const nodePanel = document.createElement("div");
  nodePanel.id = "nexoNodePanel";
  nodePanel.className = "nexo-node-panel";
  nodePanel.hidden = true;
  brainPanel.appendChild(nodePanel);

  // ---- Helpers ----
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const idOf = item => String(item.id ?? item.entity_id ?? item.key ?? item.name ?? "");
  const labelOf = item => String(item.name ?? item.label ?? item.entity_name ?? item.title ?? idOf(item) ?? "Entidad");
  const detailOf = item => String(item.description ?? item.content ?? item.summary ?? item.entity_type ?? item.type ?? "Sin detalles adicionales.");
  const KIND_LABELS = { dataset: "Datasets", document: "Documentos", keyword: "Palabras clave", metadata: "Metadatos", chunk: "Términos", concept: "Conceptos" };
  const KIND_COLORS = { dataset: "#e7a454", document: "#bed17a", keyword: "#60ba9f", metadata: "#5bc0eb", chunk: "#b394df", concept: "#e776b8" };
  const EDGE_COLORS = { membership: "#7c8f88", keyword: "#e7a454", metadata: "#5bc0eb", chunk: "#b394df", "shared-document": "#bed17a", relation: "#8fa39a" };
  const BRIDGE_COLOR = "#f1c40f";
  function rgba(hex, alpha) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`; }
  function stablePoint(id) {
    let hash = 2166136261;
    for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    const value = hash >>> 0;
    const y = 1 - 2 * ((value & 0xffffff) / 0xffffff);
    const angle = ((value >>> 8) / 0x1000000) * Math.PI * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    return { x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius };
  }
  async function getJson(path, init) {
    const response = await fetch(path, init);
    const payload = await response.json();
    if (!response.ok) {
      if (response.status === 401) { resetKnowledge(); state.user = null; state.datasets = []; clearGraph("Sesión vencida. Iniciá sesión nuevamente."); }
      throw new Error(payload.error || `Error de conexión (${response.status}).`);
    }
    return payload;
  }
  function optionsFor(control, items, label, value) {
    control.replaceChildren(new Option(label, ""), ...items.map(item => new Option(item.name, item.id)));
    control.value = value;
  }
  function workspaceUrl(area, workspaceId = state.workspaceId) {
    const url = new URL("/nexo-prototipo.html", location.origin);
    url.searchParams.set("vista", area === "home" ? "dashboard" : area);
    url.searchParams.set("area", area);
    if (workspaceId) url.searchParams.set("workspaceId", workspaceId);
    if (state.datasetId) url.searchParams.set("dataset", state.datasetId);
    return url.pathname + url.search;
  }
  function selectedDatasetIds() {
    return state.datasetIds.length ? state.datasetIds : (state.datasetId ? [state.datasetId] : []);
  }
  function primaryDatasetName() {
    return state.datasets.find(d => d.id === state.datasetId)?.name || state.datasetId;
  }

  // ---- Advanced option persistence ----
  const ADV_DEFAULTS = { sharingThreshold: 2, minDegree: 0, paused: false, layout2d: false, rotationSpeed: 1, showLabels: true, maxDatasets: 3 };
  function advKey(userId) { return `nexo:graph-adv:${userId}`; }
  function saveAdvanced() {
    if (!state.user) return;
    try {
      const store = globalThis.localStorage;
      if (!store) return;
      store.setItem(advKey(state.user.id), JSON.stringify({ sharingThreshold: state.sharingThreshold, minDegree: state.minDegree, paused: state.paused, layout2d: state.layout2d, rotationSpeed: state.rotationSpeed, showLabels: state.showLabels, maxDatasets: state.maxDatasets }));
    } catch { /* storage unavailable */ }
  }
  function loadAdvanced() {
    if (!state.user) return;
    try {
      const store = globalThis.localStorage;
      if (!store) return;
      const raw = store.getItem(advKey(state.user.id));
      if (raw) Object.assign(state, ADV_DEFAULTS, JSON.parse(raw));
    } catch { /* ignore malformed storage */ }
  }
  function resetAdvanced() {
    Object.assign(state, ADV_DEFAULTS);
    saveAdvanced();
    syncConfig();
    renderGraph();
  }
  function renderConfigControls() {
    const set = (id, value) => { const el = $(id); if (el) el.value = value; };
    const check = (id, value) => { const el = $(id); if (el) el.checked = value; };
    // Basic options reflect live state.
    set("nexoGraphMode", state.mode === "per-dataset" ? "per-dataset" : "merged");
    set("nexoEntitySearch", state.searchQuery);
    check("ragflowCenterEdges", state.showCenterConnections);
    check("ragflowRelatedEdges", state.showRelatedConnections);
    check("nexoLabels", state.showLabels);
    check("nexoPause", state.paused);
    // Advanced options reflect the pending draft.
    set("nexoShareThreshold", String(draft.threshold));
    set("nexoMinDegree", String(draft.minDegree));
    set("nexoLayout", draft.layout2d ? "2d" : "3d");
    set("nexoRotation", String(draft.rotation));
    set("nexoMaxDatasets", String(draft.maxDatasets));
  }
  function renderZoom() { const el = $("nexoZoomReset"); if (el) el.textContent = `${Math.round(state.zoom * 100)}%`; }
  function syncConfig() { seedDraft(); renderConfigControls(); }

  // ---- URL reflection (basic options) ----
  function readBasicFromUrl() {
    const p = new URLSearchParams(location.search);
    state.mode = p.get("mode") === "per-dataset" ? "per-dataset" : "merged";
    state.showCenterConnections = p.get("center") !== "0";
    state.showRelatedConnections = p.get("related") !== "0";
    state.hiddenKinds = new Set((p.get("types") || "").split(",").filter(Boolean));
    state.searchQuery = p.get("q") || "";
  }

  function resetKnowledge() {
    contextVersion++; state.datasetId = ""; state.datasetIds = []; state.conversationId = ""; chatLog = [];
    state.nodes = []; state.edges = []; state.mergedNodes = []; state.mergedEdges = []; state.searchMatch = new Set();
    state.documentCount = null; state.datasetsLoaded = false; state.datasets = []; graphCache.clear();
    renderDatasetChips();
    renderChat();
  }

  // ---- Dataset chips (apply immediately) ----
  function renderDatasetChips() {
    const container = $("nexoDatasetChips");
    if (!container) return;
    const selected = new Set(state.datasetIds);
    container.replaceChildren(...state.datasets.map(row => {
      const chip = document.createElement("label");
      chip.className = "nexo-dataset-chip" + (selected.has(row.id) ? " active" : "");
      chip.innerHTML = `<input type="checkbox" value="${escapeHtml(row.id)}"${selected.has(row.id) ? " checked" : ""}><span>${escapeHtml(row.name)}</span>`;
      chip.addEventListener("click", () => {
        const next = selected.has(row.id) ? state.datasetIds.filter(id => id !== row.id) : [...state.datasetIds, row.id];
        selectDatasets(next);
      });
      return chip;
    }));
  }
  function selectDatasets(ids) {
    const unique = [...new Set(ids)].filter(id => state.datasets.some(d => d.id === id));
    if (unique.length > state.maxDatasets) {
      if (status) status.textContent = `Máximo ${state.maxDatasets} datasets a la vez. Desmarcá uno antes de agregar otro.`;
      renderDatasetChips();
      return false;
    }
    state.datasetIds = unique;
    state.datasetId = unique[0] || "";
    state.conversationId = ""; if (typeof chatLog !== "undefined") chatLog = [];
    if (typeof renderChat === "function") renderChat();
    updateUrl({ push: true });
    renderDatasetChips();
    loadGraphs();
    return true;
  }
  function applyAdvanced() {
    state.sharingThreshold = draft.threshold;
    state.minDegree = draft.minDegree;
    state.layout2d = draft.layout2d;
    state.rotationSpeed = draft.rotation;
    state.maxDatasets = draft.maxDatasets;
    saveAdvanced();
    renderGraph();
  }
  function makeDraggable(win, handle) {
    if (!win || !handle) return;
    handle.addEventListener("mousedown", e => {
      if (e?.target?.id === "nexoConfigClose") return;
      e?.preventDefault?.();
      const startX = e.clientX, startY = e.clientY;
      const startLeft = win.offsetLeft || 0, startTop = win.offsetTop || 0;
      const onMove = ev => {
        win.style.left = `${Math.max(0, startLeft + (ev.clientX - startX))}px`;
        win.style.top = `${Math.max(0, startTop + (ev.clientY - startY))}px`;
      };
      const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  async function loadContext() {
    const requested = new URLSearchParams(location.search);
    resetKnowledge(); const version = contextVersion;
    try {
      const payload = await getJson("/api/workspaces");
      if (version !== contextVersion || !state.user) return;
      state.workspaces = payload.workspaces || [];
      state.workspaceId = state.workspaces.some(w => w.id === requested.get("workspaceId")) ? requested.get("workspaceId") : "";
      optionsFor(workspaceSelect, state.workspaces, "Seleccionar espacio", state.workspaceId);
      const workspace = state.workspaces.find(w => w.id === state.workspaceId);
      const assistants = workspace?.assistants || [];
      state.assistants = assistants;
      state.assistantId = assistants.some(a => a.id === requested.get("assistantId")) ? requested.get("assistantId") : (assistants[0]?.id || "");
      state.datasets = (workspace?.datasets || []).map(d => ({ id: String(d.id ?? d.dataset_id ?? ""), name: String(d.name ?? d.dataset_name ?? "Dataset") })).filter(d => d.id);
      state.datasetsLoaded = true;
      if (!workspace) { state.datasetId = ""; state.datasetIds = []; updateUrl(); clearGraph("Seleccioná un espacio autorizado. Si no tenés ninguno, contactá a tu administrador."); return; }
      const fromUrl = requested.get("dataset");
      state.datasetIds = state.datasets.some(d => d.id === fromUrl) ? [fromUrl] : [];
      state.datasetId = state.datasetIds[0] || "";
      seedDraft();
      renderDatasetChips();
      updateUrl();
      if (!state.datasets.length) { clearGraph("No hay datasets vinculados a este espacio."); return; }
      loadGraphs();
    } catch { if (version === contextVersion) { clearGraph("Espacios no disponibles. Reintentá la conexión."); retry.hidden = false; } }
  }

  workspaceSelect?.addEventListener("change", () => {
    if (window.nexoChangeWorkspace) { window.nexoChangeWorkspace(workspaceSelect.value); return; }
    resetKnowledge(); state.workspaceId = workspaceSelect.value; updateUrl({ push: true }); void loadContext();
  });

  const originalProjectTab = window.setProjectTab;
  window.setProjectTab = function (button, type) { originalProjectTab(button, type); state.projectTab = type; if (!restoring && state.screen === "project") updateUrl({ push: true }); };
  function restoreRoute() {
    const next = new URLSearchParams(location.search);
    const screen = next.get("vista") || "dashboard";
    restoring = true;
    if (projects.some(p => p.name === next.get("project"))) currentProject = next.get("project");
    state.screen = $("screen-" + screen) ? screen : "dashboard";
    originalGo(state.screen);
    if (state.screen === "project") {
      const tabs = ["summary", "activity", "documents", "connections", "team", "finances"];
      const index = Math.max(0, tabs.indexOf(next.get("tab")));
      window.setProjectTab(document.querySelectorAll("#projectTabs button")[index], tabs[index]);
    }
    readBasicFromUrl();
    syncConfig();
    restoring = false;
  }

  const style = document.createElement("style");
  style.textContent = `
    .nexo-intro-row{margin-bottom:14px}
    .nexo-intro h3{margin:0 0 6px;font:700 15px 'Manrope','DM Sans',sans-serif;color:#e9eeeb}
    .nexo-intro p{margin:0;max-width:780px;color:#9aa79c;font-size:11.5px;line-height:1.6}
    .nexo-intro b{color:#c6d78b;font-weight:600}
    .nexo-intro .nexo-context-status{margin-top:8px}
    .nexo-header-workspace{display:inline-flex;align-items:center;gap:6px;margin:0 8px;color:#82928f;font-size:11px}
    .nexo-header-workspace select{height:30px;padding:0 8px;border:1px solid #34403b;border-radius:6px;background:#101719;color:#e9eeeb;font:500 11px 'DM Sans',sans-serif;outline:none}
    .nexo-context-controls{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
    .nexo-context-controls select{height:34px;padding:0 10px;border:1px solid #34403b;border-radius:6px;background:#101719;color:#e9eeeb;font:500 11px 'DM Sans',sans-serif;outline:none}
    .nexo-context-status{display:flex;align-items:center;gap:10px;flex-wrap:wrap;color:#82928f;font-size:11px}
    .nexo-field-label{color:#8d9a89;font-size:9px;font-weight:700;letter-spacing:1.2px;display:block;margin-bottom:4px}
    .nexo-dataset-chips{display:flex;flex-wrap:wrap;gap:6px}
    .nexo-dataset-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid #34403b;border-radius:999px;padding:6px 11px;background:#101719;color:#cbd7cc;font-size:11px;cursor:pointer}
    .nexo-dataset-chip.active{border-color:#bed17a;background:#1b241b}
    .nexo-dataset-chip input{accent-color:#bed17a;margin:0}
    #ragflowGraphCanvas{position:absolute;inset:0;z-index:0;touch-action:none;user-select:none}
    #brainDashboard[hidden]{display:none!important}
    .brain-overlay{z-index:1}
    [hidden]{display:none!important}
    .nexo-graph-config{position:absolute;left:16px;top:70px;z-index:3;width:min(390px,54%);background:#0b1113f7;border:1px solid #2b3a33;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.5)}
    .nexo-config-header{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #24312c;cursor:move;user-select:none}
    .nexo-config-header span{font-weight:700;font-size:11px;color:#e9eeeb;letter-spacing:.3px}
    .nexo-config-header button{background:none;border:0;color:#82928f;cursor:pointer;font-size:14px;line-height:1;padding:2px 6px}
    .nexo-config-header button:hover{color:#e9eeeb}
    .nexo-config-toggle{display:inline-block;margin-top:10px;background:#101719;border:1px solid #34403b;color:#cbd7cc;border-radius:7px;padding:6px 11px;font:500 11px 'DM Sans',sans-serif;cursor:pointer}
    .nexo-config-body{padding:10px;display:grid;gap:9px;max-height:calc(100vh - 290px);overflow:auto}
    .nexo-config-body .cfg-group{display:grid;gap:6px}
    .nexo-config-body .cfg-group.cfg-pair{grid-template-columns:1fr 1fr;align-items:center;column-gap:10px}
    .nexo-config-body .cfg-group.cfg-pair label{min-width:0;white-space:nowrap}
    .nexo-config-body label{display:flex;align-items:center;gap:6px;color:#aab6aa;font-size:10px;font-weight:500;cursor:pointer}
    .nexo-config-body input[type=checkbox]{width:13px;height:13px;accent-color:#bed17a;flex:0 0 auto}
    .nexo-config-body select,.nexo-config-body input[type=search],.nexo-config-body input[type=number],.nexo-config-body input[type=range]{width:100%;height:28px;padding:0 8px;border:1px solid #34403b;border-radius:6px;background:#141b1a;color:#e9eeeb;font:500 10px 'DM Sans',sans-serif}
    .nexo-config-body details{border-top:1px solid #24312c;padding-top:6px}
    .nexo-config-body summary{color:#c6d78b;cursor:pointer;font-size:10px;font-weight:700}
    .cfg-advanced{display:grid;gap:8px;padding:8px 4px 0 0;max-height:140px;overflow-y:auto}
    .cfg-advanced-actions{display:flex;justify-content:flex-end;gap:8px;padding-top:8px}
    .cfg-advanced-actions button{border:1px solid #34403b;background:#141b1a;color:#cbd7cc;border-radius:6px;padding:6px 12px;font-size:11px;cursor:pointer}
    .cfg-advanced-actions #nexoApply{background:#bed17a;border-color:#bed17a;color:#182016;font-weight:700}
    .nexo-zoom{display:flex;gap:6px}
    .nexo-zoom button{flex:1;border:1px solid #34403b;background:#141b1a;color:#cbd7cc;border-radius:6px;padding:5px 0;font-size:11px;cursor:pointer}
    .nexo-zoom #nexoZoomReset{flex:1.4}
    .nexo-kind-filter{display:flex;flex-wrap:wrap;gap:6px}
    .nexo-kind-filter .legend-pill{background:#111a19de;border:1px solid #293b32;border-radius:999px;padding:5px 10px;color:#cbd7cc;font-size:10px;cursor:pointer;display:inline-flex;gap:6px;align-items:center}
    .nexo-kind-filter .legend-pill i{display:inline-block;width:8px;height:8px;border-radius:50%;flex:0 0 auto}
    .nexo-kind-filter .legend-pill b{color:#b4d47e}
    .nexo-kind-filter .legend-pill.off{opacity:.45}
    .nexo-graph-tooltip{position:absolute;z-index:4;background:#0b1113f2;border:1px solid #34403b;border-radius:6px;padding:5px 9px;color:#e9eeeb;font-size:11px;pointer-events:none}
    .nexo-node-panel{position:absolute;right:16px;bottom:52px;z-index:3;width:min(280px,44%);max-height:60%;overflow:auto;background:#0b1113f2;border:1px solid #34403b;border-radius:9px;padding:12px;font-size:11px;color:#cbd7cc}
    .nexo-node-panel b{color:#e9eeeb}
    .nexo-node-panel ul{margin:6px 0 0;padding-left:16px}
    .nexo-node-panel-head{display:flex;justify-content:space-between;align-items:start;gap:8px;margin-bottom:6px}
    @media(max-width:700px){.nexo-graph-config{left:10px;top:70px;width:82%}.nexo-node-panel{right:10px;bottom:46px;width:60%}}
  `;
  document.head.appendChild(style);

  // ---- Merge / filter pipeline ----
  function buildModel() {
    const ids = selectedDatasetIds();
    const perDataset = state.mode === "per-dataset";
    const nodesBySource = new Map();
    const rawEdges = [];
    ids.forEach((datasetId, dsIndex) => {
      const payload = graphCache.get(datasetId);
      if (!payload) return;
      const rows = Array.isArray(payload.nodes) ? payload.nodes : [];
      rows.forEach((item, i) => {
        const rawId = idOf(item) || String(i);
        const sourceId = perDataset ? `ds:${dsIndex}::${rawId}` : rawId;
        let node = nodesBySource.get(sourceId);
        if (!node) {
          node = { sourceId, label: labelOf(item), detail: detailOf(item), kind: String(item.kind ?? item.type ?? "concept"), documentCount: (item.documentCount != null && Number.isFinite(Number(item.documentCount))) ? Number(item.documentCount) : null, datasets: new Set(), bridge: false, ...stablePoint(sourceId) };
          nodesBySource.set(sourceId, node);
        }
        node.datasets.add(dsIndex);
      });
      const rels = Array.isArray(payload.edges) ? payload.edges : [];
      rels.forEach(edge => {
        const src = perDataset ? `ds:${dsIndex}::${String(edge.source ?? edge.from ?? edge.start ?? "")}` : String(edge.source ?? edge.from ?? edge.start ?? "");
        const tgt = perDataset ? `ds:${dsIndex}::${String(edge.target ?? edge.to ?? edge.end ?? "")}` : String(edge.target ?? edge.to ?? edge.end ?? "");
        rawEdges.push({ from: src, to: tgt, label: String(edge.label ?? edge.kind ?? "Relación"), kind: String(edge.kind ?? "relation") });
      });
    });
    const nodes = [...nodesBySource.values()];
    nodes.forEach(node => {
      if (node.datasets.size > 1) node.bridge = true;
      node.datasetIndex = node.datasets.size === 1 ? [...node.datasets][0] : -1;
    });
    const indexBySource = new Map(nodes.map((n, i) => [n.sourceId, i]));
    const edges = rawEdges.map(e => ({ from: indexBySource.get(e.from), to: indexBySource.get(e.to), label: e.label, kind: e.kind })).filter(e => Number.isInteger(e.from) && Number.isInteger(e.to) && e.from !== e.to);
    return { nodes, edges };
  }
  function applyFilters(model) {
    const visible = new Set(model.nodes.map((n, i) => i));
    model.nodes.forEach((n, i) => { if (state.hiddenKinds.has(n.kind)) visible.delete(i); });
    if (state.sharingThreshold > 0) model.nodes.forEach((n, i) => { if (n.documentCount != null && n.documentCount < state.sharingThreshold) visible.delete(i); });
    let edges = model.edges.filter(e => visible.has(e.from) && visible.has(e.to));
    if (state.minDegree > 0) {
      const degree = new Map();
      for (const e of edges) { degree.set(e.from, (degree.get(e.from) || 0) + 1); degree.set(e.to, (degree.get(e.to) || 0) + 1); }
      const removed = new Set();
      for (const i of visible) if ((degree.get(i) || 0) < state.minDegree) removed.add(i);
      for (const i of removed) visible.delete(i);
      edges = edges.filter(e => visible.has(e.from) && visible.has(e.to));
    }
    const nodes = model.nodes.filter((n, i) => visible.has(i)).map((n, i) => ({ ...n, index: i }));
    return { nodes, edges };
  }
  function buildSearchMatch(nodes) {
    const q = state.searchQuery.trim().toLowerCase();
    const set = new Set();
    if (q) nodes.forEach((n, i) => { if (String(n.label).toLowerCase().includes(q) || String(n.detail).toLowerCase().includes(q) || n.kind.includes(q)) set.add(i); });
    return set;
  }
  // Deterministic force-directed layout for the 2D view (computed once per visible node set).
  const layout2d = new Map();
  let layoutKey = "";
  function computeLayout2d(nodes, edges) {
    if (!nodes.length) { layout2d.clear(); layoutKey = ""; return; }
    const key = nodes.map(n => n.sourceId).join("|");
    if (key === layoutKey && nodes.every(n => layout2d.has(n.sourceId))) return;
    layoutKey = key;
    const n = nodes.length;
    const px = new Float64Array(n), py = new Float64Array(n);
    nodes.forEach((node, i) => { const p = stablePoint(node.sourceId); px[i] = p.x; py[i] = p.y; });
    const links = edges.filter(e => Number.isInteger(e.from) && Number.isInteger(e.to) && e.from < n && e.to < n);
    const k = 2 / Math.sqrt(n);
    const iterations = n > 700 ? 45 : n > 300 ? 80 : 140;
    const dispX = new Float64Array(n), dispY = new Float64Array(n);
    let temp = .18;
    for (let it = 0; it < iterations; it++) {
      dispX.fill(0); dispY.fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          let dx = px[i] - px[j], dy = py[i] - py[j];
          let d2 = dx * dx + dy * dy;
          if (d2 < 1e-6) { dx = (((i * 31 + j) % 7) - 3) * .002; dy = (((i * 17 + j) % 5) - 2) * .002; d2 = dx * dx + dy * dy + 1e-9; }
          const d = Math.sqrt(d2);
          const force = (k * k) / d2;
          const fx = (dx / d) * force, fy = (dy / d) * force;
          dispX[i] += fx; dispY[i] += fy; dispX[j] -= fx; dispY[j] -= fy;
        }
      }
      for (const e of links) {
        const dx = px[e.from] - px[e.to], dy = py[e.from] - py[e.to];
        const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
        const force = (d * d) / k;
        const fx = (dx / d) * force, fy = (dy / d) * force;
        dispX[e.from] -= fx; dispY[e.from] -= fy; dispX[e.to] += fx; dispY[e.to] += fy;
      }
      for (let i = 0; i < n; i++) {
        const d = Math.hypot(dispX[i], dispY[i]) || 1e-6;
        const step = Math.min(d, temp);
        px[i] += (dispX[i] / d) * step; py[i] += (dispY[i] / d) * step;
        px[i] *= .992; py[i] *= .992;
      }
      temp *= .975;
    }
    let maxAbs = 1e-6;
    for (let i = 0; i < n; i++) maxAbs = Math.max(maxAbs, Math.abs(px[i]), Math.abs(py[i]));
    nodes.forEach((node, i) => layout2d.set(node.sourceId, { x: px[i] / maxAbs, y: py[i] / maxAbs }));
    const present = new Set(nodes.map(node => node.sourceId));
    for (const stale of [...layout2d.keys()]) if (!present.has(stale)) layout2d.delete(stale);
  }
  function renderKindFilter() {
    const container = $("nexoKindFilter");
    if (!container) return;
    const counts = new Map();
    for (const n of state.mergedNodes) counts.set(n.kind, (counts.get(n.kind) || 0) + 1);
    container.replaceChildren(...[...counts.keys()].sort().map(kind => {
      const pill = document.createElement("button");
      pill.type = "button";
      pill.id = `nexoKind-${kind}`;
      const off = state.hiddenKinds.has(kind);
      pill.className = "legend-pill" + (off ? " off" : "");
      pill.innerHTML = `<i style="background:${KIND_COLORS[kind] || "#cbd7cc"}"></i><span>${escapeHtml(KIND_LABELS[kind] || kind)}</span><b>${counts.get(kind)}</b>`;
      pill.onclick = () => { if (off) state.hiddenKinds.delete(kind); else state.hiddenKinds.add(kind); updateUrl(); renderGraph(); };
      return pill;
    }));
  }
  function renderGraph() {
    const model = buildModel();
    state.mergedNodes = model.nodes;
    state.mergedEdges = model.edges;
    const view = applyFilters(model);
    state.nodes = view.nodes;
    state.edges = view.edges;
    state.searchMatch = buildSearchMatch(view.nodes);
    if (state.layout2d) computeLayout2d(state.nodes, state.edges);
    if (!state.nodes.length && selectedDatasetIds().length) {
      const noEntities = !model.nodes.length;
      state.documentCount = null;
      state.dashboardStatus = noEntities
        ? (selectedDatasetIds().length === 1 ? "Este dataset todavía no tiene entidades indexadas." : "Estos datasets todavía no tienen entidades indexadas.")
        : "Sin nodos visibles con los filtros actuales. Reactivá algún tipo o ajustá el umbral.";
      if (status) status.textContent = state.dashboardStatus;
      dashboard.hidden = true; canvas.hidden = false;
      if (baseBrain) baseBrain.textContent = noEntities ? state.dashboardStatus : "Sin nodos visibles con los filtros actuales.";
      renderKindFilter();
      renderDashboard();
      return;
    }
    dashboard.hidden = true; canvas.hidden = false;
    const dsCount = selectedDatasetIds().length;
    const docCount = model.nodes.filter(n => n.kind === "document").length;
    const termCount = model.nodes.filter(n => n.kind !== "document" && n.kind !== "dataset").length;
    state.documentCount = docCount || null;
    state.dashboardStatus = `${dsCount} dataset${dsCount === 1 ? "" : "s"} · ${docCount} archivos · ${termCount} conceptos · ${state.edges.length} conexiones · Actualización desconocida`;
    if (baseBrain) baseBrain.textContent = dsCount > 1 ? `Grafo mezclado de ${dsCount} datasets de RAGFlow` : "Grafo de conocimiento de RAGFlow";
    if (status) status.textContent = state.dashboardStatus;
    renderKindFilter();
    renderDashboard();
  }
  function clearGraph(message) {
    state.nodes = []; state.edges = []; state.mergedNodes = []; state.mergedEdges = []; state.searchMatch = new Set(); state.documentCount = null; state.dashboardStatus = message;
    if (status) status.textContent = message;
    dashboard.hidden = true; canvas.hidden = false;
    if (baseBrain) baseBrain.textContent = message;
    renderKindFilter();
    renderDashboard();
  }
  function loadGraphs() {
    const ids = selectedDatasetIds();
    if (!ids.length) { clearGraph("Seleccioná un dataset para explorar su grafo."); return; }
    for (const id of ids) if (!graphCache.has(id)) void loadGraph(id);
    renderGraph();
  }
  async function loadGraph(datasetId) {
    const version = contextVersion;
    if (!datasetId) { clearGraph("Seleccioná un dataset para explorar su grafo."); return; }
    if (graphCache.has(datasetId)) { renderGraph(); return; }
    try {
      const payload = await getJson(`/api/datasets/${encodeURIComponent(datasetId)}/graph?workspaceId=${encodeURIComponent(state.workspaceId || "")}`);
      if (version !== contextVersion) return;
      const graph = payload.graph ?? payload.mindMap ?? payload.data?.graph ?? payload.data?.mind_map;
      const rows = Array.isArray(graph) ? graph : graph?.nodes ?? graph?.entities ?? graph?.entity ?? graph?.items ?? [];
      const nodeRows = Array.isArray(rows) ? rows : [];
      const seen = new Set();
      const nodes = nodeRows.map((item, index) => {
        const sourceId = idOf(item) || String(index);
        if (seen.has(sourceId)) return null;
        seen.add(sourceId);
        return { id: sourceId, name: labelOf(item), description: detailOf(item), kind: item.kind, documentCount: Number.isFinite(Number(item.documentCount)) ? Number(item.documentCount) : null };
      }).filter(Boolean);
      const edges = (Array.isArray(graph?.edges ?? graph?.links ?? graph?.relations) ? graph?.edges ?? graph?.links ?? graph?.relations : []).map(edge => ({ source: String(edge.source ?? edge.from ?? edge.start ?? ""), target: String(edge.target ?? edge.to ?? edge.end ?? ""), label: String(edge.label ?? edge.kind ?? "Relación"), kind: String(edge.kind ?? "relation") }));
      graphCache.set(datasetId, { nodes, edges });
      if (selectedDatasetIds().includes(datasetId)) renderGraph();
    } catch (error) {
      if (version !== contextVersion) return;
      graphCache.delete(datasetId);
      const others = selectedDatasetIds().filter(id => id !== datasetId);
      if (others.length && others.some(id => graphCache.has(id))) {
        if (status) status.textContent = error instanceof Error ? `${error.message} · Un dataset falló.` : "No se pudo cargar un dataset.";
        renderGraph();
      } else {
        clearGraph(error instanceof Error ? `${error.message} · Podés volver a intentar.` : "No se pudo cargar el grafo.");
        if (retry) retry.hidden = false;
      }
    }
  }
  retry?.addEventListener("click", () => { void loadContext(); void loadDashboardData(); });

  // ---- Node interactions ----
  let hovered = -1;
  let lastPoints = [];
  let dragging = false, dragMoved = false, dragStart = { x: 0, y: 0, panX: 0, panY: 0 };
  function showTooltip(label, x, y) {
    if (!tooltip) return;
    if (!label) { tooltip.hidden = true; return; }
    tooltip.textContent = label;
    tooltip.hidden = false;
    tooltip.style.left = `${x + 12}px`;
    tooltip.style.top = `${y + 12}px`;
  }
  function selectNode(sourceId) {
    state.selectedNode = sourceId;
    const node = state.mergedNodes.find(n => n.sourceId === sourceId);
    if (!node) { nodePanel.hidden = true; return; }
    nodePanel.hidden = false;
    const connections = state.mergedEdges.filter(e => e.from === node.index || e.to === node.index).slice(0, 20).map(e => {
      const other = state.mergedNodes[e.from === node.index ? e.to : e.from];
      return `<li>${escapeHtml(e.label || "Conexión")}: ${escapeHtml(other?.label || "nodo relacionado")}</li>`;
    }).join("");
    const dsName = node.datasetIndex >= 0 ? (state.datasets[node.datasetIndex]?.name || "Dataset") : "Varios datasets";
    nodePanel.innerHTML = `<div class="nexo-node-panel-head"><b>${escapeHtml(node.label)}</b><button type="button" onclick="document.getElementById('nexoNodePanel').hidden=true">✕</button></div><p>${escapeHtml(node.detail)}</p>${connections ? `<br><b>Conexiones</b><ul>${connections}</ul>` : ""}<br><b>Identificador:</b> ${escapeHtml(node.sourceId)}<br><b>Fuente:</b> ${escapeHtml(dsName)}`;
  }

  const graphCtx = canvas.getContext("2d");
  function resizeCanvas() {
    if (typeof canvas.getBoundingClientRect !== "function") return { width: 0, height: 0 };
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    graphCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { width: rect.width, height: rect.height };
  }
  function nodeColor(node) {
    return KIND_COLORS[node.kind] || "#cbd7cc";
  }
  function animateGraph(time) {
    if (canvas.isConnected) {
      const { width, height } = resizeCanvas();
      graphCtx.clearRect(0, 0, width, height);
      lastPoints = [];
      if (state.nodes.length && width > 0) {
        const scale = Math.min(width / 2.65, height / 2.35) * state.zoom;
        const cx = width * .5 + state.panX, cy = height * .5 + state.panY;
        const angle = state.paused ? 0 : time * .000065 * (state.rotationSpeed || 0);
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const points = state.nodes.map((node, index) => {
          if (state.layout2d) {
            const p = layout2d.get(node.sourceId) || { x: node.x, y: node.y };
            const spread = Math.min(width, height) * .42 * state.zoom;
            return { ...node, index, sx: cx + p.x * spread, sy: cy + p.y * spread, depth: 0 };
          }
          const r = node.kind === "dataset" ? 0.16 : 1;
          const x = (node.x * cos - node.z * sin) * r, z = (node.x * sin + node.z * cos) * r;
          const perspective = 1 + z * .17;
          return { ...node, index, sx: cx + x * scale * perspective, sy: cy + node.y * scale * .91 * r * perspective, depth: z };
        });
        lastPoints = points;
        graphCtx.lineWidth = .8;
        for (const edge of state.edges) {
          if (edge.kind === "membership" ? !state.showCenterConnections : !state.showRelatedConnections) continue;
          const { from, to } = edge;
          const a = points[from], b = points[to];
          if (!a || !b) continue;
          const focus = hovered === from || hovered === to;
          const bridge = a.bridge || b.bridge;
          const alpha = focus ? .95 : bridge ? .7 : (a.kind === "dataset" || b.kind === "dataset") ? .42 : .25 + .22 * ((a.depth + b.depth + 2) / 4);
          graphCtx.strokeStyle = bridge ? rgba(BRIDGE_COLOR, alpha) : rgba(EDGE_COLORS[edge.kind] || "#8fa39a", alpha);
          graphCtx.beginPath(); graphCtx.moveTo(a.sx, a.sy); graphCtx.lineTo(b.sx, b.sy); graphCtx.stroke();
        }
        points.forEach(point => {
          const focus = hovered === point.index;
          const dimmed = state.searchMatch.size && !state.searchMatch.has(point.index);
          const pulse = .5 + .5 * Math.sin(time * .002 + point.index * 1.4);
          const radius = focus ? 5.5 : point.kind === "dataset" ? 7 : point.kind === "document" ? 2.4 + pulse * .7 : point.index % 11 === 0 ? 3.5 : 1.1 + pulse * .9;
          graphCtx.fillStyle = nodeColor(point);
          graphCtx.globalAlpha = dimmed ? .18 : Math.max(.35, (point.depth + 1) / 2);
          graphCtx.shadowColor = graphCtx.fillStyle; graphCtx.shadowBlur = focus ? 13 : point.bridge ? 9 : 5;
          graphCtx.beginPath(); graphCtx.arc(point.sx, point.sy, radius, 0, Math.PI * 2); graphCtx.fill();
          graphCtx.shadowBlur = 0;
          if (point.bridge) { graphCtx.strokeStyle = BRIDGE_COLOR; graphCtx.lineWidth = 1.4; graphCtx.beginPath(); graphCtx.arc(point.sx, point.sy, radius + 2.5, 0, Math.PI * 2); graphCtx.stroke(); graphCtx.lineWidth = .8; }
          graphCtx.globalAlpha = 1;
          if (state.showLabels && (focus || point.kind === "dataset" || point.kind === "document" || point.bridge)) {
            graphCtx.fillStyle = dimmed ? "#5f6c66" : "#cbd7cc";
            graphCtx.font = "9px 'DM Sans',sans-serif";
            graphCtx.fillText(String(point.label).slice(0, 24), point.sx + radius + 3, point.sy + 3);
          }
        });
      }
    }
    requestAnimationFrame(animateGraph);
  }
  function pointerIndex(event) {
    if (typeof canvas.getBoundingClientRect !== "function" || !lastPoints.length) return -1;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    let nearest = -1, distance = 18;
    lastPoints.forEach((point, index) => {
      const d = Math.hypot(x - point.sx, y - point.sy);
      if (d < distance) { distance = d; nearest = index; }
    });
    return nearest;
  }
  canvas.style.cursor = "grab";
  canvas.addEventListener("mousedown", event => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragging = true; dragMoved = false;
    dragStart = { x: event.clientX, y: event.clientY, panX: state.panX, panY: state.panY };
    canvas.style.cursor = "grabbing";
  });
  canvas.addEventListener("mousemove", event => {
    if (dragging) {
      const dx = event.clientX - dragStart.x, dy = event.clientY - dragStart.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
      state.panX = dragStart.panX + dx;
      state.panY = dragStart.panY + dy;
      hovered = -1; showTooltip("");
      return;
    }
    hovered = pointerIndex(event);
    const node = state.nodes[hovered];
    canvas.style.cursor = hovered >= 0 ? "pointer" : "grab";
    const rect = canvas.getBoundingClientRect?.();
    showTooltip(node?.label, event.clientX - (rect?.left || 0), event.clientY - (rect?.top || 0));
  });
  canvas.addEventListener("mouseup", event => {
    if (!dragging) return;
    dragging = false;
    canvas.style.cursor = "grab";
    if (!dragMoved) { hovered = pointerIndex(event); const node = state.nodes[hovered]; if (node) selectNode(node.sourceId); }
  });
  canvas.addEventListener("mouseleave", () => { dragging = false; hovered = -1; showTooltip(""); });
  canvas.addEventListener("wheel", event => { event.preventDefault(); state.zoom = Math.min(3, Math.max(0.4, Math.round((state.zoom + (event.deltaY < 0 ? 0.1 : -0.1)) * 10) / 10)); renderZoom(); }, { passive: false });
  requestAnimationFrame(animateGraph);

  // ---- Dashboard KPIs + summary ----
  function renderDashboard() {
    const cards = document.querySelectorAll("#screen-dashboard .kpi");
    const workspaceName = state.workspaces?.find?.(w => w.id === state.workspaceId)?.name;
    const datasetName = primaryDatasetName();
    const values = [
      ["DATASETS DISPONIBLES", state.datasetsLoaded ? state.datasets.length.toLocaleString("es-AR") : "—", state.user ? "[Cuenta] · Fuentes en RAGFlow" : "Iniciá sesión para consultar"],
      ["DOCUMENTOS CONECTADOS", state.documentCount === null ? "—" : state.documentCount.toLocaleString("es-AR"), state.datasetId ? `[Dataset: ${datasetName || "Seleccionado"}]` : "Seleccioná un dataset"],
      ["ESPACIOS DE TRABAJO", state.workspaceCount === null ? "—" : state.workspaceCount.toLocaleString("es-AR"), "[Cuenta] · Espacios autorizados"],
      ["EVENTOS · 30 DÍAS", state.eventCount === null ? "—" : state.eventCount.toLocaleString("es-AR"), state.workspaceId ? `[Espacio: ${workspaceName || "Activo"}]` : "[Cuenta] · Registro operativo"],
    ];
    cards.forEach((card, index) => {
      const [label, value, caption] = values[index];
      if (!label) return;
      card.querySelector("label").textContent = label;
      card.querySelector("strong").textContent = value;
      card.querySelector("small").textContent = caption;
    });
    const legend = document.querySelector("#screen-dashboard .brain-legend");
    if (legend) {
      const items = [
        ["Datasets", state.datasetsLoaded ? state.datasets.length : "—"],
        ["Documentos", state.documentCount ?? "—"],
        ["Nodos", state.nodes.length || "—"],
        ["Conexiones", state.edges.length || "—"],
      ];
      legend.replaceChildren(...items.map(([label, count]) => {
        const pill = document.createElement("div"); pill.className = "legend-pill";
        const text = document.createElement("span"); text.textContent = label;
        const amount = document.createElement("b"); amount.textContent = String(count);
        pill.append(text, amount); return pill;
      }));
    }
    const activity = document.querySelector("#screen-dashboard #activity");
    if (activity) {
      activity.replaceChildren();
      if (!state.user) activity.textContent = "Iniciá sesión para ver actividad registrada.";
      else if (state.activityError) activity.textContent = state.activityError;
      else if (!state.recentEvents.length) activity.textContent = "Todavía no hay actividad registrada.";
      else state.recentEvents.slice(0, 4).forEach(event => {
        const row = document.createElement("div"); row.className = "activity-row";
        const summary = document.createElement("span"); summary.textContent = event.summary || event.type || "Actividad";
        const time = document.createElement("small"); time.textContent = event.createdAt || "";
        row.append(summary, time); row.tabIndex = 0; row.setAttribute("role", "link"); row.onclick = () => location.assign(workspaceUrl("activity", event.workspaceId)); row.onkeydown = e => { if (e.key === "Enter") row.click(); }; activity.append(row);
      });
    }
    const attention = $("nexoAttention");
    if (attention) {
      attention.replaceChildren();
      const failures = state.recentEvents.filter(event => /\.failed$/.test(event.type || "")).slice(0, 3);
      if (!state.user) attention.textContent = "Iniciá sesión para consultar el estado de tus fuentes.";
      else if (state.activityError) attention.textContent = state.activityError;
      else if (!state.datasetId) attention.textContent = "Seleccioná un dataset para conectar el Centro de Inteligencia.";
      else if (!failures.length) attention.textContent = "No hay operaciones fallidas en la actividad consultada.";
      else failures.forEach(event => {
        const row = document.createElement("button");
        row.className = "notice btn secondary";
        const isDoc = (event.type || "").toLowerCase().includes("document");
        row.textContent = `${event.summary} · ${isDoc ? "Revisar en Documentos →" : "Ver detalle en Actividad →"}`;
        row.onclick = () => window.nexoWorkspaceArea(isDoc ? "knowledge" : "activity");
        attention.append(row);
      });
    }
  }
  renderDashboard();
  async function loadDashboardData() {
    if (!state.user) { renderDashboard(); return; }
    const userId = state.user.id;
    try {
      const [workspaces, report, activity] = await Promise.all([getJson("/api/workspaces"), getJson("/api/reports"), getJson("/api/activity")]);
      if (state.user?.id !== userId) return;
      state.activityError = "";
      state.workspaceCount = Array.isArray(workspaces.workspaces) ? workspaces.workspaces.length : null;
      state.eventCount = typeof report.events === "number" ? report.events : null;
      state.recentEvents = Array.isArray(activity.events) ? activity.events : [];
      if (!Array.isArray(activity.events)) state.activityError = "Actividad no disponible: respuesta incompleta.";
    } catch (error) {
      state.workspaceCount = null; state.eventCount = null; state.recentEvents = []; state.activityError = "Actividad no disponible. Reintentá la conexión.";
      state.dashboardStatus = error instanceof Error ? error.message : "No se pudo cargar el estado operativo.";
    }
    renderDashboard();
  }

  function showSignIn(message = "") {
    let dialog = $("nexoSignInDialog");
    if (!dialog) {
      dialog = document.createElement("dialog"); dialog.id = "nexoSignInDialog"; dialog.style.cssText = "max-width:430px;width:calc(100% - 32px);border:1px solid #394532;border-radius:12px;background:#171b17;color:#e8ece4;padding:24px";
      const title = document.createElement("h2"); title.textContent = "Iniciar sesión";
      const copy = document.createElement("p"); copy.textContent = "Ingresá con la cuenta que te asignó el administrador de NEXO."; copy.style.color = "#9ba493";
      const form = document.createElement("form"); form.style.cssText = "display:grid;gap:12px";
      const email = document.createElement("input"); email.type = "email"; email.name = "email"; email.required = true; email.autocomplete = "username"; email.placeholder = "Email";
      email.setAttribute("aria-label", "Email");
      const password = document.createElement("input"); password.type = "password"; password.name = "password"; password.required = true; password.autocomplete = "current-password"; password.placeholder = "Contraseña"; password.setAttribute("aria-label", "Contraseña");
      for (const input of [email, password]) input.style.cssText = "height:40px;padding:0 10px;border-radius:6px;border:1px solid #394532;background:#101310;color:#e8ece4";
      const error = document.createElement("p"); error.setAttribute("role", "alert"); error.style.color = "#efaa91";
      const actions = document.createElement("div"); actions.style.cssText = "display:flex;justify-content:flex-end;gap:8px";
      const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Cancelar"; cancel.addEventListener("click", () => dialog.close());
      const submit = document.createElement("button"); submit.type = "submit"; submit.textContent = "Entrar";
      for (const item of [cancel, submit]) item.style.cssText = "padding:9px 13px;border:0;border-radius:6px;background:#b6d584;color:#182016;cursor:pointer";
      actions.append(cancel, submit); form.append(email, password, error, actions); dialog.append(title, copy, form); document.body.append(dialog);
      form.addEventListener("submit", async event => {
        event.preventDefault(); submit.disabled = true; error.textContent = "";
        try { const result = await getJson("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.value, password: password.value }) }); state.user = result.user; dialog.close(); window.dispatchEvent(new Event('nexo-session-changed')); }
        catch (err) { error.textContent = err instanceof Error ? err.message : "No se pudo iniciar sesión."; }
        finally { submit.disabled = false; }
      });
    }
    const error = dialog.querySelector('[role="alert"]'); if (error) error.textContent = message;
    dialog.showModal();
  }
  async function signOut() {
    try { await getJson("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); }
    catch { toast("No se pudo cerrar la sesión. Reintentá."); return; }
    resetKnowledge(); state.user = null; state.tools = []; state.datasets = []; state.workspaceCount = null; state.eventCount = null; state.recentEvents = []; mountIdentity(); mountToolControls();
  }
  async function loadApprovedTools() {
    try { const result = await getJson("/api/mcp/tools"); state.tools = Array.isArray(result.tools) ? result.tools : []; state.mcpUnavailableReason = result.reason || ""; state.configuredToolCount = Number(result.configuredToolCount) || 0; }
    catch { state.tools = []; }
    mountToolControls();
  }
  function mountToolControls() {
    const assistant = $("screen-assistant"), layout = assistant?.querySelector(".assistant-layout"); if (!layout) return;
    let panel = $("nexoMcpTools"); if (!panel) { panel = document.createElement("section"); panel.id = "nexoMcpTools"; panel.style.cssText = "grid-column:1/-1;padding:13px;border:1px solid #34403b;border-radius:8px;background:#171b17"; layout.prepend(panel); }
    panel.replaceChildren();
    const title = document.createElement("b"); title.textContent = "Herramientas MCP · Por incorporar";
    const help = document.createElement("p"); help.textContent = "La ejecución de herramientas todavía no está disponible. Las consultas usan únicamente el asistente y dataset seleccionados."; help.style.cssText = "color:#98a292;font-size:11px";
    panel.append(title, help);
    const context = document.createElement("p"); context.textContent = state.datasetId ? `Dataset: ${primaryDatasetName()}` : "Sin dataset seleccionado";
    const change = document.createElement("button"); change.type = "button"; change.textContent = "Seleccionar fuente en el Centro"; change.onclick = () => go("dashboard"); panel.append(context, change);
  }
  async function mountIdentity() {
    const version = contextVersion;
    const navigation = $("navigation"); if (!navigation) return;
    navigation.querySelectorAll("button").forEach(item => { item.hidden = false; });
    try { const result = await getJson('/api/auth/session'); if (version !== contextVersion) return; state.user = result.user; }
    catch { state.user = null; }
    navigation.querySelector("[data-nexo-ops]")?.remove();
    const avatar = document.querySelector(".headtools .avatar"), role = document.querySelector(".headtools .role");
    if (avatar) avatar.textContent = state.user ? state.user.displayName.slice(0, 2).toUpperCase() : "—";
    if (role) role.textContent = state.user ? state.user.displayName : "Sin sesión";
    if (state.user) { loadAdvanced(); syncConfig(); await loadApprovedTools(); if (version !== contextVersion) return; await loadContext(); await loadDashboardData(); }
    else { clearGraph("Iniciá sesión con tu cuenta NEXO para cargar datasets."); renderDashboard(); }
  }
  function updateUrl({ push = false } = {}) {
    const next = new URL(location.href);
    if (state.datasetId) next.searchParams.set("dataset", state.datasetId); else next.searchParams.delete("dataset");
    if (push) { if (state.screen && state.screen !== "dashboard") next.searchParams.set("vista", state.screen); else next.searchParams.delete("vista"); }
    for (const [key, value] of [["workspaceId", state.workspaceId], ["project", state.screen === "project" ? currentProject : ""], ["tab", state.screen === "project" ? state.projectTab : ""]]) { if (value) next.searchParams.set(key, value); else next.searchParams.delete(key); }
    if (state.mode === "per-dataset") next.searchParams.set("mode", "per-dataset"); else next.searchParams.delete("mode");
    next.searchParams.set("center", state.showCenterConnections ? "1" : "0");
    next.searchParams.set("related", state.showRelatedConnections ? "1" : "0");
    if (state.hiddenKinds.size) next.searchParams.set("types", [...state.hiddenKinds].sort().join(",")); else next.searchParams.delete("types");
    if (state.searchQuery) next.searchParams.set("q", state.searchQuery); else next.searchParams.delete("q");
    history[push ? "pushState" : "replaceState"]({}, "", next);
    document.querySelectorAll('[data-nexo-area]').forEach(link => { link.href = workspaceUrl(link.dataset.nexoArea); });
  }
  window.go = function (id) {
    if (!$("screen-" + id)) return;
    const changed = state.screen !== id;
    state.screen = id;
    const wasRestoring = restoring; restoring = true; originalGo(id); restoring = wasRestoring;
    if (!restoring) updateUrl({ push: changed });
    if (id === "assistant") { renderChat(); mountToolControls(); }
  };

  window.renderChat = function () {
    const feed = $("chatFeed");
    if (!feed) return;
    let contextStrip = $("assistantContextStrip");
    if (!contextStrip && feed.parentElement) {
      contextStrip = document.createElement("div");
      contextStrip.id = "assistantContextStrip";
      contextStrip.style.cssText = "padding: 10px 18px; background: #0f1716; border-bottom: 1px solid #212e2a; font-size: 11px; display: flex; align-items: center; justify-content: space-between; color: #8a9b92; flex-shrink: 0";
      feed.parentElement.prepend(contextStrip);
    }
    if (contextStrip) {
      const wName = state.workspaces?.find(w => w.id === state.workspaceId)?.name || "General";
      const dNames = state.datasetIds.length ? state.datasetIds.map(id => state.datasets.find(d => d.id === id)?.name || id).join(", ") : "Sin dataset";
      contextStrip.innerHTML = `<span><b>Espacio:</b> ${escapeHtml(wName)} · <b>Datasets:</b> ${escapeHtml(dNames)}</span><button type="button" class="btn ghost small" style="font-size: 10px; padding: 2px 8px" onclick="go('dashboard')">Cambiar ↗</button>`;
    }
    feed.replaceChildren();
    if (!chatLog.length) chatLog.push({ role: "ai", text: initialMessage.text });
    for (const message of chatLog) {
      const bubble = document.createElement("div");
      bubble.className = `bubble ${message.role === "user" ? "user" : "ai"}`;
      const text = document.createElement("div"); text.className = "nexo-chat-text"; text.textContent = message.text || ""; bubble.appendChild(text);
      if (message.references && !message.references.length) { const note = document.createElement("p"); note.textContent = "Sin evidencia devuelta por RAGFlow. Verificá la respuesta antes de decidir."; bubble.append(note); }
      if (Array.isArray(message.references) && message.references.length) {
        const evidence = document.createElement("div"); evidence.className = "chat-evidence";
        const title = document.createElement("b"); title.textContent = "Evidencia de RAGFlow"; evidence.appendChild(title);
        message.references.filter(reference => reference && typeof reference === "object").forEach((reference, index) => {
          const source = document.createElement("div"); source.className = "chat-doc";
          const name = document.createElement("b"); name.textContent = reference.document_name || reference.doc_name || reference.document || `Fuente ${index + 1}`;
          const quote = document.createElement("small"); quote.textContent = reference.content || reference.text || reference.chunk || "Sin fragmento devuelto.";
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
    if (!state.user || !state.datasets.some(row => row.id === state.datasetId)) { toast("Iniciá sesión y seleccioná un dataset autorizado en el Centro de Inteligencia."); return; }
    if (state.workspaceId && !state.assistantId) { toast("Este espacio no tiene un asistente de RAGFlow vinculado. Contactá a tu administrador."); return; }
    const datasetId = state.datasetId;
    const version = contextVersion;
    let toolInvocations = [];
    const selectedTool = $("nexoMcpTool")?.value;
    if (selectedTool) {
      if (!state.user) { showSignIn("Iniciá sesión para usar herramientas MCP."); return; }
      try { toolInvocations = [{ ...JSON.parse(selectedTool), arguments: JSON.parse($("nexoMcpArguments")?.value || "{}") }]; }
      catch { toast("Revisá que los argumentos de la herramienta tengan formato JSON válido."); return; }
    }
    chatLog.push({ role: "user", text: question }); input.value = ""; state.chatBusy = true;
    if ($("brainStatus")) $("brainStatus").textContent = "Consultando RAGFlow…";
    renderChat();
    try {
      const payload = await getJson(`/api/datasets/${encodeURIComponent(datasetId)}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, conversationId: state.conversationId, toolInvocations, ...(state.workspaceId ? { workspaceId: state.workspaceId, assistantId: state.assistantId } : {}) }) });
      if (state.datasetId !== datasetId || version !== contextVersion) return;
      state.conversationId = payload.conversationId || state.conversationId;
      chatLog.push({ role: "ai", text: payload.answer || "RAGFlow no devolvió una respuesta.", references: Array.isArray(payload.references) ? payload.references : [] });
      if ($("brainStatus")) $("brainStatus").textContent = payload.references?.length ? "Respuesta con evidencia de RAGFlow" : "Respuesta sin evidencia devuelta";
    } catch (error) {
      if (state.datasetId === datasetId && version === contextVersion) chatLog.push({ role: "ai", text: error instanceof Error ? `No pude completar la consulta: ${error.message}` : "No pude completar la consulta con RAGFlow." });
      if ($("brainStatus")) $("brainStatus").textContent = "RAGFlow no disponible";
    } finally { state.chatBusy = false; renderChat(); }
  };
  window.nexoSignIn = showSignIn;
  window.nexoWorkspaceArea = area => location.assign(workspaceUrl(area));
  window.nexoRefreshContext = async () => { restoreRoute(); await mountIdentity(); };
  window.nexoSuspendContext = () => { contextVersion++; };
  window.addEventListener("nexo-workspaces-changed", () => { if (state.user) void loadContext(); });
  const period = document.querySelector('#screen-dashboard .panel-title .tag'); if (period) period.textContent = 'Fuentes NEXO / RAGFlow';
  window.addEventListener("popstate", () => { restoreRoute(); });
  restoreRoute();
})();
