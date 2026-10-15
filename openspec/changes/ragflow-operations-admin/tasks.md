# Tasks

## 1. NEXO persistence and identity foundation

- [ ] 1.1 Add the SQLite persistence boundary, migrations, persistent Docker volume, and backup/restore documentation; verify a fresh compose deployment creates the database and retains it across container recreation.
- [ ] 1.2 Implement password hashing, sign-in/out, revocable secure sessions, CSRF/origin checks, and one-time first-admin bootstrap; verify sign-in, logout, bootstrap-once, and secret redaction flows.
- [ ] 1.3 Add server-side role guards to protected route loaders/actions and APIs; verify anonymous and regular-user requests cannot access or mutate admin resources.
- [ ] 1.4 Implement site-admin user management and last-admin protection; verify user creation, role changes, deactivation, and rejection of removing the final active admin.
- [ ] 1.5 Add sign-in and user-management screens with accessible validation and error states; verify site admins can administer accounts and regular users cannot reach admin controls.

## 2. RAGFlow operations panel

- [ ] 2.1 Add server-side RAGFlow capability/connection diagnostics and sanitized errors; verify reachable, invalid-credential, unavailable, and unsupported-capability states without exposing the API key.
- [ ] 2.2 Implement supported dataset list/create/update/delete and configuration views through the NEXO adapter; verify operations against the configured RAGFlow API and graceful handling of unsupported operations.
- [ ] 2.3 Implement document upload, processing/retry actions, status refresh, and error display; verify a document reaches visible processing and terminal states.
- [ ] 2.4 Implement supported assistant list/create/update and dataset/model/retrieval binding workflows; verify a saved assistant is selectable and queryable from the main site.
- [ ] 2.5 Add the operations overview and dataset/document/assistant screens; verify loading, empty, error, and completed states and document setup guidance in the README.

## 3. Data Source management

- [ ] 3.1 Confirm the configured RAGFlow version's supported Data Source API surface and map connector capabilities into the adapter; verify each advertised action against that API and label unavailable actions with the compatibility reason.
- [ ] 3.2 Implement protected source credential storage, connection CRUD, dataset association, and credential masking; verify secrets are absent from API responses and logs.
- [ ] 3.3 Implement supported source sync/rebuild/status/log workflows; verify successful, running, and failed sync states are visible and actionable.
- [ ] 3.4 Add Data Source catalog, configuration, and sync screens; verify source ingestion is clearly distinct from MCP tools and document required RAGFlow connector prerequisites.

## 4. MCP management and main-site availability

- [ ] 4.1 Verify the deployed RAGFlow version's supported MCP registration and assistant tool-invocation contract; verify the selected supported path can discover tools and invoke an approved tool before enabling UI controls.
- [ ] 4.2 Implement encrypted server-side MCP credentials, connection checks, discovery, and per-tool admin approvals; verify failed connections remain unavailable and revoked tools cannot be invoked.
- [ ] 4.3 Integrate approved tools with supported NEXO assistant execution; verify a main-site user can invoke an approved tool and cannot invoke an unapproved or unknown tool.
- [ ] 4.4 Add MCP server/tool administration and main-site tool availability UI; verify credentials are masked and the MCP lifecycle is presented separately from Data Sources.

## 5. Deployment and integration

- [x] 5.1 Update same-repository Docker Compose, environment examples, and setup documentation for bootstrap, session, encryption, SQLite persistence, and external RAGFlow URL; verify clean setup does not reference or require `../ragflow-be`.
- [ ] 5.2 Verify end-to-end role boundaries, dataset setup, source synchronization, assistant querying, and MCP approval/invocation across the deployed containers; record unsupported RAGFlow capabilities and their surfaced explanations.
