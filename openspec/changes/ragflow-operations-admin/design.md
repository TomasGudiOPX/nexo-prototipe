# Design

## Context

See `proposal.md` for motivation and the four `specs/` files for observable behavior. NEXO is a React Router application with server-side routes and a small RAGFlow HTTP adapter. It currently reads a single RAGFlow URL/API key from server configuration and has no account, session, database, or authorization layer. RAGFlow remains a separately operated service; its engine and resource-heavy dependencies are outside this repository and compose stack.

RAGFlow's public API covers the current NEXO dataset/document/chat flows. Its admin UI also supports Data Sources and MCP server setup, but those flows may use APIs not represented in the Python SDK. MCP registration and agent invocation need to be checked against the actual deployed RAGFlow version before enabling those operations.

## Goals / Non-Goals

**Goals:**

- Keep all NEXO frontend, API, authentication, persistence, and container build inputs in this repository.
- Provide a small-footprint, durable identity/configuration store and enforce `site-admin` authorization on the server.
- Give site admins guided operations for the RAGFlow setup necessary to populate and query NEXO.
- Distinguish ingestion Data Sources from query-time MCP tools and keep their credentials server-side.
- Make unsupported capabilities visible instead of presenting nonfunctional controls.

**Non-Goals:**

- Rebuild or vendor RAGFlow, its admin frontend, or its indexing/storage services.
- Replace RAGFlow's model-provider administration or expose every RAGFlow admin function in NEXO.
- Implement connector drivers that the configured RAGFlow service does not provide.
- Make every discovered MCP tool automatically available to all users.

## Decisions

### NEXO owns users and the authorization boundary

Add a durable local SQLite database mounted as a NEXO Docker volume for accounts, roles, sessions, assistant bindings, source metadata, and NEXO-owned MCP approval state. SQLite fits the current single-instance deployment and avoids adding a second database service. Use schema migrations and document backup/restore; a future multi-replica deployment can replace the store behind the persistence boundary.

Passwords are stored using a modern password hash. Browser sessions use opaque, revocable identifiers in `HttpOnly`, `SameSite` cookies, marked `Secure` in HTTPS deployments; mutations also validate request origin/CSRF protection. Every protected API checks the session and role server-side. The first active `site-admin` is created once from deployment-provided bootstrap settings; credentials are never returned to the browser, and public registration is not added.

### The operations panel is role-gated and narrowly scoped

Keep the NEXO public/main-site routes distinct from `/admin` operations routes. The UI may hide admin navigation for regular users, but server authorization is authoritative. The initial panel covers RAGFlow connection diagnostics, supported dataset/document/indexing operations, assistant-to-dataset configuration, Data Source synchronization, user management, and MCP approval. Advanced provider/model administration links to the configured RAGFlow admin UI when needed.

### NEXO uses a capability-aware RAGFlow adapter

Extend the server-side adapter with typed operations for the required workflows. Keep RAGFlow credentials in server configuration; never send them to the client. Probe the configured instance/version and supported API capabilities, and expose actions only when available. Preserve useful upstream status/error details while filtering secrets. Do not copy RAGFlow handlers or depend on files outside this repository.

Data Source support follows the connector types and lifecycle operations actually exposed by the connected RAGFlow instance. The UI presents connection, dataset association, sync/rebuild state, and logs where those operations are available. A missing API capability is reported as unsupported and remains accessible through the RAGFlow admin link.

### MCP registration and execution are approval-based

Store MCP endpoint, transport, authentication secret, discovered tool descriptions, and explicit per-tool approvals in NEXO's store. Encrypt stored MCP credentials with a deployment-provided NEXO secret; mask them in every response and log. Test connections and refresh discovery before approval. Revocation takes effect on the next invocation.

The main-site assistant may invoke only tools approved by a site admin. Use the connected RAGFlow version's supported MCP/agent API path when it can execute those tools for the selected assistant. Verify that API contract before enabling the capability; do not rely on undocumented endpoints silently. If the deployed service cannot provide supported assistant tool execution, show MCP setup as configured but unavailable for assistant invocation and provide the concrete compatibility reason. Data Sources remain separately managed ingestion integrations.

### Keep deployment self-contained and lightweight

Build the NEXO API and frontend from this repository's Docker context. Persist only NEXO's SQLite data and required secrets in the NEXO deployment. `RAGFLOW_BASE_URL` points to an independently running RAGFlow service; no sibling checkout or RAGFlow container is required by NEXO Compose.

## Risks / Trade-offs

- [RAGFlow Data Source and MCP APIs vary by version and may be admin-UI-specific] → Probe capabilities, verify against the deployed version, and disable unsupported actions with an admin link and clear reason.
- [SQLite volume loss would remove local users and NEXO configuration] → Use a named persistent volume, migrations, and documented backup/restore; never store the only copy of RAGFlow datasets there.
- [A bootstrap password or encryption key may be misconfigured] → Validate required values at startup, avoid logging them, and document rotation/recovery procedures.
- [An MCP tool can perform consequential external actions] → Require explicit per-tool approval, allow revocation, enforce server-side checks on every call, and show tool identity to the user before invocation.
- [Single-file persistence limits horizontal scaling] → Treat single NEXO API instance as the initial supported deployment and keep persistence behind a module boundary for later migration.

## Migration Plan

1. Add the NEXO persistence volume, schema migrations, and required bootstrap/session/encryption settings to the same-repository deployment.
2. On first startup, create the initial admin only if no active admin exists; existing deployments remain usable while an operator configures the new bootstrap values.
3. Add sign-in and server authorization, then protect operations APIs before enabling mutating UI controls.
4. Add supported RAGFlow setup and Data Source operations, followed by MCP registration, approval, and assistant invocation where the connected RAGFlow API supports it.
5. Roll back by disabling the new operations routes and restoring the previous application image; preserve the SQLite volume for a forward fix or explicit data export.

## Open Questions

None that block the proposed contract. Exact RAGFlow API coverage is a discovery/compatibility task and unsupported workflows must be surfaced explicitly.
