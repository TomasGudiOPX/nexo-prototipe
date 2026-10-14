# Proposal

## Why

NEXO needs a single repository that builds and runs both its browser frontend and its lightweight backend API. The prior proposal incorrectly treated a pinned RAGFlow image as the backend to include. RAGFlow's Go handlers are coupled to its storage, indexing, and internal engine packages, and its supported runtime starts several memory-heavy services. Copying those handlers alone would not produce a working backend; bringing the complete runtime would violate the resource constraint.

## What Changes

- Keep NEXO's frontend, server API, and deployment configuration in this repository and build the frontend and API as separate containers.
- Selectively use the RAGFlow backend's HTTP API surface for datasets, document chunks/metadata, graph context, and assistant chat through NEXO's server-side adapter.
- Keep the adapter and NEXO-specific routes as the deployable backend; pass RAGFlow credentials only to that API container.
- Exclude RAGFlow's Go handlers and engine internals, Python SDK, admin frontend, indexing/storage services, and persistent volumes. The handlers are not separable from their internal dependencies, and the Python SDK duplicates the existing TypeScript HTTP adapter.
- Connect to an already-running RAGFlow instance through configurable API/admin URLs. Do not start a RAGFlow image or supporting services from default Compose.
- Keep the RAGFlow admin UI as an independently configured browser link.

## Capabilities

### New Capabilities

- `nexo-containerized-runtime`: Build and run NEXO's frontend and server API as separate containers from this repository.
- `ragflow-api-integration`: Use the selected RAGFlow HTTP API surface from the NEXO backend without bundling the RAGFlow engine or its full stack.

### Modified Capabilities

None.

## Impact

Affected areas include the NEXO server API adapter and routes, Docker build targets, root Compose configuration, safe environment examples, and documentation of the selected/excluded RAGFlow components. RAGFlow remains an external engine dependency; NEXO's frontend and integration backend are built from this single repository.
