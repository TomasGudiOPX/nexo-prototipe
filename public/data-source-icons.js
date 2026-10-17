// External data source catalog, mirroring RAGFlow's DataSourceKey registry
// (ragflow-be/web/src/pages/user-setting/data-source/constant/index.tsx).
// `svg:` marks ship as /data-source-logos/<name>.svg, `font:` resolves through
// the iconfont sprite, and `glyph:` is an inline lucide path.

const GLYPHS = {
  rss: '<path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  book: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
};

// Order matches RAGFlow's `generateDataSourceInfo` so the grid reads the same.
const SOURCES = {
  rss: { name: "RSS", description: "Conectá un feed RSS o Atom público y sincronizá sus entradas en una fuente.", icon: "glyph:rss" },
  sitemap: { name: "Sitemap", description: "Conectá un sitemap.xml público para sincronizar las páginas web y PDFs listados.", icon: "glyph:globe" },
  google_cloud_storage: { name: "Google Cloud Storage", description: "Conectá un bucket de Google Cloud Storage para importar y sincronizar archivos.", icon: "svg:google-cloud-storage" },
  oci_storage: { name: "Oracle Storage", description: "Conectá un bucket de Oracle Cloud Object Storage para importar y sincronizar archivos.", icon: "svg:oracle-storage" },
  r2: { name: "R2", description: "Conectá un bucket de Cloudflare R2 para importar y sincronizar archivos.", icon: "svg:r2" },
  s3: { name: "S3", description: "Conectá un bucket de AWS S3 para importar y sincronizar los archivos almacenados.", icon: "svg:s3" },
  notion: { name: "Notion", description: "Sincronizá páginas y bases de datos de Notion para recuperación de conocimiento.", icon: "svg:notion" },
  discord: { name: "Discord", description: "Vinculá tu servidor de Discord para acceder y analizar los mensajes.", icon: "svg:discord" },
  xquik: { name: "Xquik", description: "Buscá publicaciones de X con Xquik y sincronizá los resultados en una base de conocimiento.", icon: "glyph:search" },
  confluence: { name: "Confluence", description: "Integrá tu espacio de Confluence para buscar documentación.", icon: "svg:confluence" },
  google_drive: { name: "Google Drive", description: "Conectá Google Drive por OAuth y sincronizá carpetas o unidades específicas.", icon: "svg:google-drive" },
  feishu_wiki: { name: "Feishu Wiki", description: "Sincronizá los nodos de archivo descargables de un subárbol de Feishu Wiki.", icon: "glyph:book" },
  gmail: { name: "Gmail", description: "Conectá Gmail por OAuth para sincronizar correos.", icon: "svg:gmail" },
  rest_api: { name: "REST API", description: "Conectá cualquier endpoint REST como fuente mediante un conector configurable.", icon: "svg:rest-api" },
  moodle: { name: "Moodle", description: "Conectá tu LMS Moodle para sincronizar contenido de cursos, foros y recursos.", icon: "svg:moodle" },
  teams: { name: "Microsoft Teams", description: "Conectá Microsoft Teams vía Microsoft Graph para sincronizar publicaciones de canales.", icon: "svg:teams" },
  slack: { name: "Slack", description: "Conectá tu espacio de Slack para sincronizar mensajes e hilos de canales.", icon: "svg:slack" },
  sharepoint: { name: "SharePoint", description: "Conectá un sitio de SharePoint vía Microsoft Graph para sincronizar sus bibliotecas de documentos.", icon: "svg:sharepoint" },
  jira: { name: "Jira", description: "Conectá tu espacio de Jira para sincronizar incidencias, comentarios y adjuntos.", icon: "svg:jira" },
  webdav: { name: "WebDAV", description: "Conectá servidores WebDAV para sincronizar archivos.", icon: "svg:webdav" },
  dropbox: { name: "Dropbox", description: "Conectá Dropbox para sincronizar archivos y carpetas de una cuenta.", icon: "svg:dropbox" },
  box: { name: "Box", description: "Conectá tu Box para sincronizar archivos y carpetas.", icon: "svg:box" },
  airtable: { name: "Airtable", description: "Conectá Airtable y sincronizá los registros de una tabla de un espacio de trabajo.", icon: "svg:airtable" },
  dingtalk_ai_table: { name: "Dingtalk AI Table", description: "Conectá Dingtalk AI Table y sincronizá los registros de una tabla.", icon: "svg:dingtalk-ai-table" },
  gitlab: { name: "GitLab", description: "Conectá GitLab para sincronizar repositorios, incidencias y merge requests.", icon: "svg:gitlab" },
  asana: { name: "Asana", description: "Conectá Asana y sincronizá los elementos de un espacio de trabajo.", icon: "svg:asana" },
  github: { name: "GitHub", description: "Conectá GitHub para sincronizar pull requests e incidencias.", icon: "font:GitHub" },
  imap: { name: "IMAP", description: "Conectá un buzón IMAP para sincronizar correos.", icon: "glyph:mail" },
  bitbucket: { name: "Bitbucket", description: "Conectá Bitbucket para sincronizar contenido de pull requests.", icon: "svg:bitbucket" },
  azure_devops: { name: "Azure DevOps", description: "Conectá Azure DevOps para sincronizar archivos de repositorios y pull requests.", icon: "svg:azure-devops" },
  zendesk: { name: "Zendesk", description: "Conectá Zendesk para sincronizar tickets, artículos y otro contenido.", icon: "svg:zendesk" },
  zotero: { name: "Zotero", description: "Conectá tu biblioteca Zotero para sincronizar adjuntos PDF de papers y referencias.", icon: "glyph:book" },
  seafile: { name: "SeaFile", description: "Conectá tu servidor SeaFile para sincronizar archivos y documentos de tus bibliotecas.", icon: "svg:seafile" },
  mysql: { name: "MySQL", description: "Conectá una base MySQL y sincronizá datos de tablas mediante consultas SQL.", icon: "svg:mysql" },
  postgresql: { name: "PostgreSQL", description: "Conectá una base PostgreSQL y sincronizá datos de tablas mediante consultas SQL.", icon: "svg:postgresql" },
  bigquery: { name: "BigQuery", description: "Conectá Google BigQuery para sincronizar filas de una tabla o de una consulta GoogleSQL.", icon: "svg:bigquery" },
  onedrive: { name: "OneDrive", description: "Conectá OneDrive o OneDrive for Business para indexar archivos y carpetas.", icon: "svg:onedrive" },
  outlook: { name: "Outlook", description: "Conectá buzones de Outlook / Microsoft 365 e indexá mensajes.", icon: "glyph:mail" },
  salesforce: { name: "Salesforce", description: "Conectá una organización de Salesforce e indexá registros CRM vía SOQL.", icon: "svg:salesforce" },
  azure_blob: { name: "Azure Blob Storage", description: "Indexá blobs de un contenedor de Azure Blob Storage.", icon: "svg:azure-blob" },
};

const initials = value => String(value ?? "?").replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "?";

// See provider-icons.js: the sprite loads on DOMContentLoaded, so reference the
// symbol optimistically until it is present.
const spriteReady = () => typeof document !== "undefined" && document.querySelector('symbol[id^="icon-"]') !== null;

export const DATA_SOURCE_IDS = Object.keys(SOURCES);

export function dataSourceInfo(id) {
  return SOURCES[id] || { name: id || "Fuente desconocida", description: "Sin descripción para este conector.", icon: "" };
}

export function sourceLogo(id, size = 28) {
  const [kind, value] = dataSourceInfo(id).icon.split(":");
  if (kind === "svg") {
    return `<img class="provider-logo provider-logo-file" src="/data-source-logos/${value}.svg" alt="" width="${size}" height="${size}" loading="lazy" decoding="async">`;
  }
  if (kind === "glyph" && GLYPHS[value]) {
    return `<svg class="provider-logo" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPHS[value]}</svg>`;
  }
  if (kind === "font" && (!spriteReady() || document.getElementById(`icon-${value}`))) {
    return `<svg class="provider-logo provider-logo-symbol" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><use href="#icon-${value}"></use></svg>`;
  }
  return `<span class="provider-logo provider-logo-initials" style="width:${size}px;height:${size}px" aria-hidden="true">${initials(dataSourceInfo(id).name)}</span>`;
}
