import { dataSourceInfo, sourceLogo } from "./data-source-icons.js";

// Field specs mirror RAGFlow's per-connector form definitions
// (data-source/constant/*). Connectors without a spec fall back to a JSON editor.
const F = (label, name, type = "text", required = true, placeholder = "", options, defaultValue) => ({ label, name, type, required, placeholder, options, defaultValue });
const SECRET = "password";

const SOURCE_FIELDS = {
  rss: [F("URL del feed", "config.feed_url", "text", true, "https://example.com/feed.xml"), F("Tamaño de lote", "config.batch_size", "number", false)],
  sitemap: [F("URL del sitemap", "config.sitemap_url", "text", true, "https://example.com/sitemap.xml"), F("Filtro de URLs (regex)", "config.url_filter", "text", false, "^https://example.com/docs/"), F("Seguir enlaces a PDF", "config.follow_pdf_links", "checkbox", false), F("User-Agent", "config.user_agent", "text", false, "RAGFlow-SitemapConnector/1.0"), F("Tamaño de lote", "config.batch_size", "number", false)],
  google_cloud_storage: [F("GCS Access Key ID", "config.credentials.access_key_id"), F("GCS Secret Access Key", "config.credentials.secret_access_key", SECRET), F("Bucket", "config.bucket_name")],
  oci_storage: [F("Namespace OCI", "config.credentials.namespace"), F("Región OCI", "config.credentials.region"), F("OCI Access Key ID", "config.credentials.access_key_id"), F("OCI Secret Access Key", "config.credentials.secret_access_key", SECRET), F("Bucket", "config.bucket_name")],
  r2: [F("R2 Account ID", "config.credentials.account_id"), F("R2 Access Key ID", "config.credentials.r2_access_key_id"), F("R2 Secret Access Key", "config.credentials.r2_secret_access_key", SECRET), F("Bucket", "config.bucket_name")],
  s3: [F("Bucket", "config.bucket_name"), F("Prefijo", "config.prefix", "text", false), F("Modo", "config.bucket_type", "select", false, "", ["s3", "s3_compatible"]), F("Región", "config.credentials.region", "text", false, "us-east-1"), F("AWS Access Key ID", "config.credentials.aws_access_key_id", "text", false), F("AWS Secret Access Key", "config.credentials.aws_secret_access_key", SECRET, false), F("Endpoint URL", "config.credentials.endpoint_url", "text", false, "https://s3.example.com")],
  notion: [F("Token de integración de Notion", "config.credentials.notion_integration_token", SECRET), F("Root Page ID", "config.root_page_id", "text", false)],
  discord: [F("Token del bot de Discord", "config.credentials.discord_bot_token", SECRET), F("IDs de servidores", "config.server_ids", "text", false), F("Canales", "config.channels", "text", false)],
  google_drive: [F("Email del administrador principal", "config.credentials.google_primary_admin", "text", true, "admin@example.com"), F("JSON de token OAuth", "config.credentials.google_tokens", "textarea"), F("Emails de My Drive", "config.my_drive_emails"), F("URLs de carpetas compartidas", "config.shared_folder_urls", "textarea")],
  gmail: [F("Email del administrador principal", "config.credentials.google_primary_admin", "text", true, "admin@example.com"), F("JSON de token OAuth", "config.credentials.google_tokens", "textarea")],
  slack: [F("Token del bot de Slack", "config.credentials.slack_bot_token", SECRET), F("Canales", "config.channels", "text", false)],
  sharepoint: [F("URL del sitio", "config.credentials.site_url", "text", true, "https://contoso.sharepoint.com/sites/MySite"), F("Tenant ID", "config.credentials.tenant_id"), F("Client ID", "config.credentials.client_id"), F("Client Secret", "config.credentials.client_secret", SECRET)],
  teams: [F("Tenant ID", "config.credentials.tenant_id"), F("Client ID", "config.credentials.client_id"), F("Client Secret", "config.credentials.client_secret", SECRET)],
  onedrive: [F("Tenant ID", "config.credentials.tenant_id"), F("Client ID", "config.credentials.client_id"), F("Client Secret", "config.credentials.client_secret", SECRET), F("Ruta de carpeta", "config.folder_path", "text", false, "/Documents/Reports"), F("Tamaño de lote", "config.batch_size", "number", false)],
  outlook: [F("Tenant ID", "config.credentials.tenant_id"), F("Client ID", "config.credentials.client_id"), F("Client Secret", "config.credentials.client_secret", SECRET), F("Carpeta de correo", "config.folder", "text", false, "inbox"), F("Mailboxes (UPN)", "config.user_ids", "text", false)],
  salesforce: [F("URL de la instancia", "config.credentials.instance_url", "text", true, "https://your-domain.my.salesforce.com"), F("Client ID", "config.credentials.client_id"), F("Client Secret", "config.credentials.client_secret", SECRET), F("Objetos", "config.objects", "text", false, "Account,Contact,Opportunity,Case"), F("Versión de API", "config.api_version", "text", false, "v59.0")],
  azure_blob: [F("Modo de autenticación", "config.auth_mode", "select", true, "", ["account_key", "connection_string", "sas_token"]), F("Account Name", "config.credentials.account_name", "text", false, "mystorageaccount"), F("Account Key", "config.credentials.account_key", SECRET, false), F("Connection String", "config.credentials.connection_string", SECRET, false), F("Container URL", "config.credentials.container_url", "text", false), F("SAS Token", "config.credentials.sas_token", SECRET, false), F("Container Name", "config.credentials.container_name", "text", false), F("Prefijo", "config.prefix", "text", false)],
  webdav: [F("URL del servidor", "config.base_url", "text", true, "https://webdav.example.com"), F("Usuario", "config.credentials.username"), F("Contraseña", "config.credentials.password", SECRET), F("Ruta remota", "config.remote_path", "text", false, "/")],
  dropbox: [F("Access Token", "config.credentials.dropbox_access_token", SECRET), F("Tamaño de lote", "config.batch_size", "number", false)],
  box: [F("Configuración OAuth de Box", "config.credentials.box_tokens", "textarea", true, '{ "client_id": "...", "client_secret": "...", "redirect_uri": "..." }'), F("Folder ID", "config.folder_id", "text", false)],
  airtable: [F("Access Token", "config.credentials.airtable_access_token", SECRET), F("Base ID", "config.base_id"), F("Tabla (nombre o ID)", "config.table_name_or_id")],
  dingtalk_ai_table: [F("Access Token", "config.credentials.access_token", SECRET), F("Table ID", "config.table_id"), F("Operator ID", "config.operator_id")],
  gitlab: [F("Owner del proyecto", "config.project_owner"), F("Nombre del proyecto", "config.project_name"), F("Personal Access Token", "config.credentials.gitlab_access_token", SECRET), F("URL de GitLab", "config.gitlab_url", "text", true, "https://gitlab.com"), F("Incluir merge requests", "config.include_mrs", "checkbox", false, "", undefined, true), F("Incluir incidencias", "config.include_issues", "checkbox", false, "", undefined, true), F("Incluir archivos de código", "config.include_code_files", "checkbox", false, "", undefined, true)],
  asana: [F("API Token", "config.credentials.asana_api_token_secret", SECRET), F("Workspace ID", "config.asana_workspace_id"), F("IDs de proyectos", "config.asana_project_ids", "text", false), F("Team ID", "config.asana_team_id", "text", false)],
  github: [F("Owner del repositorio", "config.repository_owner"), F("Nombre del repositorio", "config.repository_name"), F("Access Token", "config.credentials.github_access_token", SECRET), F("Incluir pull requests", "config.include_pull_requests", "checkbox", false, "", undefined, true), F("Incluir incidencias", "config.include_issues", "checkbox", false, "", undefined, true)],
  imap: [F("Usuario", "config.credentials.imap_username"), F("Contraseña", "config.credentials.imap_password", SECRET), F("Host", "config.imap_host"), F("Puerto", "config.imap_port", "number"), F("Buzones", "config.imap_mailbox", "text", false)],
  zendesk: [F("Subdominio", "config.credentials.zendesk_subdomain"), F("Email", "config.credentials.zendesk_email"), F("Token", "config.credentials.zendesk_token", SECRET), F("Contenido", "config.zendesk_content_type", "select", true, "", ["articles", "tickets"])],
  zotero: [F("User ID", "config.zotero_user_id", "text", true, "12345678"), F("API Key", "config.credentials.zotero_api_key", SECRET), F("Almacenamiento", "config.storage_mode", "select", true, "", ["zotero_storage", "webdav"]), F("URL WebDAV", "config.webdav_url", "text", false)],
  moodle: [F("URL de Moodle", "config.moodle_url", "text", true, "https://moodle.example.com"), F("Token de API", "config.credentials.moodle_token", SECRET)],
  mysql: [F("Host", "config.host", "text", true, "localhost"), F("Puerto", "config.port", "number", true, "3306"), F("Base de datos", "config.database"), F("Usuario", "config.credentials.username"), F("Contraseña", "config.credentials.password", SECRET), F("Consulta SQL", "config.query", "textarea", false, "SELECT * FROM tabla"), F("Columnas de contenido", "config.content_columns", "text", false), F("Columnas de metadatos", "config.metadata_columns", "text", false), F("Tamaño de lote", "config.batch_size", "number", false)],
  postgresql: [F("Host", "config.host", "text", true, "localhost"), F("Puerto", "config.port", "number", true, "5432"), F("Base de datos", "config.database"), F("Usuario", "config.credentials.username"), F("Contraseña", "config.credentials.password", SECRET), F("Consulta SQL", "config.query", "textarea", false, "SELECT * FROM tabla"), F("Columnas de contenido", "config.content_columns", "text", false), F("Columnas de metadatos", "config.metadata_columns", "text", false), F("Tamaño de lote", "config.batch_size", "number", false)],
  bigquery: [F("Project ID", "config.project_id", "text", true, "my-gcp-project"), F("Ubicación", "config.location", "text", false, "US"), F("JSON de service account", "config.credentials.service_account_json", SECRET), F("Dataset ID", "config.dataset_id", "text", false), F("Table ID", "config.table_id", "text", false), F("Consulta GoogleSQL", "config.query", "textarea", false)],
  rest_api: [F("URL base", "config.base_url", "text", true, "https://api.example.com"), F("Método", "config.method", "select", false, "", ["GET", "POST"]), F("Ruta del listado", "config.list_path", "text", false, "/items"), F("Token de acceso", "config.credentials.access_token", SECRET, false)],
};

const label = key => SOURCE_FIELDS[key] ? null : null;

function fieldMarkup(field) {
  const attrs = `name="${field.name}"${field.required ? " required" : ""}${field.placeholder ? ` placeholder="${field.placeholder.replace(/"/g, "&quot;")}"` : ""}`;
  if (field.type === "checkbox") return `<label class="ds-check"><input type="checkbox" ${attrs}${field.defaultValue === true ? " checked" : ""}> ${field.label}</label>`;
  if (field.type === "select") return `<label>${field.label}<select ${attrs}>${field.options.map(option => `<option value="${option}">${option}</option>`).join("")}</select></label>`;
  if (field.type === "textarea") return `<label class="wide">${field.label}<textarea ${attrs} rows="3"></textarea></label>`;
  if (field.type === "password") return `<label>${field.label}<input type="password" autocomplete="new-password" ${attrs}></label>`;
  if (field.type === "number") return `<label>${field.label}<input type="number" min="1" ${attrs}></label>`;
  return `<label>${field.label}<input type="text" ${attrs}></label>`;
}

/** Turns dotted form names (config.credentials.username) into a nested object. */
function nestValues(values, fields) {
  const config = {};
  for (const field of fields) {
    const raw = values[field.name];
    if (raw === undefined) continue;
    let value;
    if (field.type === "checkbox") value = raw === "on";
    else if (field.type === "number") { if (raw === "") continue; value = Number(raw); }
    else { value = String(raw).trim(); if (value === "") continue; }
    const path = field.name.split(".").slice(1);
    let cursor = config;
    for (const part of path.slice(0, -1)) cursor = cursor[part] = cursor[part] || {};
    cursor[path.at(-1)] = value;
  }
  return config;
}

function createDialog(esc, { sourceId, title, subtitle }) {
  const dialog = document.createElement("dialog");
  dialog.className = "nexo-provider ds-modal";
  dialog.setAttribute("aria-labelledby", "dsModalTitle");
  dialog.innerHTML = `
    <header class="provider-modal-head">
      <div class="provider-modal-id">
        <span class="provider-modal-logo">${sourceLogo(sourceId, 32)}</span>
        <div>
          <h2 id="dsModalTitle">${esc(title)}</h2>
          <p class="muted" data-subtitle>${esc(subtitle)}</p>
        </div>
      </div>
      <button type="button" class="secondary" data-close aria-label="Cerrar">×</button>
    </header>
    <div class="provider-modal-body" data-body></div>
    <p class="provider-modal-status" data-status role="status"></p>`;
  const body = dialog.querySelector("[data-body]");
  const status = dialog.querySelector("[data-status]");
  const message = (text, error = false) => { status.textContent = text || ""; status.classList.toggle("error", Boolean(error)); };
  dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  document.body.append(dialog);
  return { dialog, body, message };
}

/** Create form for one connector source. */
export function openDataSourceForm({ source, post, esc, onChanged }) {
  const info = dataSourceInfo(source);
  const { dialog, body, message } = createDialog(esc, { sourceId: source, title: `Agregar ${info.name}`, subtitle: info.description });
  const fields = SOURCE_FIELDS[source];
  body.innerHTML = `
    <form class="ds-form" data-create-form>
      <div class="form-grid">
        <label class="wide">Nombre de la conexión<input name="name" maxlength="128" placeholder="produccion" required></label>
        ${fields ? fields.map(fieldMarkup).join("") : ""}
        ${fields ? "" : '<label class="wide">Configuración (JSON)<textarea name="configJson" rows="8" placeholder=\'{"credentials":{"token":"..."}}\' required></textarea></label>'}
      </div>
      <div class="toolbar" style="margin-top:16px">
        <button type="submit">Guardar fuente</button>
        <span class="muted">Se prueba la conexión antes de guardarla.</span>
      </div>
    </form>`;
  let changed = false;
  dialog.addEventListener("close", () => { dialog.remove(); if (changed) onChanged(); }, { once: true });
  body.querySelector("[data-create-form]").addEventListener("submit", async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    let config;
    if (fields) config = nestValues(values, fields);
    else {
      try { config = JSON.parse(String(values.configJson || "{}")); }
      catch { return message("La configuración JSON no es válida.", true); }
    }
    message("Probando la conexión y guardando…");
    try {
      await post("/api/admin/data-sources", { source, name: values.name, config });
      changed = true;
      message(`${info.name} quedó conectada.`);
      dialog.close();
    } catch (error) { message(error.message, true); }
  });
  dialog.showModal();
}

const LOG_STATUS = { success: "Correcto", failed: "Falló", running: "En curso", pending: "Pendiente", schedule: "Programado", cancel: "Cancelado" };
const statusLabel = value => LOG_STATUS[value] || value || "sin estado";

/** Detail view for one configured connector: association, test, logs, rebuild, delete. */
export function openConnectorDetail({ connector, api, post, esc, onChanged }) {
  const { id, name, source } = connector;
  const info = dataSourceInfo(source);
  const { dialog, body, message } = createDialog(esc, { sourceId: source, title: name || info.name, subtitle: `${info.name} · ${id}` });
  const path = `/api/admin/data-sources/${encodeURIComponent(id)}`;
  let changed = false;
  dialog.addEventListener("close", () => { dialog.remove(); if (changed) onChanged(); }, { once: true });

  async function paint() {
    body.innerHTML = '<p class="provider-empty">Cargando la fuente…</p>';
    let detail;
    try { detail = await api(path); }
    catch (error) { body.innerHTML = `<p class="provider-empty error">${esc(error.message)}</p>`; return; }
    const connectorData = detail.source || {};
    const datasets = await api("/api/admin/datasets").catch(() => ({ datasets: [] }));
    const options = (datasets.datasets || []).map(row => `<option value="${esc(row.id)}"${row.id === connectorData.dataset_id ? " selected" : ""}>${esc(row.name || row.id)}</option>`).join("");
    body.innerHTML = `
      <dl class="ds-facts">
        <div><dt>Estado</dt><dd><span class="badge ${connectorData.status === "schedule" ? "" : "gray"}">${esc(statusLabel(connectorData.status))}</span></dd></div>
        <div><dt>Frecuencia de actualización</dt><dd>${esc(connectorData.refresh_freq || 0)} s</dd></div>
        <div><dt>Última actualización</dt><dd>${esc(connectorData.update_date || "—")}</dd></div>
      </dl>
      <label class="ds-associate">Fuente de conocimiento asociada
        <select data-dataset><option value="">Sin asociar</option>${options}</select>
      </label>
      <div class="toolbar">
        <button type="button" class="secondary" data-test>Verificar conexión</button>
        <button type="button" class="secondary" data-logs>Ver registros</button>
        <button type="button" class="secondary" data-rebuild>Sincronizar ahora</button>
        <button type="button" class="danger" data-delete>Eliminar fuente</button>
      </div>
      <div data-logs-panel></div>`;
    bind();
  }

  function bind() {
    body.querySelector("[data-dataset]").addEventListener("change", async event => {
      message("Guardando la asociación…");
      try {
        await api(path, { method: "PATCH", body: JSON.stringify({ dataset_id: event.currentTarget.value }) });
        changed = true;
        message(event.currentTarget.value ? "Fuente asociada." : "Asociación quitada.");
      } catch (error) { message(error.message, true); }
    });
    body.querySelector("[data-test]").addEventListener("click", async () => {
      message("Probando la conexión…");
      try {
        const result = await post(`${path}?operation=test`, {});
        message(result.data === false ? "La fuente rechazó la prueba de conexión." : "La conexión respondió correctamente.", result.data === false);
      } catch (error) { message(error.message, true); }
    });
    body.querySelector("[data-logs]").addEventListener("click", async () => {
      const panel = body.querySelector("[data-logs-panel]");
      panel.innerHTML = '<p class="provider-empty">Cargando registros…</p>';
      try {
        const payload = await post(`${path}?operation=logs`, {});
        const logs = payload?.data?.logs || payload?.logs || [];
        panel.innerHTML = logs.length ? `<div class="table-wrap"><table class="data-table">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Estado</th><th>Documentos nuevos</th><th>Total</th><th>Errores</th></tr></thead>
          <tbody>${logs.map(log => `<tr>
            <td>${esc(log.update_date || log.create_date || "—")}</td>
            <td>${esc(log.task_type || "sync")}</td>
            <td><span class="badge ${log.status === "success" ? "" : "gray"}">${esc(statusLabel(log.status))}</span></td>
            <td>${esc(log.new_docs_indexed ?? 0)}</td>
            <td>${esc(log.total_docs_indexed ?? 0)}</td>
            <td>${esc(log.error_count ?? 0)}${log.error_msg ? ` <span class="muted">· ${esc(String(log.error_msg).slice(0, 120))}</span>` : ""}</td>
          </tr>`).join("")}</tbody>
        </table></div>` : '<p class="provider-empty">Todavía no hay sincronizaciones registradas.</p>';
      } catch (error) { panel.innerHTML = `<p class="provider-empty error">${esc(error.message)}</p>`; }
    });
    body.querySelector("[data-rebuild]").addEventListener("click", async () => {
      const datasetId = body.querySelector("[data-dataset]").value;
      if (!datasetId) return message("Asociá una fuente de conocimiento antes de sincronizar.", true);
      message("Iniciando la sincronización…");
      try { await post(`${path}?operation=rebuild`, { datasetId }); message("Sincronización iniciada."); }
      catch (error) { message(error.message, true); }
    });
    body.querySelector("[data-delete]").addEventListener("click", async () => {
      if (!confirm(`¿Eliminar la fuente "${name}"? Esta acción no se puede deshacer.`)) return;
      message("Eliminando…");
      try { await api(path, { method: "DELETE" }); changed = true; dialog.close(); }
      catch (error) { message(error.message, true); }
    });
  }

  dialog.showModal();
  void paint();
}
