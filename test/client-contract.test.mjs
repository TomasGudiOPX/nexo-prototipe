import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const prototype = readFileSync(resolve(root, "public/nexo-prototipo.html"), "utf8");
const workspace = readFileSync(resolve(root, "public/nexo-operations.js"), "utf8");
const admin = readFileSync(resolve(root, "public/connection-settings.js"), "utf8");
const nginx = readFileSync(resolve(root, "nginx.conf"), "utf8");
const workspaceHtml = readFileSync(resolve(root, "public/workspace.html"), "utf8");
const home = readFileSync(resolve(root, "app/routes/home.tsx"), "utf8");
const ragflow = readFileSync(resolve(root, "public/nexo-ragflow.js"), "utf8");
const workspaceShell = readFileSync(resolve(root, "public/workspace.js"), "utf8");
const workspaceModals = readFileSync(resolve(root, "public/workspace-modals.js"), "utf8");
const providerCss = readFileSync(resolve(root, "public/provider.css"), "utf8");
const providerModal = readFileSync(resolve(root, "public/provider-modal.js"), "utf8");
const providerIcons = readFileSync(resolve(root, "public/provider-icons.js"), "utf8");
const dataSourceIcons = readFileSync(resolve(root, "public/data-source-icons.js"), "utf8");
const dataSourceModal = readFileSync(resolve(root, "public/data-source-modal.js"), "utf8");
const routesSource = readFileSync(resolve(root, "app/routes.ts"), "utf8");

test("Configuration opens the in-site operational workspace", () => {
  assert.match(prototype, /'configuration'|window\.nexoWorkspaceArea\('configuration'\)/);
  for (const area of ["knowledge", "assistants", "documents", "sources", "mcp"]) assert.match(workspace, new RegExp(`render${area[0].toUpperCase()}${area.slice(1)}`));
});

test("connection controls stay gated and preserve an empty API-key replacement", () => {
  assert.match(workspace, /user\?\.role === "site-admin"/);
  assert.match(admin, /name="apiKey"/);
  assert.match(admin, /Se conserva la clave existente/);
  assert.match(workspace, /No se pudo cargar esta vista/);
});

test("root restores the original intelligence center with its RAGFlow graph and no redirect loop", () => {
  assert.match(nginx, /location = \/\s*\{[\s\S]*?proxy_pass http:\/\/nexo-api:3000;/);
  assert.match(nginx, /location = \/nexo-prototipo\.html\s*\{[\s\S]*?Cache-Control "no-store"/);
  assert.match(nginx, /location = \/nexo-ragflow\.js\s*\{[\s\S]*?Cache-Control "no-store"/);
  assert.doesNotMatch(nginx, /location = \/\s*\{\s*try_files \/nexo-prototipo\.html/);
  assert.doesNotMatch(workspaceHtml, /http-equiv=["']refresh/i);
  assert.match(home, /return redirect\(`\/nexo-prototipo\.html\$\{new URL\(request.url\).search\}`\)/);
  assert.doesNotMatch(prototype, /http-equiv=["']refresh/i);
  assert.match(prototype, /id="brainDashboard"/);
  assert.match(prototype, /nexo-ragflow\.js/);
  assert.match(ragflow, /api\/datasets\/\$\{encodeURIComponent\(datasetId\)\}\/graph/);
  assert.match(ragflow, /api\/datasets\/\$\{encodeURIComponent\(datasetId\)\}\/chat/);
  assert.match(ragflow, /state\.screen = \$\("screen-" \+ screen\) \? screen : "dashboard"/);
  assert.match(ragflow, /navigation\.querySelectorAll\("button"\)\.forEach\(item => \{ item\.hidden = false; \}\)/);
  assert.match(ragflow, /state\.recentEvents\.slice\(0, 4\)/);
  assert.match(ragflow, /api\/workspaces/);
});

test("model providers ship search, brand marks, and a modal connection manager", () => {
  assert.match(prototype, /<link rel="stylesheet" href="\/provider\.css">/);
  assert.match(prototype, /<script src="\/iconfont\.js" defer><\/script>/);
  assert.match(workspaceShell, /openProviderModal/);
  assert.match(workspaceShell, /id="providerSearch"/);
  assert.match(providerIcons, /provider-logos\/\$\{fileSlug\}\.svg/);
  assert.match(providerIcons, /#icon-\$\{symbolSlug\}/);
  assert.match(providerIcons, /provider-logo-file/);
  assert.match(providerIcons, /provider-logo-symbol/);
  assert.match(providerIcons, /fill="currentColor"/);
  // The sprite is injected on DOMContentLoaded; renders must not race it.
  assert.match(providerIcons, /spriteReady/);
  assert.match(dataSourceIcons, /spriteReady/);
  assert.match(providerModal, /dialog\.showModal\(\)/);
  assert.match(providerModal, /data-add-toggle/);
  assert.match(providerModal, /data-open-instance/);
  assert.match(providerCss, /\.provider-grid\{/);
  assert.match(providerCss, /\.nexo-provider\{/);
  assert.match(providerCss, /\.provider-logo-file\{background:#eef1ec/);
  assert.match(providerCss, /\.provider-logo-symbol\{color:#e9eeeb\}/);
});

test("data sources replace the API-key tab with a searchable, logo-driven catalog", () => {
  // Tab order: Fuentes de datos · Proveedores y modelos · Usuarios y administradores · Conexión.
  assert.match(workspaceShell, /\[\s*"sources", "Fuentes de datos"\]/);
  assert.match(workspaceShell, /\["providers", "Proveedores y modelos"\]/);
  assert.match(workspaceShell, /\["users", "Usuarios y administradores"\]/);
  assert.match(workspaceShell, /\["connection", "Conexión"\]/);
  // Tabs are a tablist so the shell's .btn injection skips them.
  assert.match(workspaceShell, /role="tablist"/);
  assert.match(workspaceShell, /closest\('\[role="tablist"\]'\)/);
  assert.doesNotMatch(workspaceShell, /data-config-nav="keys"/);
  assert.doesNotMatch(workspaceShell, /Claves API para agentes NEXO/);
  assert.match(workspaceShell, /id="sourceSearch"/);
  assert.match(workspaceShell, /openDataSourceForm/);
  assert.match(workspaceShell, /openConnectorDetail/);
  assert.match(dataSourceIcons, /data-source-logos\/\$\{value\}\.svg/);
  assert.match(dataSourceIcons, /DATA_SOURCE_IDS/);
  assert.match(dataSourceModal, /data-create-form/);
  assert.match(dataSourceModal, /operation=logs/);
  assert.match(dataSourceModal, /operation=rebuild/);
  assert.match(providerCss, /\.ds-group\{/);
  assert.match(providerCss, /\.config-tabs button\[role=tab\]/);
  assert.doesNotMatch(routesSource, /api\/admin\/keys/);
});

test("sign-in runs on a dedicated screen that gates the shell until the session is valid", () => {
  const loginHtml = readFileSync(resolve(root, "public/login.html"), "utf8");
  const loginCss = readFileSync(resolve(root, "public/login.css"), "utf8");
  const loginJs = readFileSync(resolve(root, "public/login.js"), "utf8");
  // La pantalla vive en su propio archivo y el shell la enlaza.
  assert.match(loginHtml, /<link rel="stylesheet" href="\/login\.css">/);
  assert.match(loginHtml, /<script type="module" src="\/login\.js"><\/script>/);
  assert.match(loginHtml, /id="loginForm"/);
  assert.match(loginHtml, /id="loginPassword"[^>]*autocomplete="current-password"/);
  assert.match(prototype, /<link rel="stylesheet" href="\/login\.css">/);
  assert.match(prototype, /<script type="module" src="\/login\.js"><\/script>/);
  assert.match(prototype, /id="nexoGate"/);
  // Sin sesión válida ni el shell ni el gate muestran la aplicación.
  assert.match(loginCss, /html:not\(\.nexo-authed\) #app\{display:none\}/);
  assert.match(loginCss, /html\.nexo-authed #nexoGate\{display:none\}/);
  assert.match(loginJs, /fetch\("\/api\/auth\/login"/);
  assert.match(loginJs, /document\.documentElement\.classList\.add\("nexo-authed"\)/);
  assert.match(loginJs, /if \(!user\) \{ goToLogin\(returnTo\); return; \}/);
  // Sólo se vuelve al propio shell: no hay redirección abierta.
  assert.match(loginJs, /url\.pathname !== SHELL_PATH\) return SHELL_PATH/);
  // El diálogo modal anterior se retiró del shell.
  assert.doesNotMatch(ragflow, /showModal\(\)[\s\S]{0,80}nexoSignInDialog/);
  assert.doesNotMatch(ragflow, /nexoSignInDialog/);
  assert.match(ragflow, /window\.nexoAuth\?\.goToLogin\?\.\(location\.href\)/);
  // El servidor estático sirve la pantalla sin caché.
  assert.match(nginx, /location = \/login\.html\s*\{[\s\S]*?Cache-Control "no-store"/);
});

test("assistants screen creates through a modal and shares with workspace members", () => {
  assert.match(workspaceShell, /Crear asistente/);
  assert.match(workspaceShell, /Tus asistentes/);
  assert.match(workspaceShell, /Compartidos con vos/);
  assert.match(workspaceShell, /data-unbind-assistant/);
  assert.match(workspaceShell, /data-unbind-dataset/);
  assert.match(workspaceShell, /button:not\(\.resource-unbind\)/);
  // Creation and sharing reuse the same modal as "+ Nuevo espacio".
  assert.match(workspaceShell, /id="openCreateAssistantBtn"/);
  assert.match(workspaceShell, /openFormModal/);
  // A site admin can also create a collective assistant (no workspace) and link
  // it to any workspace later; plain members keep creating inside their space.
  assert.match(workspaceShell, /canCreateCollective/);
  assert.match(workspaceShell, /Sin espacio \(colectivo\)/);
  assert.match(workspaceShell, /canCreateCollective \? String\(values\.workspaceId \|\| ""\) : state\.workspaceId/);
  assert.doesNotMatch(workspaceShell, /Vinculá una fuente para crear asistentes/);
  assert.doesNotMatch(workspaceShell, /Crear asistente en RAGFlow/);
  assert.match(workspaceShell, /data-share-assistant/);
  assert.match(workspaceShell, /type: "checkboxes"/);
  // The shared modal helper grew the field types this screen needs.
  assert.match(workspaceModals, /type === "select"/);
  assert.match(workspaceModals, /type === "checkboxes"/);
  assert.match(workspaceModals, /onSubmit\(Object\.fromEntries\(formData\.entries\(\)\), formData\)/);
});

test("user directory grants workspace access per account", () => {
  assert.match(workspaceShell, /data-user-action="workspaces"/);
  assert.match(workspaceShell, /action: "workspaces"/);
  assert.match(workspaceShell, /config-row-spaces/);
  assert.match(workspaceShell, /Propietario: conserva el acceso/);
  assert.match(workspaceShell, /state\.userAdminWorkspaces/);
  assert.match(routesSource, /api\/admin\/users/);
});

test("user directory exposes roles and organisational areas", () => {
  assert.match(workspaceShell, /NEXO_ROLE_OPTIONS/);
  assert.match(workspaceShell, /knowledge-manager/);
  assert.match(workspaceShell, /auditor/);
  assert.match(workspaceShell, /data-user-field="role"/);
  assert.match(workspaceShell, /data-user-field="area"/);
  assert.match(workspaceShell, /NEXO_AREA_OPTIONS/);
  assert.match(workspaceShell, /recursos-humanos/);
  assert.match(providerCss, /\.config-inline-select\{/);
  // The interface mirrors the server permission helpers.
  assert.match(workspaceShell, /canMutate\(\)/);
  assert.match(workspaceShell, /canManageKnowledge\(\)/);
});

test("document rows expose preview, download and details as icon actions backed by the file route", () => {
  const table = readFileSync(resolve(root, "public/document-table.js"), "utf8");
  const preview = readFileSync(resolve(root, "public/document-preview.js"), "utf8");
  const fileRoute = readFileSync(resolve(root, "app/routes/api.admin.datasets.$datasetId.documents.$documentId.ts"), "utf8");
  // Row actions are icons, not the old "Detalles" text button.
  assert.doesNotMatch(table, />Detalles</);
  assert.match(table, /data-preview="\$\{esc\(row\.id\)\}"/);
  assert.match(table, /openDocumentPreview/);
  // Downloads reuse the same endpoint with the attachment flag.
  assert.match(table, /download=1/);
  assert.match(preview, /export function openDocumentPreview/);
  assert.match(preview, /showModal\(\)/);
  // DOCX preview unzips the OOXML container in place (no bundler dependency).
  assert.match(preview, /extractDocxText/);
  assert.match(preview, /deflate-raw/);
  // EML preview decodes headers and MIME parts instead of dumping the source.
  assert.match(preview, /export function parseEml/);
  assert.match(preview, /quotedPrintableToBytes/);
  assert.match(preview, /multipart\//);
  // The proxy must not echo RAGFlow's generic octet-stream for a PDF.
  const fileServer = readFileSync(resolve(root, "app/server/document-file.server.ts"), "utf8");
  assert.match(fileServer, /pdf:\s*"application\/pdf"/);
  assert.match(fileServer, /eml:\s*"text\/plain/);
  assert.match(fileServer, /application\/octet-stream/i);
  assert.match(fileServer, /download \? "attachment" : "inline"/);
  // Both scopes proxy the stored file and gate access.
  assert.match(fileRoute, /requireKnowledgeManager/);
  assert.match(routesSource, /api\/admin\/datasets\/:datasetId\/documents\/:documentId/);
  assert.match(routesSource, /api\/workspaces\/:workspaceId\/datasets\/:datasetId\/documents\/:documentId/);
  assert.match(prototype, /document-preview\.css/);
  assert.match(nginx, /document-preview/);
});
