# NEXO: business analysis and user flow

## Product scope

NEXO organizes access to business knowledge: teams connect their documents and assistants, ask questions with returned evidence, and review recorded operations. RAGFlow remains the source for document content, processing and assistant responses. NEXO supplies identity, workspace membership, resource bindings and operational visibility.

This is a knowledge operations product. The existing services do not establish construction project budgets, contractual approvals, financial progress or a business alert engine. Those capabilities must not be implied by seeded records. The one deliberate exception is the usage analytics block in Reportes: it is a labelled demonstration, marked as such in the interface and in the API payload (`isDemo` plus a separate `demo` object), and it never replaces the measured event and workspace counts. MCP is **Por incorporar**.

## Section mapping

| Original section | Operational replacement | User outcome |
| --- | --- | --- |
| Centro de Inteligencia | Original design with authorized graph, counts, activity and failed operations | Understand connected knowledge and navigate to an action |
| Proyectos | Espacios de trabajo, memberships and resource bindings | Organize people and permitted sources |
| Documentos | Dataset documents, upload and processing | Prepare knowledge for retrieval |
| IA Asistente | Selected-source conversation with returned evidence | Ask a question and inspect supporting excerpts |
| Asistentes disponibles | Create an assistant for the selected workspace, share it, and list own/shared assistants | Create, share and use assistants authorized for the workspace |
| Alertas / notifications | Recorded activity | Inspect operations and failures actually recorded |
| Reportes | Measured event and workspace counts, plus a labelled demonstration of usage analytics | Understand activity volume; usage figures stay illustrative until RAGFlow exposes analytics |
| Configuración | Existing connection, provider and API-key controls | Configure access and models as administrator |

## Main journey

The workspace selector stays in the top bar across the main screens. Changing it clears the dataset and assistant selections so the next screen uses the new workspace's authorized resources. The top-right profile menu contains account details, Configuración and Cerrar sesión; the sidebar has no separate account/logout entry.

Configuración has selectable Conexión RAGFlow, Proveedores y modelos, Fuentes de datos and Usuarios y administradores sections. The selected section is retained in the URL's config parameter for refresh and browser history.

1. Sign in and enter the Centro de Inteligencia.
2. Select an accessible workspace, dataset and assistant. If none are linked, the interface guides the user to setup instead of presenting demonstration data.
3. Review the source graph, available summary counts and recent activity. Attention shows actual failed events from the activity returned, not a claim that every business risk has been assessed.
4. Open Documentos to inspect the selected source. Administrators can upload and request processing; processing status comes from RAGFlow.
   The Subir documentos modal offers individual files or a folder (including subfolders), previews the selection and total size, and uploads files individually with per-file results. Folder hierarchy is not created in the dataset. Original filenames are retained, and duplicate names are flagged before upload. Unsupported folder pickers fall back to individual file selection. Close the completed modal to refresh documents, then select documents for processing.
5. Open IA Asistente, ask a question and inspect the returned references. An answer without references is explicitly identified as having no returned evidence.
6. Open Actividad to inspect recorded outcomes or Reportes for the available period metrics.

Global search prepares a question in the connected assistant. It does not search an invented local construction catalog or automatically submit a query.

### Document operations table

Documentos uses the RAGFlow table as a reference while retaining NEXO styling. It shows upload date, size, chunks, tokens, retrieval availability, parsing method/pipeline, processing status and reported progress. Each row expands to show returned processing messages, metadata and update time. Unknown values remain explicit.

Search, status filters, sorting and 20/50/100-row pagination apply to the loaded document list (up to 1000 documents). The header checkbox selects the current page, with an indeterminate state for partial selection. A separate control selects all loaded filtered results; selection persists across pages and warns when selected documents are outside the current filters.

Administrators can process pending documents, reprocess non-running documents with confirmation, or stop active non-pipeline jobs. Unsupported actions are omitted and incompatible states are skipped explicitly. Requests show acceptance separately from completion; Actualizar reloads actual RAGFlow progress. Retrieval availability and metadata are read-only in this table.

## Setup and roles

- Administrators configure the RAGFlow connection, providers, data sources and resource bindings; document mutation controls use the existing administrator endpoints.
- Administrators manage NEXO accounts in Configuration → Usuarios y administradores: create accounts, change role or organisational area, activate/deactivate access, reset passwords and grant workspace access. Accounts must exist there before they can be added to a workspace.
- Four permission roles exist. **Administrador del sitio** configures the deployment, providers, data sources, MCP and accounts, and reaches every workspace. **Gestor de conocimiento** creates and edits datasets, uploads and processes documents and works with assistants, but only inside the workspaces they belong to; site configuration stays closed to them. **Usuario** works with the sources and assistants granted through their workspace. **Auditor** reads everything they are granted and changes nothing: every mutation is refused by the API. The organisational area (Gerencia, Recursos Humanos, Comercial, Operaciones, Técnica, Administración y Finanzas, Legal, Sistemas, Calidad, Otra) is a label for the directory; it never grants or removes access.
- Workspace owners manage members where the server permits it.
- Members work with sources and assistants granted through their workspace. Hidden controls are not security boundaries: API authorization remains authoritative.
- Asistentes disponibles is scoped to the selected workspace. **+ Nuevo asistente** opens the same modal as **+ Nuevo espacio**; any user with access to the workspace can create an assistant, which is linked to that workspace and recorded as theirs. The listing groups assistants as **Tus asistentes** and **Compartidos con vos**. A recorded author keeps the assistant private until they use **Compartir** to pick workspace members from the people who already have access to that workspace; those members then see it as shared, site administrators always keep access, and the API refuses a query from anyone who was not granted it. Assistants with no recorded author (created before author tracking, or directly in RAGFlow) stay visible to every member. Linking or unlinking an existing assistant stays with the site admin or the workspace owner.

## Recovery and trust

Empty workspaces, absent datasets, missing assistants, unavailable graph data and API errors are distinct from successful business results. Retry controls should preserve the intended context. Inaccessible requested datasets must not silently become another source. Late responses must not replace a newly selected view.

Activity dates describe events. They do not certify synchronization freshness. Missing usage and freshness information must remain unknown or unavailable, or be presented as an explicitly labelled demonstration that is clearly separated from measured values.

## Business assessment

The strongest supported value is a short path from permitted documents to an evidenced answer, with shared workspace administration. The center is an orientation and navigation screen; its original visual identity is preserved. Operational success means a user can locate the right source, obtain a response, inspect its evidence and recover from missing setup or service errors.

Potential product measures include time to first usable source, processing completion, questions with returned evidence and repeat workspace usage. These are proposed measures, not metrics currently collected or displayed.

## Acceptance status

This document describes the intended implemented scope. The revised assets still require acceptance coverage and authenticated desktop/mobile browser review. Earlier checks of the demo-preservation revision do not establish production readiness for these replacements. Track remaining work in the root OpenSpec change's tasks.md.
