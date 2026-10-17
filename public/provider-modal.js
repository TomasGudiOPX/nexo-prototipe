import { providerLogo } from "./provider-icons.js";

const TYPE_LABELS = { chat: "Chat", embedding: "Embedding", rerank: "Rerank", asr: "ASR", tts: "TTS", ocr: "OCR", vision: "Visión", speech2text: "ASR" };
const typeLabel = type => TYPE_LABELS[type] || type || "—";
const typeOptions = selected => `<select name="modelType">${["chat", "embedding", "rerank", "asr", "tts", "ocr", "vision"].map(value => `<option value="${value}"${value === selected ? " selected" : ""}>${typeLabel(value)}</option>`).join("")}</select>`;

/**
 * Provider connection manager. Opens as a modal so the provider list stays in
 * view; the modal itself navigates between a provider's connections and one
 * connection's models without leaving the page.
 */
export function openProviderModal({ providerName, api, post, esc, onChanged }) {
  let changed = false;
  const dialog = document.createElement("dialog");
  dialog.className = "nexo-provider";
  dialog.setAttribute("aria-labelledby", "providerModalTitle");
  dialog.innerHTML = `
    <header class="provider-modal-head">
      <div class="provider-modal-id">
        <span class="provider-modal-logo">${providerLogo(providerName, 32)}</span>
        <div>
          <h2 id="providerModalTitle">${esc(providerName)}</h2>
          <p class="muted" data-subtitle>Conexiones configuradas para este proveedor.</p>
        </div>
      </div>
      <button type="button" class="secondary" data-close aria-label="Cerrar">×</button>
    </header>
    <div class="provider-modal-body" data-body></div>
    <p class="provider-modal-status" data-status role="status"></p>`;
  const body = dialog.querySelector("[data-body]");
  const subtitle = dialog.querySelector("[data-subtitle]");
  const status = dialog.querySelector("[data-status]");
  const message = (text, error = false) => { status.textContent = text || ""; status.classList.toggle("error", Boolean(error)); };
  const close = () => dialog.close();

  dialog.querySelector("[data-close]").addEventListener("click", close);
  dialog.addEventListener("click", event => { if (event.target === dialog) close(); });
  dialog.addEventListener("close", () => { dialog.remove(); if (changed) onChanged(); }, { once: true });

  const submit = async (payload, okText, after = load) => {
    message("Guardando…");
    try {
      await post("/api/admin/providers", payload);
      changed = true;
      message(okText);
      await after();
    } catch (error) { message(error.message, true); }
  };

  function connectionsMarkup(instances) {
    return `
      <div class="provider-toolbar">
        <span class="muted">${instances.length} ${instances.length === 1 ? "conexión" : "conexiones"}</span>
        <button type="button" class="secondary" data-add-toggle>＋ Agregar conexión</button>
        <button type="button" class="danger" data-delete-provider>Eliminar proveedor</button>
      </div>
      ${instances.length ? `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>Conexión</th><th>Región</th><th>Estado</th><th></th></tr></thead>
        <tbody>${instances.map(i => `<tr>
          <td><b>${esc(i.name)}</b></td>
          <td>${esc(i.region || "—")}</td>
          <td><span class="badge ${i.status === "active" ? "" : "gray"}">${esc(i.status || "sin estado")}</span></td>
          <td><div class="toolbar" style="margin:0">
            <button type="button" class="secondary" data-open-instance="${esc(i.name)}">Modelos</button>
            <button type="button" class="secondary" data-check-instance="${esc(i.name)}">Verificar</button>
            <button type="button" class="danger" data-delete-instance="${esc(i.name)}">Eliminar</button>
          </div></td>
        </tr>`).join("")}</tbody>
      </table></div>` : `<p class="provider-empty">Aún no hay conexiones configuradas. Agregá una para usar los modelos de ${esc(providerName)}.</p>`}
      <form class="provider-form" data-create-form hidden>
        <h3>Nueva conexión</h3>
        <p class="muted">Un nombre único identifica esta conexión dentro del mismo proveedor.</p>
        <div class="form-grid">
          <label>Nombre de conexión<input name="instanceName" pattern="[A-Za-z0-9_-]+" maxlength="100" placeholder="nexo-principal" required></label>
          <label>API key<input name="apiKey" type="password" autocomplete="new-password" required></label>
          <label>URL base<input name="baseUrl" type="url" placeholder="${esc("https://api.example.com/v1")}"></label>
          <label>Modelo (opcional)<input name="modelName" placeholder="Nombre del modelo en el proveedor"></label>
          <label>Tipo de modelo${typeOptions()}</label>
          <label>Máximo de tokens<input name="maxTokens" type="number" min="1" value="8192"></label>
        </div>
        <div class="toolbar" style="margin-top:14px">
          <button type="button" class="secondary" data-verify-connection>Verificar sin guardar</button>
          <button type="submit">Guardar conexión</button>
        </div>
      </form>`;
  }

  function modelsMarkup(instanceName, models, balance, supported, defaults) {
    const isDefault = model => defaults.some(row => row.instance === instanceName && row.name === model.name && row.type === model.type);
    return `
      <div class="provider-toolbar">
        <button type="button" class="secondary" data-back>← Conexiones</button>
        <span class="muted">${esc(providerName)} · ${esc(instanceName)}</span>
        <button type="button" class="secondary" data-check-current>Verificar conexión</button>
      </div>
      ${balance.length ? `<div class="provider-balance">${balance.map(b => `<div><span class="muted">${esc(b.label)}</span><b>${esc(b.value)}</b></div>`).join("")}</div>` : ""}
      <h3>Modelos</h3>
      <p class="muted">RAGFlow usa el modelo predeterminado de cada tipo para la ingesta y el chat. Las fuentes nuevas heredan el embedding predeterminado.</p>
      ${models.length ? `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>Modelo</th><th>Tipo</th><th>Máximo de tokens</th><th>Estado</th><th></th></tr></thead>
        <tbody>${models.map(m => `<tr>
          <td><b>${esc(m.name)}</b>${isDefault(m) ? ' <span class="badge">Predeterminado</span>' : ""}${m.features?.length ? ` <span class="muted">· ${esc(m.features.map(typeLabel).join(", "))}</span>` : ""}</td>
          <td>${esc(typeLabel(m.type))}</td>
          <td>${esc(m.maxTokens)}</td>
          <td><span class="badge ${m.status === "active" ? "" : "gray"}">${esc(m.status || "sin estado")}</span></td>
          <td><div class="toolbar" style="margin:0">
            ${isDefault(m) ? "" : `<button type="button" class="secondary" data-model-default="${esc(m.name)}" data-model-type="${esc(m.type)}">Usar como predeterminado</button>`}
            <button type="button" class="secondary" data-model-toggle="${esc(m.name)}" data-model-status="${m.status === "active" ? "inactive" : "active"}">${m.status === "active" ? "Desactivar" : "Activar"}</button>
            <button type="button" class="danger" data-model-delete="${esc(m.name)}">Eliminar</button>
          </div></td>
        </tr>`).join("")}</tbody>
      </table></div>` : `<p class="provider-empty">Esta conexión todavía no tiene modelos. Agregá uno para habilitarlo en RAGFlow.</p>`}
      <form class="provider-form" data-model-form>
        <h3>Agregar modelo</h3>
        <div class="form-grid">
          <label>Modelo<input name="modelName" list="supportedModels" placeholder="Nombre del modelo" required><datalist id="supportedModels">${supported.map(s => `<option value="${esc(s.name)}">`).join("")}</datalist></label>
          <label>Tipo de modelo${typeOptions()}</label>
          <label>Máximo de tokens<input name="maxTokens" type="number" min="1" value="8192"></label>
        </div>
        <div class="toolbar" style="margin-top:14px"><button type="submit">Agregar modelo</button></div>
      </form>`;
  }

  function bindConnections() {
    body.querySelector("[data-add-toggle]")?.addEventListener("click", () => {
      const form = body.querySelector("[data-create-form]");
      form.hidden = !form.hidden;
      if (!form.hidden) form.querySelector("input")?.focus();
    });
    body.querySelector("[data-verify-connection]")?.addEventListener("click", () => {
      const form = body.querySelector("[data-create-form]");
      if (!form.reportValidity()) return;
      const values = Object.fromEntries(new FormData(form));
      void submit({ action: "verify", factory: providerName, instance: values.instanceName, apiKey: values.apiKey, baseUrl: values.baseUrl }, "Credenciales verificadas sin guardar.");
    });
    body.querySelector("[data-create-form]")?.addEventListener("submit", event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      // The providers route keys connections as `instance`; the form field is named
      // `instanceName` after RAGFlow's own field. Map it explicitly.
      void submit({ action: "create-instance", factory: providerName, ...values, instance: values.instanceName }, `Conexión ${values.instanceName} guardada.`);
    });
    body.querySelector("[data-delete-provider]")?.addEventListener("click", () => {
      if (!confirm(`¿Eliminar ${providerName} con todas sus conexiones y modelos? Esta acción no se puede deshacer.`)) return;
      void submit({ action: "delete-provider", factory: providerName }, "Proveedor eliminado.", () => { dialog.close(); });
    });
    body.querySelectorAll("[data-open-instance]").forEach(button => button.addEventListener("click", () => { void loadInstance(button.dataset.openInstance); }));
    body.querySelectorAll("[data-check-instance]").forEach(button => button.addEventListener("click", async () => {
      message("Verificando conexión…");
      try { await post("/api/admin/providers", { action: "check-instance", factory: providerName, instance: button.dataset.checkInstance }); message("La conexión respondió correctamente."); }
      catch (error) { message(error.message, true); }
    }));
    body.querySelectorAll("[data-delete-instance]").forEach(button => button.addEventListener("click", () => {
      const instance = button.dataset.deleteInstance;
      if (!confirm(`¿Eliminar la conexión "${instance}" y sus modelos?`)) return;
      void submit({ action: "delete-instance", factory: providerName, instance }, `Conexión ${instance} eliminada.`);
    }));
  }

  function bindModels(instanceName) {
    const reloadInstance = () => loadInstance(instanceName);
    body.querySelector("[data-back]")?.addEventListener("click", () => { void load(); });
    body.querySelector("[data-check-current]")?.addEventListener("click", async () => {
      message("Verificando conexión…");
      try { await post("/api/admin/providers", { action: "check-instance", factory: providerName, instance: instanceName }); message("La conexión respondió correctamente."); }
      catch (error) { message(error.message, true); }
    });
    body.querySelector("[data-model-form]")?.addEventListener("submit", event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      void submit({ action: "add-model", factory: providerName, instance: instanceName, ...values }, `Modelo ${values.modelName} agregado.`, reloadInstance);
    });
    body.querySelectorAll("[data-model-default]").forEach(button => button.addEventListener("click", () => {
      void submit({ action: "set-default-model", factory: providerName, instance: instanceName, modelName: button.dataset.modelDefault, modelType: button.dataset.modelType }, `Modelo ${button.dataset.modelDefault} marcado como predeterminado.`, reloadInstance);
    }));
    body.querySelectorAll("[data-model-toggle]").forEach(button => button.addEventListener("click", () => {
      void submit({ action: "set-model-status", factory: providerName, instance: instanceName, modelName: button.dataset.modelToggle, status: button.dataset.modelStatus }, "Estado del modelo actualizado.", reloadInstance);
    }));
    body.querySelectorAll("[data-model-delete]").forEach(button => button.addEventListener("click", () => {
      const name = button.dataset.modelDelete;
      if (!confirm(`¿Eliminar el modelo "${name}"?`)) return;
      void submit({ action: "delete-models", factory: providerName, instance: instanceName, modelNames: [name] }, `Modelo ${name} eliminado.`, reloadInstance);
    }));
  }

  async function load() {
    message("");
    subtitle.textContent = "Conexiones configuradas para este proveedor.";
    body.innerHTML = '<p class="provider-empty">Cargando conexiones…</p>';
    try {
      const data = await api(`/api/admin/providers?factory=${encodeURIComponent(providerName)}`);
      const instances = data.instances || [];
      body.innerHTML = connectionsMarkup(instances);
      bindConnections();
    } catch (error) {
      body.innerHTML = `<p class="provider-empty error">${esc(error.message)}</p>`;
    }
  }

  async function loadInstance(instanceName) {
    message("");
    subtitle.textContent = "Modelos y estado de la conexión.";
    body.innerHTML = '<p class="provider-empty">Cargando modelos…</p>';
    try {
      const query = new URLSearchParams({ factory: providerName, instance: instanceName, supported: "1" });
      const data = await api(`/api/admin/providers?${query}`);
      body.innerHTML = modelsMarkup(instanceName, data.models || [], data.balance || [], data.supported || [], data.defaults || []);
      bindModels(instanceName);
    } catch (error) {
      body.innerHTML = `<p class="provider-empty error">${esc(error.message)}</p>`;
    }
  }

  document.body.append(dialog);
  dialog.showModal();
  void load();
}
