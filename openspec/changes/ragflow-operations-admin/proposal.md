# Proposal

## Why

NEXO currently provides a read/query experience over an already configured RAGFlow instance, but operators must leave NEXO to configure users, datasets, ingestion sources, and assistant tools. A focused operations panel in the same monorepo will make initial setup and ongoing administration available alongside the main app, while keeping the resource-heavy RAGFlow engine an external configured service.

## What Changes

- Add NEXO user accounts and role-based access, with a `site-admin` role as the only role allowed into the operations panel.
- Add an operations panel for RAGFlow setup: dataset lifecycle and document ingestion/indexing, assistant configuration, and operational status needed to prepare the main experience.
- Add management of multiple RAGFlow Data Sources, including connection, dataset association, sync/rebuild actions, and status visibility, using capabilities supported by the connected RAGFlow instance.
- Add MCP server registration and tool discovery/connection checks. Site admins approve tools for use in NEXO; main-site users can invoke only approved tools through supported assistant experiences.
- Keep RAGFlow itself external: NEXO owns its UI/API, authentication, and authorization in this repository and talks to RAGFlow through its API. Do not vendor or require the sibling `ragflow-be` checkout.

## Capabilities

### New Capabilities

- `identity-and-access`: NEXO accounts, `site-admin` role, secure sign-in, and authorization boundaries for the operations panel and main site.
- `ragflow-operations`: Site-admin workflows for configuring datasets, documents, indexing, and assistants against a connected RAGFlow service.
- `data-source-management`: Management of multiple RAGFlow-supported ingestion sources and their dataset sync lifecycle.
- `mcp-management`: Site-admin registration and approval of remote MCP servers/tools and controlled availability to main-site assistant users.

### Modified Capabilities

None. The repository currently has no maintained specs in `openspec/specs/`; the completed `nexo-monorepo-docker` change contains historical change-local specs only.

## Impact

- NEXO React Router UI and server routes, including new authenticated operations-panel routes and main-site MCP/tool experiences.
- A persistent NEXO user/configuration store and deployment configuration for its credentials and migrations.
- RAGFlow API integration for dataset/document/assistant operations, Data Source lifecycle, and MCP registration/tool discovery as supported by the deployed RAGFlow version.
- Docker Compose and setup documentation for the NEXO-owned store and secure first-admin bootstrap. RAGFlow services remain separately provisioned and are addressed by URL/API key.
- Existing public main-site routes and API behavior must be checked for compatibility when authentication and user-specific permissions are introduced.
