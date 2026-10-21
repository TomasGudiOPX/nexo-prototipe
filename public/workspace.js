import { documentTableMarkup, bindDocumentTable } from './document-table.js';
import { openDocumentUpload } from './document-upload.js';
import { connectionSettings, bindConnectionSettings } from './connection-settings.js';
import { providerLogo } from './provider-icons.js';
import { openProviderModal } from './provider-modal.js';
import { DATA_SOURCE_IDS, dataSourceInfo, sourceLogo } from './data-source-icons.js';
import { openConnectorDetail, openDataSourceForm } from './data-source-modal.js';
import { openFormModal } from './workspace-modals.js';
let app = document.querySelector("#app");
let embedded = false;
let embeddedNavigate = null;
let viewVersion = 0;
export function suspendWorkspaceArea() { viewVersion++; }

export async function mountWorkspaceArea(target, area, navigate) {
  viewVersion++;
  embedded = true;
  embeddedNavigate = navigate;
  app = target;
  state.area = navItems.some(([id]) => id === area) ? area : "workspaces";
  state.workspaceId = new URLSearchParams(location.search).get("workspaceId") || "";
  app.innerHTML = '<div class="empty" role="status">Cargando datos de tu cuenta…</div>';
  await initialize();
}
const navItems = [["home", "Inicio"], ["workspaces", "Espacios de trabajo"], ["knowledge", "Documentos"], ["assistants", "Asistentes"], ["activity", "Actividad"], ["reports", "Reportes"], ["configuration", "Configuración"]];
const requestedArea = new URLSearchParams(location.search).get("area");
const state = { user: null, area: navItems.some(([id]) => id === requestedArea) ? requestedArea : "home", workspaces: [], workspaceId: new URLSearchParams(location.search).get("workspaceId") || "", workspace: null, notice: "" };
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
// Mirror of the server rules in auth.server.ts: the interface hides what the API
// would refuse, while the API remains the authority.
const canManageSite = () => state.user?.role === "site-admin";
const canManageKnowledge = () => state.user?.role === "site-admin" || state.user?.role === "knowledge-manager";
const canMutate = () => Boolean(state.user) && state.user.role !== "auditor";
async function api(path, init = {}) {
  const response = await fetch(path, { ...init, headers: { ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `La solicitud falló (${response.status}).`);
  return body;
}
const post = (path, body) => api(path, { method: "POST", body: JSON.stringify(body) });
function centerReturnUrl() {
  try {
    const candidate = new URL(new URLSearchParams(location.search).get("returnTo") || "/nexo-prototipo.html", location.origin);
    return candidate.origin === location.origin && candidate.pathname === "/nexo-prototipo.html" ? candidate.pathname + candidate.search : "/nexo-prototipo.html";
  } catch { return "/nexo-prototipo.html"; }
}
function updateNavigation() {
  if (embedded) { embeddedNavigate?.(state.area, state.workspaceId); return; }
  const url = new URL(location.href); url.searchParams.set("area", state.area);
  if (state.workspaceId) url.searchParams.set("workspaceId", state.workspaceId); else url.searchParams.delete("workspaceId");
  history.pushState({}, "", url);
}
function frame(area, body) {
  const workspaceControl = state.workspaces.length ? `<label class="workspace-picker">Espacio<select id="workspaceSelect"><option value="">Seleccionar espacio…</option>${state.workspaces.map(w => `<option value="${esc(w.id)}" ${w.id === state.workspaceId ? "selected" : ""}>${esc(w.name)}</option>`).join("")}</select></label>` : "";
  if (!embedded) app.innerHTML = `<div class="shell"><aside><div class="brand">NEXO<small>Inteligencia Constructiva</small></div><a class="button secondary" href="${esc(centerReturnUrl())}">← Volver a NEXO</a><nav aria-label="Main navigation">${navItems.map(([id, label]) => `<button type="button" data-area="${id}" class="${id === area ? "active" : ""}">${label}</button>`).join("")}</nav><div class="side-bottom">RAGFlow remains the source of truth for knowledge and assistants.</div></aside><div class="main"><header class="topbar"><span class="identity">${esc(state.user?.displayName)} · ${esc(state.user?.role)}</span><div class="toolbar">${workspaceControl}<button class="secondary" id="logout">Cerrar sesión</button></div></header><main class="content">${body}</main></div></div>`;
  if (embedded) {
    app.innerHTML = body;
    app.querySelectorAll('button:not(.resource-unbind)').forEach(button => {
      // Section tabs keep their own underline styling; every other button adopts the
      // shell's .btn vocabulary so workspace markup matches the surrounding app.
      if (button.closest('[role="tablist"]') || button.closest('[data-tailwind]')) return;
      button.classList.add('btn');
      if (!button.closest('form') || button.classList.contains('secondary')) button.classList.add('secondary');
    });
    app.querySelectorAll('table').forEach(table => table.classList.add('data-table'));
  }
  app.querySelectorAll("[data-area]").forEach(button => button.addEventListener("click", () => { state.area = button.dataset.area; updateNavigation(); void render(); }));
  app.querySelector("#logout")?.addEventListener("click", async () => { await post("/api/auth/logout", {}); state.user = null; signIn(); });
  app.querySelector("#workspaceSelect")?.addEventListener("change", event => { state.workspaceId = event.currentTarget.value; localStorage.setItem("nexo.workspace", state.workspaceId); state.workspace = state.workspaces.find(w => w.id === state.workspaceId); const url = new URL(location.href); url.searchParams.delete("dataset"); history.replaceState({}, "", url); updateNavigation(); void render(); });
}
function signIn(message = "") {
  app.innerHTML = `<main class="sign-in"><section><div class="brand">NEXO<small>Inteligencia Constructiva</small></div><h1>Iniciar sesión</h1><p class="muted">Usá la cuenta asignada por tu administrador de NEXO.</p><form id="login"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label><p class="error">${esc(message)}</p><button>Iniciar sesión</button></form></section></main>`;
  app.querySelector("#login").addEventListener("submit", async event => { event.preventDefault(); try { await post("/api/auth/login", Object.fromEntries(new FormData(event.currentTarget))); await initialize(); if (embedded) window.dispatchEvent(new Event('nexo-session-changed')); } catch (error) { signIn(error.message); } });
}
function heading(title, subtitle = "") { return `<div class="heading"><div><p class="eyebrow">Espacio NEXO</p><h1>${title}</h1><p class="muted">${subtitle}</p></div></div>`; }
function empty(message) { return `<div class="empty">${esc(message)}</div>`; }
// Section header used across Configuración, mirroring the eyebrow + title rhythm of
// the rest of NEXO. `note` and `extra` are trusted markup built at the call site.
const configHead = (eyebrow, title, note = "", extra = "") => `
  <div class="config-head">
    <div>
      <p class="eyebrow">${esc(eyebrow)}</p>
      <h2>${esc(title)}</h2>
      ${note ? `<p class="muted">${note}</p>` : ""}
    </div>
    ${extra ? `<div class="config-head-side">${extra}</div>` : ""}
  </div>`;
async function homePage() {
  const events = await api(`/api/activity${state.workspaceId ? `?workspaceId=${encodeURIComponent(state.workspaceId)}` : ""}`);
  const report = await api(`/api/reports${state.workspaceId ? `?workspaceId=${encodeURIComponent(state.workspaceId)}` : ""}`);
  return `${heading("Inicio", "A live view of your workspace and connected RAGFlow state.")}<div class="grid"><section class="panel"><span class="muted">Espacios de trabajo</span><div class="stat">${state.workspaces.length}</div></section><section class="panel"><span class="muted">Eventos registrados · 30 días</span><div class="stat">${report.events}</div></section><section class="panel"><span class="muted">RAGFlow usage metrics</span><div class="stat">Unavailable</div><span class="muted">${esc(report.unavailable?.[0] || "No supported usage source is configured.")}</span></section></div><section class="panel"><h2>Recent activity</h2>${events.events.length ? events.events.slice(0, 8).map(event => `<div class="row"><span>${esc(event.summary)}</span><span class="muted">${esc(event.createdAt)}</span></div>`).join("") : empty("No activity has been recorded yet.")}</section>`;
}
async function workspacesPage() {
  const cards = state.workspaces.length ? state.workspaces.map(w => {
    const isActive = w.id === state.workspaceId;
    const canManage = canMutate() && (state.user.role === "site-admin" || w.role === "owner");
    const unbindButton = (kind, item) => canManage
      ? `<button type="button" class="resource-unbind ml-1 rounded px-1 text-[11px] leading-none text-rose-300 hover:bg-rose-300/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300" data-unbind-${kind}="${esc(item.id)}" data-workspace="${esc(w.id)}" title="Desvincular" aria-label="Desvincular ${esc(item.name)}">✕</button>`
      : "";
    const datasetPills = w.datasets.length
      ? w.datasets.map(x => `<span class="inline-flex max-w-full items-center gap-1 rounded-md border border-[#2b3d34] bg-[#192420] px-2 py-1 text-[11px] text-[#d2decb]">▤ ${esc(x.name)}${unbindButton("dataset", x)}</span>`).join("")
      : `<span class="text-[11px] text-[#9aa79e]">Sin fuentes vinculadas</span>`;
    const assistantPills = w.assistants.length
      ? w.assistants.map(x => `<span class="inline-flex max-w-full items-center gap-1 rounded-md border border-[#463560] bg-[#241d31] px-2 py-1 text-[11px] text-[#caa5f7]">◈ ${esc(x.name)}${unbindButton("assistant", x)}</span>`).join("")
      : `<span class="text-[11px] text-[#9aa79e]">Sin asistentes vinculados</span>`;

    return `
      <article class="group flex min-w-0 flex-col justify-between overflow-hidden rounded-xl border bg-gradient-to-br from-[#151d1b] to-[#101614] text-[#e9eeeb] shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[#52634b] hover:shadow-xl hover:shadow-black/20 ${isActive ? "border-[#759a53] shadow-[inset_0_0_0_1px_#759a5340]" : "border-[#2b3832]"}" data-tailwind data-workspace-card data-search="${esc([w.name, w.description, ...w.datasets.map(x => x.name), ...w.assistants.map(x => x.name)].join(" "))}">
        <div class="grid gap-4 p-4 sm:p-[18px]">
          <div class="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 class="mb-1.5 break-words font-display text-lg font-bold leading-snug">${esc(w.name)}</h2>
              <p class="text-xs leading-5 text-[#9aa79e]">${esc(w.description || "Espacio de trabajo operativo")}</p>
            </div>
            <div class="flex shrink-0 flex-col items-end gap-1.5">
              ${isActive ? '<span class="inline-flex items-center gap-1 rounded-full border border-[#4e6d3e] bg-[#243621] px-2.5 py-1 text-[11px] font-semibold text-[#bed17a]">● Espacio activo</span>' : `<button type="button" class="rounded-md border border-[#3b4b41] bg-[#17211d] px-3 py-1.5 text-xs font-semibold text-[#e9eeeb] transition hover:border-[#bed17a] hover:text-[#bed17a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bed17a]" data-select-workspace="${esc(w.id)}">Activar</button>`}
              <span class="inline-flex rounded-full border border-[#2a3834] bg-[#18201e] px-2.5 py-1 text-[11px] font-semibold text-[#95a5a0]">${esc(w.role)}</span>
            </div>
          </div>

          <div class="my-2.5 flex flex-wrap gap-3 border-y border-[#1c2725] py-2.5 text-xs">
            <span class="inline-flex items-center gap-1.5 rounded-lg border border-[#25332e] bg-[#101716] px-2.5 py-1.5 text-[#b5c4b8]" title="Fuentes vinculadas">▤ <b>${w.datasets.length}</b> fuentes</span>
            <span class="inline-flex items-center gap-1.5 rounded-lg border border-[#25332e] bg-[#101716] px-2.5 py-1.5 text-[#b5c4b8]" title="Asistentes vinculados">◈ <b>${w.assistants.length}</b> asistentes</span>
            <span class="inline-flex items-center gap-1.5 rounded-lg border border-[#25332e] bg-[#101716] px-2.5 py-1.5 text-[#b5c4b8]" title="Miembros con acceso">👥 <b>${w.memberCount}</b> miembros</span>
          </div>

          <div class="my-3 grid gap-2">
            <div class="text-[11px] font-semibold uppercase tracking-wide text-[#9aa79e]">Fuentes y asistentes</div>
            <div class="flex flex-wrap gap-1.5">${datasetPills}</div>
            <div class="flex flex-wrap gap-1.5">${assistantPills}</div>
          </div>

          ${canManage ? `
            <details class="mt-2 rounded-lg border border-[#1c2725] bg-[#0c1214] px-3">
              <summary class="cursor-pointer py-2 text-xs font-semibold text-[#bed17a]">⚙ Vincular nuevos recursos ▾</summary>
              <div class="grid gap-3 py-2">
                <div class="flex flex-wrap gap-2">
                  <button type="button" class="rounded-md border border-[#3b4b41] bg-[#17211d] px-3 py-2 text-xs font-semibold text-[#e9eeeb] transition hover:border-[#bed17a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bed17a]" data-create-dataset="${esc(w.id)}">+ Crear fuente en RAGFlow</button>
                </div>
                <div class="grid gap-2">
                  <label class="grid gap-1.5 text-xs text-[#c2cbc1]">Vincular fuente existente
                    <select class="w-full rounded-md border border-[#2b3832] bg-[#101716] px-3 py-2.5 text-sm text-[#e9eeeb] focus:border-[#bed17a] focus:outline-none focus:ring-2 focus:ring-[#bed17a]/20" data-bind="datasets" data-workspace="${esc(w.id)}">
                      <option value="">Cargando catálogo…</option>
                    </select>
                  </label>
                  <label class="grid gap-1.5 text-xs text-[#c2cbc1]">Vincular asistente
                    <select class="w-full rounded-md border border-[#2b3832] bg-[#101716] px-3 py-2.5 text-sm text-[#e9eeeb] focus:border-[#bed17a] focus:outline-none focus:ring-2 focus:ring-[#bed17a]/20" data-bind="assistants" data-workspace="${esc(w.id)}">
                      <option value="">Cargando catálogo…</option>
                    </select>
                  </label>
                  <div class="flex flex-wrap gap-2">
                    <button type="button" class="rounded-md border border-[#3b4b41] bg-[#17211d] px-3 py-2 text-xs font-semibold text-[#e9eeeb] transition hover:border-[#bed17a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bed17a]" data-refresh="${esc(w.id)}">↻ Actualizar catálogo</button>
                  </div>
                </div>
              </div>
            </details>
          ` : ""}

          <details data-lazy-members="${esc(w.id)}" class="mt-3 border-t border-[#202b28] pt-2">
            <summary class="flex cursor-pointer items-center justify-between gap-3 py-2 text-xs font-semibold text-[#d4e8cb]">
              <span>👥 Miembros autorizados (${w.memberCount})</span>
              <span style="font-size: 10px; color: var(--muted)">Gestionar ▾</span>
            </summary>
            <div class="mt-2 grid gap-3">
              ${canMutate() && (state.user.role === "site-admin" || w.role === "owner") ? `
                <form class="flex flex-wrap items-end gap-2" data-add-member="${esc(w.id)}">
                  <label class="grid min-w-[140px] flex-1 gap-1.5 text-xs text-[#c2cbc1]">Agregar miembro por email
                    <input class="w-full rounded-md border border-[#2b3832] bg-[#101716] px-3 py-2 text-sm text-[#e9eeeb] placeholder:text-[#82928f] focus:border-[#bed17a] focus:outline-none focus:ring-2 focus:ring-[#bed17a]/20" type="email" name="email" placeholder="usuario@empresa.com" required>
                  </label>
                  <button type="submit" class="rounded-md border border-[#3b4b41] bg-[#17211d] px-3 py-2 text-xs font-semibold text-[#e9eeeb] transition hover:border-[#bed17a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bed17a]">Agregar</button>
                </form>
              ` : ""}
              <div data-members-list="${esc(w.id)}" class="py-1.5 text-xs text-[#9aa79e]">
                Cargando miembros…
              </div>
            </div>
          </details>
        </div>

        <footer class="flex justify-end border-t border-[#2b3832] bg-[#0c1214] px-4 py-3">
          <button type="button" class="inline-flex items-center gap-2 rounded-md border border-[#3b4b41] bg-[#17211d] px-3 py-2 text-xs font-semibold text-[#e9eeeb] transition hover:border-[#bed17a] hover:text-[#bed17a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bed17a]" data-goto-docs="${esc(w.id)}">Ver documentos <span aria-hidden="true">→</span></button>
        </footer>
      </article>
    `;
  }).join("") : empty("Todavía no hay espacios creados. Creá uno para organizar fuentes y asistentes.");

  return `
    <header data-tailwind class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="mb-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-[#bed17a]">Espacio NEXO</p>
        <h1 class="mb-1 font-display text-[27px] font-semibold leading-tight text-[#e9eeeb]">Espacios de trabajo</h1>
        <p class="max-w-2xl text-sm leading-6 text-[#9aa79e]">Organizá personas, fuentes y asistentes autorizados.</p>
      </div>
      ${canMutate() ? `<button type="button" id="openCreateWorkspaceBtn" class="inline-flex items-center gap-2 rounded-lg border border-[#9ebd75] bg-[#bed17a] px-4 py-2.5 text-sm font-bold text-[#111812] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#cde08f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bed17a]">+ Nuevo espacio</button>` : ""}
    </header>

    ${state.workspaces.length ? `
      <div data-tailwind class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p class="m-0 text-xs text-[#9aa79e]" id="workspaceCount" role="status"><strong class="text-sm text-[#e9eeeb]">${state.workspaces.length}</strong> ${state.workspaces.length === 1 ? "espacio" : "espacios"}</p>
        <label class="grid w-full gap-1.5 sm:max-w-[340px]">
          <span class="sr-only">Buscar espacios de trabajo</span>
          <input class="w-full rounded-md border border-[#2b3832] bg-[#101716] px-3 py-2.5 text-sm text-[#e9eeeb] placeholder:text-[#82928f] focus:border-[#bed17a] focus:outline-none focus:ring-2 focus:ring-[#bed17a]/20" type="search" id="workspaceSearch" placeholder="Buscar por nombre, fuente o asistente…" autocomplete="off">
        </label>
      </div>
      <div data-tailwind class="grid grid-cols-[repeat(auto-fill,minmax(min(330px,100%),1fr))] items-stretch gap-4">${cards}</div>
      <div data-tailwind class="rounded-lg border border-dashed border-[#46534a] px-6 py-7 text-center text-sm leading-6 text-[#9aa79e]" id="workspaceNoResults" role="status" hidden>No encontramos espacios que coincidan con esa búsqueda.</div>
    ` : `<div data-tailwind class="rounded-lg border border-dashed border-[#46534a] px-6 py-9 text-center"><strong class="block text-base font-semibold text-[#e9eeeb]">Todavía no hay espacios de trabajo</strong><p class="mb-0 mt-2 text-sm leading-6 text-[#9aa79e]">Creá uno para reunir personas, fuentes y asistentes en un mismo lugar.</p></div>`}
  `;
}

async function knowledgePage() {
  if (!state.workspace) return `${heading("Documentos", "Consultá documentos de una fuente vinculada a tu espacio.")}${empty("Seleccioná un espacio y vinculá una fuente.")}`;
  const resources = await api(`/api/workspaces/${encodeURIComponent(state.workspaceId)}/resources`);
  if (!resources.datasets.length) return `${heading("Documentos", `Espacio: ${esc(state.workspace.name)}`)}${empty("Este espacio todavía no tiene fuentes vinculadas.")}`;
  const requested = new URLSearchParams(location.search).get("dataset");
  if (requested && !resources.datasets.some(d => d.id === requested)) return `${heading("Documentos")}${empty("La fuente seleccionada no está disponible en este espacio. Seleccioná una fuente autorizada en el Centro.")}`;
  const datasetId = requested || resources.datasets[0].id;
  const result = await api(`/api/workspaces/${encodeURIComponent(state.workspaceId)}/datasets/${encodeURIComponent(datasetId)}/documents`);

  return `
    <div class="heading">
      <div>
        <p class="eyebrow">Espacio NEXO</p>
        <h1>Documentos</h1>
        <p class="muted">Consultá, subí y gestioná los documentos de la fuente seleccionada.</p>
      </div>
      ${canManageKnowledge() && canMutate() ? `
        <div>
          <button type="button" class="btn" id="uploadDoc" data-dataset="${esc(datasetId)}" data-dataset-name="${esc(result.dataset.name)}">↑ Subir documentos</button>
        </div>
      ` : ""}
    </div>
    ${documentTableMarkup({
      documents: result.documents,
      endpoint: `/api/workspaces/${encodeURIComponent(state.workspaceId)}/datasets/${encodeURIComponent(datasetId)}/documents`,
      canManage: canManageKnowledge() && canMutate(),
      pipeline: result.dataset.pipeline,
      datasets: resources.datasets,
      datasetId,
    }, esc)}
  `;
}

async function assistantsPage() {
  if (!state.workspace) return `${heading("Asistentes disponibles", "Directorio de asistentes de tu espacio.")}${empty("Seleccioná un espacio para ver y crear asistentes.")}`;
  const resources = await api(`/api/workspaces/${encodeURIComponent(state.workspaceId)}/resources`);
  const canLink = canMutate() && (state.user.role === "site-admin" || state.workspace.role === "owner");
  const datasets = resources.datasets || [];
  const assistants = resources.assistants || [];
  // The create modal needs the workspace datasets at click time.
  state.assistantDatasets = datasets;

  // "Tus asistentes" is decided by the author recorded in NEXO; every other
  // assistant linked to the workspace was shared by another user (or predates
  // author tracking and has no recorded owner).
  const isMine = a => Boolean(a.ownerId) && a.ownerId === state.user.id;
  const mine = assistants.filter(isMine);
  const shared = assistants.filter(a => !isMine(a));
  const canShare = a => canMutate() && Boolean(a.ownerId) && (isMine(a) || state.user.role === "site-admin");

  const audienceLine = a => {
    if (!isMine(a)) return a.ownerName ? `Compartido por ${esc(a.ownerName)}` : "Sin autor registrado";
    const count = a.sharedWith?.length ?? 0;
    return count ? `Compartido con ${count} ${count === 1 ? "persona" : "personas"}` : "Todavía no lo compartiste";
  };
  const card = a => `
    <article class="assistant-card ${isMine(a) ? "own" : "shared"}">
      <header>
        <span class="assistant-avatar" aria-hidden="true">◈</span>
        <div>
          <h4>${esc(a.name)}</h4>
          <p class="muted">${audienceLine(a)}</p>
        </div>
      </header>
      ${a.datasetNames?.length ? `<p class="assistant-sources"><span class="muted">Fuentes</span>${a.datasetNames.map(name => `<span class="resource-tag">▤ ${esc(name)}</span>`).join("")}</p>` : ""}
      <div class="assistant-card-actions">
        <button type="button" class="btn assistant-primary" data-start-assistant="${esc(a.id)}">Consultar →</button>
        ${canShare(a) ? `<button type="button" class="btn secondary small" data-share-assistant="${esc(a.id)}" data-name="${esc(a.name)}" data-shared-with="${esc((a.sharedWith || []).join(","))}">Compartir</button>` : ""}
        ${canLink ? `<button type="button" class="btn secondary small" data-unbind-assistant="${esc(a.id)}" data-name="${esc(a.name)}">Quitar</button>` : ""}
      </div>
    </article>`;

  const group = (title, tone, rows, emptyText) => `
    <div class="assistant-group">
      <div class="assistant-group-head">
        <h3>${title} <span class="badge ${tone}">${rows.length}</span></h3>
      </div>
      ${rows.length ? `<div class="assistant-cards">${rows.map(card).join("")}</div>` : `<p class="assistant-group-empty muted">${emptyText}</p>`}
    </div>`;

  let linkPanel = "";
  if (canLink) {
    const catalog = await api(`/api/workspaces/${encodeURIComponent(state.workspaceId)}/resources?catalog=1`).catch(() => ({ assistants: [] }));
    const boundIds = new Set(assistants.map(a => a.id));
    const available = (catalog.assistants || []).filter(a => !boundIds.has(a.id));
    linkPanel = `
      <details class="assistant-link">
        <summary>Vincular un asistente existente <span class="badge gray">${available.length}</span></summary>
        ${available.length
          ? `<div class="assistant-link-list">${available.map(a => `
              <div class="row">
                <span>${esc(a.name)}${a.ownerName ? ` <span class="muted">· ${esc(a.ownerName)}</span>` : ""}</span>
                <button type="button" class="btn secondary small" data-bind-assistant="${esc(a.id)}" data-name="${esc(a.name)}">Vincular</button>
              </div>`).join("")}</div>`
          : `<p class="muted">No hay otros asistentes en la instancia.</p>`}
      </details>`;
  }

  return `
    <div class="heading">
      <div>
        <p class="eyebrow">Espacio NEXO</p>
        <h1>Asistentes disponibles</h1>
        <p class="muted">Asistentes de ${esc(state.workspace.name)}: creá los tuyos, compartilos y consultá los que te compartieron.</p>
      </div>
      <div>
        ${canMutate() ? `<button type="button" class="btn" id="openCreateAssistantBtn">+ Nuevo asistente</button>` : ""}
      </div>
    </div>

    <section class="panel assistant-section">
      <div class="assistant-section-head">
        <div>
          <p class="eyebrow">Usar</p>
          <h2>Asistentes del espacio</h2>
        </div>
        <span class="badge gray">${assistants.length} disponibles</span>
      </div>
      ${group("◈ Tus asistentes", "active", mine, "Todavía no creaste asistentes en este espacio.")}
      ${group("⇄ Compartidos con vos", "purple", shared, "Otros usuarios todavía no compartieron asistentes con vos en este espacio.")}
      ${linkPanel}
    </section>
  `;
}

async function activityPage() {
  const result = await api(`/api/activity${state.workspaceId ? `?workspaceId=${encodeURIComponent(state.workspaceId)}` : ""}`);
  const scopeLabel = state.workspace ? `Espacio: ${esc(state.workspace.name)}` : "Cuenta completa";

  function getActivityBadge(rawType) {
    const t = (rawType || "").toLowerCase();
    if (t.includes("dataset") || t.includes("fuente")) return { label: "Fuente", badge: "badge", icon: "▤" };
    if (t.includes("doc") || t.includes("upload") || t.includes("parse")) return { label: "Documento", badge: "badge blue", icon: "📄" };
    if (t.includes("assistant") || t.includes("asistente") || t.includes("chat")) return { label: "Asistente", badge: "badge purple", icon: "◈" };
    if (t.includes("auth") || t.includes("login") || t.includes("seguridad") || t.includes("password")) return { label: "Seguridad", badge: "badge error", icon: "🔒" };
    if (t.includes("workspace") || t.includes("espacio") || t.includes("member")) return { label: "Espacio", badge: "badge orange", icon: "▱" };
    return { label: "General", badge: "badge gray", icon: "◉" };
  }

  function getActivitySummary(type, summary) {
    const translations = {
      "workspace.member.added": "Se agregó un miembro al espacio de trabajo.",
      "workspace.member.removed": "Se eliminó un miembro del espacio de trabajo.",
      "assistant.query.succeeded": "El asistente respondió una consulta.",
      "assistant.query.failed": "Falló una solicitud al asistente.",
      "knowledge.operation.completed": "Se completó una operación de documentos.",
      "knowledge.operation.failed": "Falló una operación de documentos.",
      "workspace.datasets.unbound": "Se desvinculó la fuente.",
      "workspace.assistants.unbound": "Se desvinculó el asistente.",
    };
    if (translations[type]) return translations[type];
    if (type === "workspace.created") return summary.replace(/^Workspace created:\s*/i, "Se creó el espacio de trabajo: ");
    if (type === "workspace.datasets.bound") return summary.replace(/^Dataset linked:\s*/i, "Fuente vinculada: ");
    if (type === "workspace.assistants.bound") return summary.replace(/^Assistant linked:\s*/i, "Asistente vinculado: ");
    return summary;
  }

  return `
    <div class="heading">
      <div>
        <p class="eyebrow">Auditoría Operativa</p>
        <h1>Actividad</h1>
        <p class="muted">Registro de auditoría, trazabilidad y operaciones registradas por NEXO. <span class="badge gray" style="vertical-align: middle; margin-left: 8px;">${esc(scopeLabel)}</span></p>
      </div>
    </div>

    <div class="toolbar" style="margin-bottom: 16px; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
      <div style="display: flex; gap: 10px; flex: 1; max-width: 650px; flex-wrap: wrap;">
        <input type="search" id="activitySearch" placeholder="⌕ Buscar por acción, actor o detalle…" style="flex: 1; min-width: 220px;">
        <select id="activityFilter" style="width: auto; min-width: 180px;">
          <option value="">Todos los tipos de evento</option>
          <option value="dataset">Fuentes</option>
          <option value="doc">Documentos</option>
          <option value="assistant">Asistentes</option>
          <option value="workspace">Espacios de trabajo</option>
          <option value="auth">Seguridad y acceso</option>
        </select>
      </div>
      <div id="activityCount" class="muted" style="font-size: 12px; white-space: nowrap; font-weight: 600;">
        ${result.events.length} eventos registrados
      </div>
    </div>

    <div class="panel" style="padding: 0; overflow: hidden;" id="activityList">
      ${result.events.length ? `
        <div class="table-wrap">
          <table class="data-table" style="margin: 0; width: 100%;">
            <thead>
              <tr>
                <th style="width: 140px;">Ámbito</th>
                <th>Acción / Resumen</th>
                <th style="width: 180px;">Actor</th>
                <th style="width: 170px;">Fecha y hora</th>
                <th style="width: 130px; text-align: right;">Detalle</th>
              </tr>
            </thead>
            <tbody>
              ${result.events.map(e => {
                const rawType = (e.type || "").toLowerCase();
                const badgeInfo = getActivityBadge(rawType);
                const summary = getActivitySummary(e.type, e.summary || "");
                const searchCorpus = `${summary} ${e.detail || ""} ${e.actor || ""} ${rawType} ${e.id || ""}`;
                const payloadStr = JSON.stringify({
                  id: e.id,
                  workspaceId: e.workspaceId,
                  type: e.type,
                  summary,
                  detail: e.detail,
                  actor: e.actor,
                  createdAt: e.createdAt,
                }, null, 2);

                return `
                  <tr class="activity-row-item" data-event-type="${esc(rawType)}" data-event-id="${esc(e.id)}" data-search-content="${esc(searchCorpus)}">
                    <td>
                      <span class="${badgeInfo.badge}">
                        <span>${badgeInfo.icon}</span> ${esc(badgeInfo.label)}
                      </span>
                    </td>
                    <td>
                      <div style="font-weight: 600; color: #edf1e8; margin-bottom: 2px;">${esc(summary)}</div>
                      ${e.detail ? `<div class="muted" style="font-size: 11px; max-width: 500px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${esc(e.detail)}</div>` : ""}
                    </td>
                    <td>
                      <span style="font-size: 12px; color: #c4d0c7;">${esc(e.actor || "Sistema")}</span>
                    </td>
                    <td>
                      <time class="muted" style="font-size: 12px; white-space: nowrap;">${esc(e.createdAt)}</time>
                    </td>
                    <td style="text-align: right;">
                      <button type="button" class="btn secondary small" data-toggle-activity-detail="${esc(e.id)}" style="padding: 4px 8px; font-size: 11px;">
                        Ver detalle ▾
                      </button>
                    </td>
                  </tr>
                  <tr id="activity-detail-${esc(e.id)}" style="display: none; background: #080d0f;">
                    <td colspan="5" style="padding: 14px 20px; border-bottom: 1px solid var(--line);">
                      <div class="activity-detail-box">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                          <div style="display: flex; gap: 12px; align-items: center; font-size: 11px;">
                            <span class="muted">ID: <code>${esc(e.id)}</code></span>
                            ${e.workspaceId ? `<span class="muted">Espacio: <code>${esc(e.workspaceId)}</code></span>` : ""}
                            <span class="muted">Código: <code>${esc(e.type)}</code></span>
                          </div>
                          <button type="button" class="btn secondary small" data-copy-activity="${esc(payloadStr)}" style="padding: 2px 8px; font-size: 10px;">
                            Copiar JSON
                          </button>
                        </div>
                        <pre>${esc(payloadStr)}</pre>
                      </div>
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      ` : empty("Todavía no hay actividad registrada en este ámbito.")}
    </div>
  `;
}

async function reportsPage() {
  const result = await api(`/api/reports${state.workspaceId ? `?workspaceId=${encodeURIComponent(state.workspaceId)}` : ""}`);
  const scopeLabel = state.workspaceId ? "Espacio actual" : "Cuenta completa";
  // Everything inside `demo` is a labelled demonstration: RAGFlow does not expose
  // usage analytics yet. Only `events` and `workspaceCount` are measured.
  const demo = result.demo || { queries: 0, resolvedRate: 0, documentsProcessed: 0, averageResponseSeconds: 0, trend: [], assistants: [], insights: [] };
  const trend = Array.isArray(demo.trend) ? demo.trend : [];
  const peak = Math.max(1, ...trend.map(item => Number(item.value) || 0));
  const chartWidth = 700;
  const chartHeight = 240;
  const chartBottom = 190;
  const chartLeft = 42;
  const chartRight = 18;
  const chartHeightAvailable = 142;
  const chartWidthAvailable = chartWidth - chartLeft - chartRight;
  const trendChart = trend.length ? `<svg viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="Consultas atendidas durante los últimos siete días" style="display:block; width:100%; height:auto; min-height:220px;">
    ${[0, 25, 50, 75, 100].map(percent => {
      const y = chartBottom - (percent / 100 * chartHeightAvailable);
      return `<line x1="${chartLeft}" y1="${y}" x2="${chartWidth - chartRight}" y2="${y}" stroke="#2b3832" stroke-width="1"/><text x="${chartLeft - 8}" y="${y + 4}" fill="#9aa79e" font-size="11" text-anchor="end">${Math.round(peak * percent / 100)}</text>`;
    }).join("")}
    ${trend.map((item, index) => {
      const value = Math.max(0, Number(item.value) || 0);
      const slotWidth = chartWidthAvailable / trend.length;
      const barWidth = Math.min(52, slotWidth * 0.58);
      const x = chartLeft + index * slotWidth + (slotWidth - barWidth) / 2;
      const barHeight = Math.round(value / peak * chartHeightAvailable);
      const y = chartBottom - barHeight;
      return `<g><title>${esc(item.day)}: ${value} consultas</title><rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="5" fill="#a8c86d"/><text x="${x + barWidth / 2}" y="${y - 8}" fill="#edf1e8" font-size="12" font-weight="600" text-anchor="middle">${value}</text><text x="${x + barWidth / 2}" y="${chartBottom + 24}" fill="#9aa79e" font-size="12" text-anchor="middle">${esc(item.day)}</text></g>`;
    }).join("")}
    <line x1="${chartLeft}" y1="${chartBottom}" x2="${chartWidth - chartRight}" y2="${chartBottom}" stroke="#2b3832" stroke-width="1"/>
  </svg>` : '<p class="muted">No hay consultas para mostrar.</p>';
  const demoNote = '<small class="muted">Dato de demostración</small>';
  return `
    ${heading("Reportes", "Seguimiento operativo del uso de conocimiento y asistentes.")}
    ${result.isDemo ? '<div class="report-demo-note">◈ Datos de demostración · Las métricas de uso son ilustrativas y se reemplazarán por analítica real cuando RAGFlow la exponga. Los eventos y los espacios de trabajo sí son medidos.</div>' : ""}
    <section class="grid report-kpis">
      <article class="panel"><span class="muted">Eventos registrados</span><div class="stat">${Number(result.events || 0).toLocaleString("es-AR")}</div><small class="muted">Últimos 30 días · medido</small></article>
      <article class="panel"><span class="muted">Espacios de trabajo</span><div class="stat">${Number(result.workspaceCount || 0).toLocaleString("es-AR")}</div><small class="muted">${esc(scopeLabel)} · medido</small></article>
      <article class="panel"><span class="muted">Consultas atendidas</span><div class="stat">${demo.queries.toLocaleString("es-AR")}</div>${demoNote}</article>
      <article class="panel"><span class="muted">Respuestas útiles</span><div class="stat">${demo.resolvedRate}%</div>${demoNote}</article>
      <article class="panel"><span class="muted">Documentos procesados</span><div class="stat">${demo.documentsProcessed}</div>${demoNote}</article>
      <article class="panel"><span class="muted">Tiempo medio de respuesta</span><div class="stat">${demo.averageResponseSeconds}s</div>${demoNote}</article>
    </section>
    <section class="report-layout">
      <article class="panel">
        <div class="report-section-head"><div><h2>Consultas por día</h2><p class="muted">Últimos 7 días · ${scopeLabel}</p></div><span class="badge gray">Demostración</span></div>
        <div class="report-chart">${trendChart}</div>
      </article>
      <article class="panel report-insights"><div class="report-section-head"><div><h2>Hallazgos</h2><p class="muted">Señales de demostración, no medidas</p></div><span class="badge gray">Demostración</span></div><ul>${demo.insights.map(item => `<li>${esc(item)}</li>`).join("")}</ul></article>
    </section>
    <section class="panel">
      <div class="report-section-head"><div><h2>Asistentes con más actividad</h2><p class="muted">Rendimiento acumulado del período · demostración</p></div><span class="badge gray">Demostración</span></div>
      <div class="table-wrap"><table><thead><tr><th>Asistente</th><th>Consultas</th><th>Respuestas útiles</th><th>Origen</th></tr></thead><tbody>${demo.assistants.map(item => `<tr><td>${esc(item.name)}</td><td>${item.queries.toLocaleString("es-AR")}</td><td>${item.resolvedRate}%</td><td><span class="badge gray">Demostración</span></td></tr>`).join("")}</tbody></table></div>
    </section>
    <details class="panel">
      <summary style="cursor: pointer; font-weight: 600; color: var(--muted, #82928f)">Alcance de las métricas ▾</summary>
      <div style="margin-top: 12px">${result.unavailable.map(item => `<p class="muted" style="margin: 6px 0">• ${esc(item)}</p>`).join("")}</div>
    </details>
  `;
}

const MODEL_TYPE_LABELS = { chat: "Chat", embedding: "Embedding", rerank: "Rerank", asr: "ASR", speech2text: "ASR", tts: "TTS", ocr: "OCR", vision: "Visión" };
const modelTypeLabel = type => MODEL_TYPE_LABELS[type] || type || "—";

function providerCard(factory, configured) {
  const types = (factory.modelTypes || []).map(type => `<span class="chip">${esc(modelTypeLabel(type))}</span>`).join("");
  return `<article class="provider-card" data-provider-name="${esc(factory.name)}">
    <div class="provider-card-head">
      <span class="provider-card-logo">${providerLogo(factory.name, 26)}</span>
      <div class="provider-card-id">
        <h3>${esc(factory.name)}</h3>
        <span class="provider-state${configured ? "" : " provider-state-off"}">${configured ? "Configurado" : "Sin configurar"}</span>
      </div>
    </div>
    <div class="provider-card-types">${types || '<span class="muted">Sin tipos declarados</span>'}</div>
    <button type="button" class="secondary provider-card-open" data-provider-open="${esc(factory.name)}">Ver conexiones</button>
  </article>`;
}

async function providersSection() {
  try {
    const data = await api("/api/admin/providers");
    const factories = data.factories || [];
    const configured = new Set((data.configured || []).filter(row => row.hasInstance).map(row => row.name));
    const models = data.models || [];
    // Configured providers first, mirroring RAGFlow's provider sidebar ordering.
    const ordered = [...factories.filter(f => configured.has(f.name)), ...factories.filter(f => !configured.has(f.name))];
    return `
      <section class="panel provider-panel">
        ${configHead("Modelos", "Proveedores y modelos",
          "Configurá las conexiones a los proveedores de modelos que usa RAGFlow. Los proveedores ya configurados aparecen primero.",
          `<label class="provider-search">Buscar proveedor<input type="search" id="providerSearch" placeholder="Buscar proveedor" autocomplete="off"></label>`)}
        ${ordered.length ? `<div class="provider-grid" id="providerGrid">${ordered.map(factory => providerCard(factory, configured.has(factory.name))).join("")}</div>
          <p class="provider-empty" id="providerGridEmpty" hidden>Ningún proveedor coincide con la búsqueda.</p>`
        : empty("No hay proveedores disponibles en la instancia de RAGFlow conectada.")}
      </section>
      ${models.length ? `<section class="panel provider-panel">
        ${configHead("Habilitados", "Modelos configurados", "Modelos ya habilitados en RAGFlow, por proveedor y conexión.")}
        <div class="table-wrap"><table>
          <thead><tr><th>Proveedor</th><th>Conexión</th><th>Modelo</th><th>Tipo</th></tr></thead>
          <tbody>${models.map(m => `<tr>
            <td><span style="display:inline-flex;align-items:center;gap:8px">${providerLogo(m.factory, 18)}${esc(m.factory)}</span></td>
            <td>${esc(m.instance || "—")}</td>
            <td><b>${esc(m.name)}</b></td>
            <td>${esc(m.type)}</td>
          </tr>`).join("")}</tbody>
        </table></div>
      </section>` : ""}`;
  } catch (error) {
    return `<section class="panel error" role="alert">${esc(error.message)}<div class="toolbar" style="margin-top:12px"><button type="button" class="secondary" data-config-nav="connection">Revisar conexión RAGFlow</button></div></section>`;
  }
}

const CONNECTOR_STATUS = { schedule: "Programada", running: "Sincronizando", success: "Sincronizada", failed: "Con error", cancel: "Cancelada", pending: "Pendiente" };
const connectorStatus = value => CONNECTOR_STATUS[value] || value || "Sin estado";

function sourceCard(sourceId) {
  const info = dataSourceInfo(sourceId);
  return `<article class="provider-card ds-source-card" data-source-name="${esc(`${info.name} ${sourceId}`)}">
    <div class="provider-card-head">
      <span class="provider-card-logo">${sourceLogo(sourceId, 26)}</span>
      <div class="provider-card-id"><h3>${esc(info.name)}</h3></div>
    </div>
    <p class="ds-description">${esc(info.description)}</p>
    <button type="button" class="secondary provider-card-open" data-add-source="${esc(sourceId)}">Agregar</button>
  </article>`;
}

function connectorGroup(sourceId, connectors) {
  const info = dataSourceInfo(sourceId);
  return `<article class="ds-group" data-source-name="${esc(`${info.name} ${sourceId}`)}">
    <header class="ds-group-head">
      <span class="provider-card-logo">${sourceLogo(sourceId, 22)}</span>
      <h4>${esc(info.name)}</h4>
      <span class="muted">${connectors.length} ${connectors.length === 1 ? "conexión" : "conexiones"}</span>
    </header>
    ${connectors.map(connector => `<div class="ds-row">
      <div class="ds-row-id">
        <b>${esc(connector.name || connector.id)}</b>
        <span class="muted">${esc(connectorStatus(connector.status))}${connector.dataset_id ? " · fuente asociada" : ""}</span>
      </div>
      <button type="button" class="secondary" data-open-source="${esc(connector.id)}" data-source-key="${esc(sourceId)}" data-source-label="${esc(connector.name || info.name)}">Administrar</button>
    </div>`).join("")}
  </article>`;
}

async function dataSourcesSection() {
  let data;
  try { data = await api("/api/admin/data-sources"); }
  catch (error) {
    return `<section class="panel error" role="alert">${esc(error.message)}<div class="toolbar" style="margin-top:12px"><button type="button" class="secondary" data-config-nav="connection">Revisar conexión RAGFlow</button></div></section>`;
  }
  if (!data.supported) {
    return `<section class="panel provider-panel">
      ${configHead("Integraciones", "Fuentes de datos", "Conectá sistemas externos (unidades en la nube, wikis, repositorios, bases de datos) para sincronizar su contenido en RAGFlow.")}
      <p class="notice">${esc(data.reason || "La instancia RAGFlow conectada no expone la API de fuentes externas.")}</p>
    </section>`;
  }
  const connectors = data.dataSources?.connectors || data.dataSources || [];
  const groups = new Map();
  for (const connector of connectors) {
    const source = String(connector.source || "unknown");
    if (!groups.has(source)) groups.set(source, []);
    groups.get(source).push(connector);
  }
  return `
    <section class="panel provider-panel">
      ${configHead("Integraciones", "Fuentes de datos",
        "Conectá sistemas externos para sincronizar su contenido en RAGFlow. Las fuentes conectadas aparecen primero.",
        `<label class="provider-search">Buscar fuente<input type="search" id="sourceSearch" placeholder="Buscar fuente" autocomplete="off"></label>`)}
      <h3 class="ds-heading">Fuentes conectadas</h3>
      ${connectors.length ? `<div class="ds-groups" id="sourceGroups">${[...groups.entries()].map(([source, list]) => connectorGroup(source, list)).join("")}</div>`
        : '<p class="provider-empty">Todavía no conectaste ninguna fuente. Elegí una de las fuentes disponibles para empezar.</p>'}
      <h3 class="ds-heading">Fuentes disponibles</h3>
      <div class="provider-grid" id="sourceGrid">${DATA_SOURCE_IDS.map(sourceCard).join("")}</div>
      <p class="provider-empty" id="sourceEmpty" hidden>Ninguna fuente coincide con la búsqueda.</p>
    </section>`;
}

// Configuración sections, in display order. The first entry is the landing tab.
const CONFIG_TABS = [
  ["sources", "Fuentes de datos"],
  ["providers", "Proveedores y modelos"],
  ["users", "Usuarios y administradores"],
  ["connection", "Conexión"],
];

const NEXO_ROLE_OPTIONS = [
  ["user", "Usuario"],
  ["knowledge-manager", "Gestor de conocimiento"],
  ["auditor", "Auditor (solo lectura)"],
  ["site-admin", "Administrador del sitio"],
];
const NEXO_ROLE_TONES = { "site-admin": "purple", "knowledge-manager": "blue", user: "gray", auditor: "orange" };
const NEXO_AREA_OPTIONS = [
  ["", "Sin área"],
  ["gerencia", "Gerencia"],
  ["recursos-humanos", "Recursos Humanos"],
  ["comercial", "Comercial"],
  ["operaciones", "Operaciones"],
  ["tecnica", "Técnica / Obra"],
  ["administracion", "Administración y Finanzas"],
  ["legal", "Legal"],
  ["sistemas", "Sistemas / TI"],
  ["calidad", "Calidad"],
  ["otro", "Otra área"],
];
const roleLabel = role => (NEXO_ROLE_OPTIONS.find(([value]) => value === role) || [role, role])[1];
const areaLabel = area => (NEXO_AREA_OPTIONS.find(([value]) => value === area) || ["", ""])[1];

function userRow(user) {
  const isAdmin = user.role === "site-admin";
  const initials = String(user.displayName || user.email || "U").trim().slice(0, 2).toUpperCase();
  const spaces = user.workspaces || [];
  const owned = spaces.filter(space => space.role === "owner");
  const roleOptions = NEXO_ROLE_OPTIONS.map(([value, label]) => `<option value="${value}" ${user.role === value ? "selected" : ""}>${esc(label)}</option>`).join("");
  const areaOptions = NEXO_AREA_OPTIONS.map(([value, label]) => `<option value="${value}" ${user.area === value ? "selected" : ""}>${esc(label)}</option>`).join("");
  return `<div class="config-row">
    <div class="config-row-id">
      <span class="member-avatar" aria-hidden="true">${esc(initials)}</span>
      <div>
        <b>${esc(user.displayName)}</b>
        <div class="muted">${esc(user.email)}</div>
      </div>
    </div>
    <div class="config-row-tags">
      <span class="badge ${NEXO_ROLE_TONES[user.role] || "gray"}">${esc(roleLabel(user.role))}</span>
      ${user.area ? `<span class="badge gray">${esc(areaLabel(user.area))}</span>` : ""}
      <span class="badge ${user.active ? "active" : "error"}">${user.active ? "Activo" : "Inactivo"}</span>
      <span class="badge ${spaces.length ? "gray" : "orange"}">${spaces.length} ${spaces.length === 1 ? "espacio" : "espacios"}</span>
    </div>
    <div class="config-row-actions">
      <button type="button" class="secondary" data-user-action="workspaces" data-user-id="${esc(user.id)}" data-user-name="${esc(user.displayName || user.email)}" data-workspaces="${esc(spaces.map(space => space.id).join(","))}" data-owned-workspaces="${esc(owned.map(space => space.id).join(","))}">Espacios de trabajo</button>
      <label class="config-inline-select">Rol
        <select data-user-field="role" data-user-id="${esc(user.id)}" aria-label="Rol de ${esc(user.displayName || user.email)}">${roleOptions}</select>
      </label>
      <label class="config-inline-select">Área
        <select data-user-field="area" data-user-id="${esc(user.id)}" aria-label="Área de ${esc(user.displayName || user.email)}">${areaOptions}</select>
      </label>
      <button type="button" class="secondary" data-user-action="active" data-user-id="${esc(user.id)}" data-active="${user.active ? "false" : "true"}">${user.active ? "Desactivar" : "Activar"}</button>
      <button type="button" class="secondary" data-user-action="password" data-user-id="${esc(user.id)}">Restablecer contraseña</button>
    </div>
    <div class="config-row-spaces">
      ${spaces.length
        ? `<span class="muted">Acceso a</span>${spaces.map(space => `<span class="resource-tag">▱ ${esc(space.name)}${space.role === "owner" ? " · propietario" : ""}</span>`).join("")}`
        : `<span class="muted">Sin acceso a ningún espacio de trabajo${isAdmin ? " (igual ve todos por ser administrador del sitio)" : ""}.</span>`}
    </div>
  </div>`;
}

async function configurationPage() {
  if (state.user.role !== "site-admin") return `${heading("Configuración", "La configuración está disponible para administradores.")}${empty("Tu administrador gestiona la conexión y las credenciales.")}`;

  const requestedSub = new URLSearchParams(location.search).get("config") || CONFIG_TABS[0][0];
  // "keys" was retired in favour of "sources"; unknown values fall back to the first tab.
  const configSub = CONFIG_TABS.some(([id]) => id === requestedSub) ? requestedSub : CONFIG_TABS[0][0];

  const subNav = `
    <div class="config-tabs" role="tablist" aria-label="Secciones de configuración">
      ${CONFIG_TABS.map(([id, label]) => `<button type="button" role="tab" aria-selected="${configSub === id}" class="${configSub === id ? "active" : ""}" data-config-nav="${id}">${label}</button>`).join("")}
    </div>
  `;

  let sectionContent = "";

  if (configSub === "connection") {
    const [settings, ragflow] = await Promise.all([
      api("/api/admin/settings/ragflow").catch(error => ({ error: error.message })),
      api("/api/admin/ragflow").catch(() => null),
    ]);
    const apiKeys = ragflow?.capabilities?.apiKeys;
    sectionContent = settings.error
      ? `<section class="panel error">${esc(settings.error)}</section>`
      : connectionSettings(settings, esc, {
          canGenerateKey: Boolean(apiKeys?.generate),
          capabilityReason: ragflow ? apiKeys?.reason : "No se pudo consultar la instancia RAGFlow conectada.",
        });
  } else if (configSub === "providers") {
    sectionContent = await providersSection();
  } else if (configSub === "sources") {
    sectionContent = await dataSourcesSection();
  } else if (configSub === "users") {
    const result = await api("/api/admin/users").catch(error => ({ users: [], workspaces: [], error: error.message }));
    const users = result.users || [];
    // The "Espacios de trabajo" control needs the full list of spaces.
    state.userAdminWorkspaces = result.workspaces || [];
    sectionContent = `
      <section class="panel">
        ${configHead("Acceso", "Crear usuario", "Creá cuentas de NEXO y definí quién administra el sitio. Las contraseñas deben tener al menos 12 caracteres; RAGFlow bloquea las llamadas de dataset hechas por superusuarios, así que las cuentas técnicas conviene mantenerlas como usuarios regulares.")}
        <form id="userForm" class="config-form">
          <label>Nombre
            <input name="displayName" maxlength="100" required>
          </label>
          <label>Email
            <input name="email" type="email" maxlength="254" autocomplete="off" required>
          </label>
          <label>Contraseña
            <input name="password" type="password" minlength="12" maxlength="256" autocomplete="new-password" required>
          </label>
          <label>Rol
            <select name="role">
              ${NEXO_ROLE_OPTIONS.map(([value, label]) => `<option value="${value}">${esc(label)}</option>`).join("")}
            </select>
          </label>
          <label>Área / función
            <select name="area">
              ${NEXO_AREA_OPTIONS.map(([value, label]) => `<option value="${value}">${esc(label)}</option>`).join("")}
            </select>
          </label>
          <div class="config-actions">
            <button type="submit">Crear usuario</button>
            <span id="userMessage" class="config-status" role="status"></span>
          </div>
        </form>
      </section>
      <section class="panel">
        ${configHead("Directorio", "Cuentas existentes", "Desde acá también se define a qué espacios de trabajo puede acceder cada cuenta.", `<span class="badge gray">${users.length} ${users.length === 1 ? "cuenta" : "cuentas"}</span>`)}
        ${result.error ? `<p class="error" role="alert">${esc(result.error)}</p>` : ""}
        ${users.length ? `<div class="config-list">${users.map(userRow).join("")}</div>` : empty("No hay usuarios registrados.")}
      </section>
    `;
  }

  return `
    ${heading("Configuración", "Fuentes de datos, proveedores y modelos, usuarios y la conexión con RAGFlow.")}
    ${subNav}
    ${sectionContent}
  `;
}

async function render() {
  const version = ++viewVersion;
  if (!state.user) return signIn();
  try {
    const views = { home: homePage, workspaces: workspacesPage, knowledge: knowledgePage, assistants: assistantsPage, activity: activityPage, reports: reportsPage, configuration: configurationPage };
    const area = state.area;
    const body = await views[area]();
    if (version !== viewVersion) return;
    frame(area, body);
    bindPageActions();
  } catch (error) {
    if (version !== viewVersion) return;
    frame(state.area, `${heading(navItems.find(([id]) => id === state.area)?.[1] || "NEXO")}<div class="error">${esc(error.message)} <button type="button" class="secondary" id="retry">Reintentar</button></div>`);
    app.querySelector("#retry")?.addEventListener("click", () => void render());
  }
}

function bindPageActions() {
  bindDocumentTable(app, { api, post, esc });
  bindConnectionSettings(app, post, render, esc);

  app.querySelector("#workspaceSearch")?.addEventListener("input", event => {
    const query = event.currentTarget.value.trim().toLocaleLowerCase();
    const cards = [...app.querySelectorAll("[data-workspace-card]")];
    let visible = 0;
    cards.forEach(card => {
      const matches = card.dataset.search.toLocaleLowerCase().includes(query);
      card.hidden = !matches;
      if (matches) visible++;
    });
    const count = app.querySelector("#workspaceCount");
    if (count) count.innerHTML = `<strong class="text-sm text-[#e9eeeb]">${visible}</strong> de ${cards.length} ${cards.length === 1 ? "espacio" : "espacios"}`;
    const noResults = app.querySelector("#workspaceNoResults");
    if (noResults) noResults.hidden = visible > 0;
  });

  app.querySelectorAll("[data-config-nav]").forEach(button => {
    button.addEventListener("click", () => {
      const url = new URL(location.href);
      url.searchParams.set("config", button.dataset.configNav);
      url.searchParams.delete("provider");
      url.searchParams.delete("instance");
      history.pushState({}, "", url);
      void render();
    });
  });

  app.querySelectorAll("[data-start-assistant]").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.startAssistant;
      const url = new URL(location.href);
      url.searchParams.set("vista", "assistant");
      url.searchParams.set("assistantId", id);
      history.pushState({}, "", url);
      if (window.go) window.go("assistant");
    });
  });

  app.querySelectorAll("[data-bind-assistant]").forEach(button => {
    button.addEventListener("click", async () => {
      try {
        await post(`/api/workspaces/${encodeURIComponent(state.workspaceId)}/resources`, { kind: "assistants", id: button.dataset.bindAssistant, name: button.dataset.name });
        await initialize();
      } catch (error) {
        alert(error.message);
      }
    });
  });

  // Same pattern as "+ Nuevo espacio": the create form lives in a modal.
  app.querySelector("#openCreateAssistantBtn")?.addEventListener("click", () => {
    // A site admin can also create an assistant with no workspace: it stays as a
    // collective assistant and can later be linked to any workspace.
    const canCreateCollective = state.user.role === "site-admin";
    const workspaceName = state.workspace?.name || "este espacio";
    openFormModal({
      title: "Nuevo asistente",
      description: canCreateCollective
        ? `Se crea en RAGFlow y queda registrado como tuyo. Si elegís “Sin espacio” queda como asistente colectivo y podés vincularlo a cualquier espacio desde “Vincular un asistente existente”.`
        : `Se crea en RAGFlow con los recursos de ${workspaceName} y queda registrado como tuyo.`,
      esc,
      fields: [
        { name: "name", label: "Nombre del asistente", maxlength: 128, required: true, placeholder: "Ej: Asistente de obra" },
        { name: "dataset_id", label: "Fuente (opcional)", type: "select", options: [{ value: "", label: "Sin fuente" }, ...(state.assistantDatasets || []).map(d => ({ value: d.id, label: d.name }))] },
        ...(canCreateCollective ? [{
          name: "workspaceId",
          label: "Espacio",
          type: "select",
          options: [
            { value: "", label: "Sin espacio (colectivo)" },
            { value: state.workspaceId, label: workspaceName, selected: true },
          ],
        }] : []),
      ],
      submitLabel: "Crear asistente",
      onSubmit: async values => {
        // One request: the server records the author and, when a workspace is
        // given, links the assistant to it; without one it stays unbound.
        const workspaceId = canCreateCollective ? String(values.workspaceId || "") : state.workspaceId;
        await post("/api/admin/assistants", { name: values.name, dataset_ids: values.dataset_id ? [values.dataset_id] : [], ...(workspaceId ? { workspaceId } : {}) });
        await initialize();
        if (!workspaceId) {
          const message = "Asistente colectivo creado. Vinculalo a un espacio desde “Vincular un asistente existente”.";
          if (typeof window.toast === "function") window.toast(message); else alert(message);
        }
      },
    });
  });

  // Sharing picks from the people who already have access to this workspace.
  app.querySelectorAll("[data-share-assistant]").forEach(button => {
    button.addEventListener("click", async () => {
      const id = button.dataset.shareAssistant;
      const sharedWith = new Set((button.dataset.sharedWith || "").split(",").filter(Boolean));
      try {
        const result = await api(`/api/workspaces/${encodeURIComponent(state.workspaceId)}/members`);
        const members = (result.members || []).filter(member => member.id !== state.user.id);
        if (!members.length) {
          alert("Este espacio todavía no tiene otros miembros a quienes compartir el asistente.");
          return;
        }
        openFormModal({
          title: `Compartir “${button.dataset.name}”`,
          description: "Elegí qué miembros de este espacio pueden consultarlo. Los administradores del sitio conservan acceso.",
          esc,
          fields: [{
            name: "userIds",
            label: "Miembros del espacio",
            type: "checkboxes",
            options: members.map(member => ({
              value: member.id,
              label: member.displayName || member.email,
              hint: member.email,
              checked: sharedWith.has(member.id),
            })),
          }],
          submitLabel: "Guardar",
          onSubmit: async (_values, formData) => {
            await api("/api/admin/assistants", { method: "PUT", body: JSON.stringify({ id, shares: formData.getAll("userIds").map(String) }) });
            await initialize();
          },
        });
      } catch (error) {
        alert(error.message);
      }
    });
  });

  app.querySelectorAll("[data-unbind-dataset], [data-unbind-assistant]").forEach(button => {
    button.addEventListener("click", async () => {
      const isDataset = button.hasAttribute("data-unbind-dataset");
      const kind = isDataset ? "datasets" : "assistants";
      const id = isDataset ? button.dataset.unbindDataset : button.dataset.unbindAssistant;
      const workspaceId = button.dataset.workspace || state.workspaceId;
      try {
        await api(`/api/workspaces/${encodeURIComponent(workspaceId)}/resources`, { method: "DELETE", body: JSON.stringify({ kind, id }) });
        await initialize();
      } catch (error) {
        alert(error.message);
      }
    });
  });

  app.querySelectorAll("[data-lazy-members]").forEach(details => {
    details.addEventListener("toggle", async () => {
      if (!details.open) return;
      const workspaceId = details.dataset.lazyMembers;
      const container = details.querySelector(`[data-members-list="${CSS.escape(workspaceId)}"]`);
      if (!container || container.dataset.loaded) return;
      try {
        const result = await api(`/api/workspaces/${encodeURIComponent(workspaceId)}/members`);
        container.dataset.loaded = "true";
        const canManageMembers = canMutate() && (state.user.role === "site-admin" || state.workspaces.find(row => row.id === workspaceId)?.role === "owner");
        container.innerHTML = result.members?.length
          ? result.members.map(m => `
              <div class="flex items-center justify-between gap-2.5 border-b border-[#1f2a27] py-2">
                <div class="flex min-w-0 items-center gap-2.5">
                  <div class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#25372b] text-[11px] font-bold text-[#bed17a]">${esc((m.displayName || m.email || "U").slice(0, 2).toUpperCase())}</div>
                  <div>
                    <div class="font-semibold text-[#e9eeeb]">${esc(m.displayName || m.email)}</div>
                    <div class="text-[11px] text-[#9aa79e]">${esc(m.email)} · <span class="inline-flex rounded-full border border-[#2a3834] bg-[#18201e] px-1.5 py-0.5 text-[10px] font-semibold text-[#95a5a0]">${esc(m.role)}</span></div>
                  </div>
                </div>
                ${canManageMembers && m.role !== "owner"
                  ? `<button class="rounded-md border border-[#79413b] bg-[#3b211f] px-2 py-1 text-[11px] font-semibold text-[#ffd8d2] hover:bg-[#4b2926] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f09185]" data-remove-member="${esc(workspaceId)}" data-user="${esc(m.id)}">Quitar</button>`
                  : ""}
              </div>
            `).join("")
          : "Sin miembros.";
        bindMemberRemove(container);
      } catch (err) {
        container.textContent = `No se pudieron cargar los miembros: ${err.message}`;
      }
    });
  });

  const bindMemberRemove = rootNode => {
    rootNode.querySelectorAll("[data-remove-member]").forEach(button => {
      button.addEventListener("click", async () => {
        try {
          await api(`/api/workspaces/${encodeURIComponent(button.dataset.removeMember)}/members`, {
            method: "DELETE",
            body: JSON.stringify({ userId: button.dataset.user }),
            headers: { "Content-Type": "application/json" }
          });
          await initialize();
          void render();
        } catch (error) {
          alert(error.message);
        }
      });
    });
  };

  app.querySelector("#providerSearch")?.addEventListener("input", event => {
    const query = event.currentTarget.value.trim().toLowerCase();
    let visible = 0;
    app.querySelectorAll("[data-provider-name]").forEach(card => {
      const match = card.dataset.providerName.toLowerCase().includes(query);
      card.hidden = !match;
      if (match) visible++;
    });
    const emptyNode = app.querySelector("#providerGridEmpty");
    if (emptyNode) emptyNode.hidden = visible > 0;
  });

  app.querySelectorAll("[data-provider-open]").forEach(button => button.addEventListener("click", () => {
    openProviderModal({ providerName: button.dataset.providerOpen, api, post, esc, onChanged: () => void render() });
  }));

  app.querySelector("#userForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = app.querySelector("#userMessage");
    try {
      const user = await post("/api/admin/users", { action: "create", ...Object.fromEntries(new FormData(form)) });
      if (message) message.textContent = `Usuario ${user.displayName} creado.`;
      await render();
    } catch (error) {
      if (message) message.textContent = error.message;
    }
  });

  // Role and area are selects, so they save on change instead of on click.
  app.querySelectorAll("[data-user-field]").forEach(select => {
    select.addEventListener("change", async () => {
      const field = select.dataset.userField;
      try {
        await post("/api/admin/users", { action: "update", id: select.dataset.userId, [field]: select.value });
      } catch (error) {
        alert(error.message);
      }
      await render();
    });
  });

  app.querySelectorAll("[data-user-action]").forEach(button => {
    button.addEventListener("click", async () => {
      try {
        const action = button.dataset.userAction;
        if (action === "active") await post("/api/admin/users", { action: "update", id: button.dataset.userId, active: button.dataset.active === "true" });
        else if (action === "password") {
          const password = window.prompt("Nueva contraseña (mínimo 12 caracteres):");
          if (!password) return;
          await post("/api/admin/users", { action: "update", id: button.dataset.userId, password });
        }
        else if (action === "workspaces") {
          const assigned = new Set((button.dataset.workspaces || "").split(",").filter(Boolean));
          const owned = new Set((button.dataset.ownedWorkspaces || "").split(",").filter(Boolean));
          const options = (state.userAdminWorkspaces || []).map(space => ({
            value: space.id,
            label: space.name,
            checked: assigned.has(space.id) || owned.has(space.id),
            hint: owned.has(space.id) ? "Propietario: conserva el acceso" : "",
          }));
          if (!options.length) {
            alert("Todavía no hay espacios de trabajo creados.");
            return;
          }
          openFormModal({
            title: `Espacios de ${button.dataset.userName}`,
            description: "Elegí a qué espacios de trabajo puede acceder esta cuenta. Un administrador del sitio ve todos los espacios sin necesidad de figurar acá.",
            esc,
            fields: [{ name: "workspaceIds", label: "Espacios de trabajo", type: "checkboxes", options }],
            submitLabel: "Guardar accesos",
            onSubmit: async (_values, formData) => {
              await post("/api/admin/users", { action: "workspaces", id: button.dataset.userId, workspaceIds: formData.getAll("workspaceIds").map(String) });
              await render();
            },
          });
          return;
        }
        await render();
      } catch (error) {
        alert(error.message);
      }
    });
  });

  app.querySelector("#openCreateWorkspaceBtn")?.addEventListener("click", () => {
    openFormModal({
      title: "Nuevo espacio de trabajo",
      description: "Agrupá personas, fuentes y asistentes autorizados.",
      esc,
      fields: [
        { name: "name", label: "Nombre del espacio", maxlength: 100, required: true, placeholder: "Ej: Torre Belgrano" },
        { name: "description", label: "Descripción (opcional)", maxlength: 500, placeholder: "Propósito del espacio de trabajo…" },
      ],
      submitLabel: "Crear espacio",
      onSubmit: async values => {
        await post("/api/workspaces", values);
        await initialize();
        state.area = "workspaces";
        await render();
      },
    });
  });

  app.querySelectorAll("[data-select-workspace]").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.selectWorkspace;
      state.workspaceId = id;
      localStorage.setItem("nexo.workspace", id);
      state.workspace = state.workspaces.find(w => w.id === id) || null;
      const url = new URL(location.href);
      url.searchParams.set("workspaceId", id);
      url.searchParams.delete("dataset");
      history.pushState({}, "", url);
      updateNavigation();
      void render();
    });
  });

  app.querySelectorAll("[data-goto-docs]").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.gotoDocs;
      state.workspaceId = id;
      localStorage.setItem("nexo.workspace", id);
      state.workspace = state.workspaces.find(w => w.id === id) || null;
      state.area = "knowledge";
      const url = new URL(location.href);
      url.searchParams.set("workspaceId", id);
      url.searchParams.set("area", "knowledge");
      url.searchParams.delete("dataset");
      history.pushState({}, "", url);
      updateNavigation();
      void render();
    });
  });

  const bindWorkspaceIds = [...new Set([...app.querySelectorAll("[data-bind]")].map(select => select.dataset.workspace))];
  let catalogPromise = null;
  const loadCatalog = (workspaceId, fresh = false) => {
    // The catalog endpoint returns the full RAGFlow catalog, so every card shares one request.
    if (fresh || !catalogPromise) catalogPromise = api(`/api/workspaces/${encodeURIComponent(workspaceId)}/resources?catalog=1`);
    return catalogPromise;
  };
  const fillBindSelects = (workspaceId, catalogs) => {
    for (const kind of ["datasets", "assistants"]) {
      const select = app.querySelector(`[data-bind="${kind}"][data-workspace="${CSS.escape(workspaceId)}"]`);
      if (!select) continue;
      select.innerHTML = `<option value="">Elegí ${kind === "datasets" ? "una fuente" : "un asistente"}…</option>${(catalogs[kind] || []).map(row => `<option value="${esc(row.id)}" data-name="${esc(row.name)}">${esc(row.name)}</option>`).join("")}`;
      if (select.dataset.bound === "1") continue;
      select.dataset.bound = "1";
      select.addEventListener("change", async () => {
        const option = select.selectedOptions[0];
        if (!option || !option.value) return;
        try {
          await post(`/api/workspaces/${encodeURIComponent(workspaceId)}/resources`, { kind, id: option.value, name: option.dataset.name });
          await initialize();
        } catch (error) {
          alert(error.message);
        }
      });
    }
  };
  const refreshCatalog = async (workspaceId, fresh = false) => {
    const catalogs = await loadCatalog(workspaceId, fresh);
    for (const id of bindWorkspaceIds) fillBindSelects(id, catalogs);
  };

  // Populate the resource selects automatically so no manual catalog refresh is required.
  if (bindWorkspaceIds.length) refreshCatalog(bindWorkspaceIds[0]).catch(() => { /* the refresh button surfaces connection errors */ });

  app.querySelectorAll("[data-refresh]").forEach(button => {
    if (!button.dataset.refresh) return; // skip doc-table's valueless [data-refresh]
    button.addEventListener("click", async () => {
      try {
        await refreshCatalog(button.dataset.refresh, true);
      } catch (error) {
        alert(error.message);
      }
    });
  });

  app.querySelectorAll("[data-create-dataset]").forEach(button => button.addEventListener("click", () => {
    const workspaceId = button.dataset.createDataset;
    openFormModal({
      title: "Crear fuente en RAGFlow",
      description: "La fuente se crea en RAGFlow y se vincula a este espacio de trabajo.",
      esc,
      fields: [
        { name: "name", label: "Nombre de la fuente", maxlength: 128, required: true, placeholder: "Ej: Pliegos y especificaciones" },
        { name: "description", label: "Descripción (opcional)", maxlength: 500, placeholder: "Contenido de la fuente…" },
      ],
      submitLabel: "Crear y vincular",
      onSubmit: async values => {
        const name = String(values.name || "").trim();
        const created = await post("/api/admin/datasets", { name, description: values.description });
        const payload = created?.data ?? created;
        const row = Array.isArray(payload) ? payload[0] : payload;
        const datasetId = String(row?.id ?? row?.dataset_id ?? "");
        if (!datasetId) throw new Error("RAGFlow creó la fuente pero no devolvió su identificador.");
        await post(`/api/workspaces/${encodeURIComponent(workspaceId)}/resources`, { kind: "datasets", id: datasetId, name: String(row?.name ?? name) });
        catalogPromise = null;
        await initialize();
      },
    });
  }));

  app.querySelectorAll("[data-add-member]").forEach(form => form.addEventListener("submit", async event => {
    event.preventDefault();
    try {
      await post(`/api/workspaces/${encodeURIComponent(form.dataset.addMember)}/members`, Object.fromEntries(new FormData(form)));
      await initialize();
      state.area = "workspaces";
      await render();
    } catch (error) {
      alert(error.message);
    }
  }));

  const filterActivity = () => {
    const searchVal = (app.querySelector("#activitySearch")?.value || "").toLowerCase().trim();
    const typeVal = (app.querySelector("#activityFilter")?.value || "").toLowerCase().trim();
    let visibleCount = 0;
    app.querySelectorAll("#activityList .activity-row-item").forEach(row => {
      const rowType = (row.dataset.eventType || "").toLowerCase();
      const rowSearch = (row.dataset.searchContent || "").toLowerCase();
      const matchesType = !typeVal || rowType.includes(typeVal);
      const matchesSearch = !searchVal || rowSearch.includes(searchVal);
      const isVisible = matchesType && matchesSearch;
      row.style.display = isVisible ? "" : "none";
      if (isVisible) visibleCount++;
      const detailRow = app.querySelector(`#activity-detail-${CSS.escape(row.dataset.eventId || "")}`);
      if (!isVisible && detailRow) detailRow.style.display = "none";
    });
    const countEl = app.querySelector("#activityCount");
    if (countEl) countEl.textContent = `${visibleCount} eventos`;
  };

  app.querySelector("#activityFilter")?.addEventListener("change", filterActivity);
  app.querySelector("#activitySearch")?.addEventListener("input", filterActivity);

  app.querySelectorAll("[data-toggle-activity-detail]").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.toggleActivityDetail;
      const detailRow = app.querySelector(`#activity-detail-${CSS.escape(id)}`);
      if (!detailRow) return;
      const isHidden = detailRow.style.display === "none";
      detailRow.style.display = isHidden ? "table-row" : "none";
      button.textContent = isHidden ? "Ocultar ▴" : "Ver detalle ▾";
    });
  });

  app.querySelectorAll("[data-copy-activity]").forEach(button => {
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copyActivity);
        const prev = button.textContent;
        button.textContent = "✓ Copiado";
        setTimeout(() => { button.textContent = prev; }, 2000);
      } catch {
        alert("No se pudo copiar el JSON.");
      }
    });
  });

  app.querySelector("#datasetSelect")?.addEventListener("change", event => {
    const url = new URL(location.href);
    url.searchParams.set("dataset", event.currentTarget.value);
    history.pushState({}, "", url);
    void render();
  });

  app.querySelector("#uploadDoc")?.addEventListener("click", event => {
    const button = event.currentTarget;
    const version = viewVersion;
    openDocumentUpload({
      endpoint: `/api/workspaces/${encodeURIComponent(state.workspaceId)}/datasets/${encodeURIComponent(button.dataset.dataset)}/documents`,
      datasetName: button.dataset.datasetName,
      upload: api,
      onComplete: () => { if (version === viewVersion) return render(); },
    });
  });

  app.querySelector("#sourceSearch")?.addEventListener("input", event => {
    const query = event.currentTarget.value.trim().toLowerCase();
    let visible = 0;
    app.querySelectorAll("[data-source-name]").forEach(node => {
      const match = node.dataset.sourceName.toLowerCase().includes(query);
      node.hidden = !match;
      if (match) visible++;
    });
    const emptyNode = app.querySelector("#sourceEmpty");
    if (emptyNode) emptyNode.hidden = visible > 0;
  });

  app.querySelectorAll("[data-add-source]").forEach(button => button.addEventListener("click", () => {
    openDataSourceForm({ source: button.dataset.addSource, post, esc, onChanged: () => void render() });
  }));

  app.querySelectorAll("[data-open-source]").forEach(button => button.addEventListener("click", () => {
    openConnectorDetail({
      connector: { id: button.dataset.openSource, source: button.dataset.sourceKey, name: button.dataset.sourceLabel },
      api, post, esc, onChanged: () => void render(),
    });
  }));
}
async function initialize() {
  const version = viewVersion;
  try {
    const session = await api("/api/auth/session"); if (version !== viewVersion) return; state.user = session.user;
    if (!state.user) return signIn();
    const result = await api("/api/workspaces"); if (version !== viewVersion) return; state.workspaces = result.workspaces;
    if (!state.workspaces.some(w => w.id === state.workspaceId)) state.workspaceId = "";
    state.workspace = state.workspaces.find(w => w.id === state.workspaceId) || null;
    if (state.workspaceId) localStorage.setItem("nexo.workspace", state.workspaceId);
    await render();
    if (embedded) window.dispatchEvent(new Event('nexo-workspaces-changed'));
  } catch (error) { if (version === viewVersion) signIn(error.message); }
}
window.addEventListener("popstate", () => { if (embedded) return; const params = new URLSearchParams(location.search); const area = params.get("area"); state.area = navItems.some(([id]) => id === area) ? area : "home"; state.workspaceId = params.get("workspaceId") || ""; void initialize(); });
if (location.pathname === "/workspace.html") initialize();
