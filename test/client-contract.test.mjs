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

test("assistants screen creates through a modal and shares with workspace members", () => {
  assert.match(workspaceShell, /Crear asistente/);
  assert.match(workspaceShell, /Tus asistentes/);
  assert.match(workspaceShell, /Compartidos con vos/);
  assert.match(workspaceShell, /data-unbind-assistant/);
  assert.match(workspaceShell, /data-unbind-dataset/);
  assert.match(workspaceShell, /button:not\(\.resource-unbind\)/);
  assert.match(workspaceShell, /workspaceId: state\.workspaceId/);
  assert.doesNotMatch(workspaceShell, /Crear asistente en RAGFlow/);
  // Creation and sharing reuse the same modal as "+ Nuevo espacio".
  assert.match(workspaceShell, /id="openCreateAssistantBtn"/);
  assert.match(workspaceShell, /openFormModal/);
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
