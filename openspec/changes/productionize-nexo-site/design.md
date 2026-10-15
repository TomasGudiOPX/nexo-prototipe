## Context

The primary route serves a static NEXO prototype in an iframe. Its current
navigation and arrays are demo-only. The existing NEXO backend already proxies
RAGFlow and has authenticated sessions, SQLite, and encryption helpers.
RAGFlow does not have a native product-project abstraction, but it owns
datasets, documents, assistants, providers, models, MCP, and data sources.

## Decisions

### Separate site areas instead of a configuration modal

Replace the modal with first-class navigation areas. Home summarizes real
connection and recent activity. Knowledge presents datasets/documents. Assistants
presents RAGFlow assistants. Configuration is restricted to settings.

### Add local workspaces

Create SQLite workspace records and join tables for users, datasets, and
assistants. A workspace stores NEXO context only and references RAGFlow IDs.

### Persist observable activity

Store NEXO events for configuration changes and RAGFlow operations. Activity
and Reports read these events plus current RAGFlow resource state; unavailable
metrics remain unavailable rather than fabricated.

### Proxy sensitive provider management and own API-key lifecycle

Site-admin routes proxy RAGFlow provider/model operations server-side and
sanitize responses. NEXO agent keys are random one-time secrets stored as hashes
with scope and revocation metadata. They are never confused with RAGFlow's
service key or provider credentials.

## Risks / Trade-offs

- Local workspace membership needs authorization checks for every referenced
  RAGFlow resource.
- RAGFlow's provider API varies by version; NEXO must capability-gate controls.
- Reports are deliberately limited to verifiable signals until a supported usage
  analytics source exists.

## Migration Plan

1. Replace demo navigation/data with API-backed read-only area shells.
2. Add workspace, activity, and NEXO API-key schema plus protected APIs.
3. Add RAGFlow provider/model proxy APIs and settings views.
4. Move operations from the old modal to their corresponding areas and remove it.
5. Validate roles, unavailable RAGFlow, empty state, secret redaction, and
   migration of existing deployments.
