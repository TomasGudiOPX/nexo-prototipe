# NEXO production operations

## Navigation and supported scope

The main route opens the original Centro de Inteligencia design. The other sections embed existing workspace, document, assistant, activity, report and configuration capabilities in the NEXO shell. Seeded construction sections have been removed.

See [business analysis and user flow](nexo-live-user-flow.md) for capability mapping, permissions, setup and recovery. This supersedes the former demo-preservation description.

Deep links use vista=dashboard, workspaces, knowledge, assistant, assistants, activity, reports or configuration, with workspaceId, dataset and assistantId context where applicable. Legacy projects/project, documents and alerts routes resolve to workspaces, knowledge and activity. The standalone workspace entry remains compatible.

The graph and center panels consume authorized data. Empty sources do not display invented graph entities. Attention uses actual failed activity events. No API provides a verified synchronization percentage or last-sync timestamp. MCP remains Por incorporar, with no execution.

The revised implementation still needs acceptance coverage and authenticated desktop/mobile visual review. Earlier successful checks covered the superseded revision.

## RAGFlow connection and providers

Set `RAGFLOW_BASE_URL` and `RAGFLOW_API_KEY` for deployment-managed configuration,
or sign in as a site administrator and open Configuration → RAGFlow connection
settings. NEXO encrypts a site-managed API key at rest and never returns it to the
browser. The key is sent only from the NEXO server to RAGFlow.

Connection settings are embedded directly in Configuración. Legacy /admin entries redirect to that section; there is no separate operations-panel navigation.

Because RAGFlow's own web UI is not part of this deployment, Conexión RAGFlow can also mint a replacement RAGFlow API key through the connected instance's tenant-scoped token endpoint. The control only appears when the instance is reachable and exposes that contract, so it works against a local stack, a Docker deployment on a VPS, or a reachable RAGFlow Cloud instance alike. NEXO stores the generated key encrypted and keeps using it from then on; the previous key stays valid in RAGFlow until it is removed there.

## NEXO accounts

Configuration → Usuarios y administradores lists every NEXO account and, for site administrators only, creates accounts and changes role, organisational area, active state, password or workspace access through /api/admin/users. Four permission roles exist: site-admin (full control), knowledge-manager (datasets, documents and assistants inside their own workspaces, no site configuration), user (works with granted workspaces) and auditor (read-only; every mutation is refused by the API). The organisational area is a directory label only. Each row shows the workspaces the account can reach and **Espacios de trabajo** opens a member picker that grants or revokes plain membership; ownership is created with the workspace and is never revoked from the directory, and an unknown workspace id is ignored. Accounts must be created here before a workspace can add them as members by email. The first administrator still comes from the NEXO_BOOTSTRAP_* variables on a fresh database; the last active site administrator cannot be deactivated or demoted.

The connected RAGFlow version exposes /api/v1/models and /api/v1/providers. The obsolete /api/v1/llm/list and /api/v1/llm/set_api_key paths are not registered and caused the reported 404. Provider catalogs and configured models now use the current routes. Credential verification uses POST /providers/:provider/connection without saving; saving adds the provider if necessary and creates a named provider instance. Provider secrets are sent only from the server and are never included in list responses. Some providers require an explicit model or additional provider-specific credentials.

Provider, data-source and connection sections load independently so upstream model failures do not prevent editing the connection.

## Activity and reports

Activity contains stored workspace and operation events. Reports use stored event
counts and workspace state. Token usage and query volume are reported as
unavailable because the connected RAGFlow API does not provide a verified source
for those measures.

## Data migration and backup

SQLite migration 3 runs automatically on application start and preserves existing
users, sessions, settings, and operations data. Back up the configured
`NEXO_DATA_DIR` volume before upgrades and include it in the deployment's normal
restore procedure.
