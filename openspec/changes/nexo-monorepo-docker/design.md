# Design

## Context

NEXO is a React Router application with browser UI and server API routes. The monorepo must build both from this repository while keeping the deployable NEXO API lightweight. The sibling `ragflow-be` checkout is the upstream RAGFlow Go backend; it is not a self-contained API that can be copied as a few handlers.

Inspection found RAGFlow dataset/chat handlers under `internal/handler`, coupled to internal entity, DAO, storage, engine, and shared packages. The Python SDK under `sdk/python/ragflow_sdk` is a client library, not a backend server, and duplicates the HTTP calls NEXO already implements. The supported RAGFlow CPU deployment also starts Elasticsearch, MySQL, MinIO, ClickHouse, Kvrocks, and NATS; its measured footprint here is about 6.5 GiB RAM, most from Elasticsearch.

## Goals / Non-Goals

**Goals:**

- Build NEXO's browser frontend and lightweight API backend from this single repository as separate containers.
- Select only the RAGFlow HTTP API operations NEXO uses: dataset discovery, document/chunk metadata for graph edges, graph context, and assistant chat.
- Keep API credentials in the NEXO API container and support an already-running RAGFlow engine.
- Exclude runtime services and source that NEXO does not need to operate its UI and adapter.

**Non-Goals:**

- Copy RAGFlow's Go handlers without their internal dependencies or vendor its complete engine.
- Include the Python SDK when the existing TypeScript adapter already calls the same HTTP API.
- Start RAGFlow's indexing/storage stack or manage its data volumes from NEXO Compose.
- Reimplement RAGFlow's admin UI.

## Selective source decision

| RAGFlow component | Decision | Reason |
|---|---|---|
| HTTP API behavior for datasets, documents/chunks, graph-related metadata, and chat | Use through NEXO's server-side adapter in `app/server/ragflow.ts` and `app/routes/api.*` | This is the smallest operational surface NEXO needs; it already fits the Node service and keeps credentials server-side. |
| Go handlers in `internal/handler` | Leave out | They call RAGFlow internal DAO/entity/engine/storage code and are not standalone modules. |
| RAGFlow Python SDK | Leave out | It is a client SDK, not a backend; adding it duplicates the existing TypeScript HTTP adapter and introduces a second runtime. |
| RAGFlow admin web app | Leave out; link to its configured URL | It is not needed to serve NEXO and can remain with the existing RAGFlow deployment. |
| RAGFlow engine plus Elasticsearch/MySQL/MinIO/ClickHouse/Kvrocks/NATS | Leave external | These services index and store RAGFlow data and account for the high memory footprint. NEXO must not create duplicate services or volumes. |

This selects and reuses the backend's HTTP integration boundary, not a misleading partial copy of coupled Go implementation. NEXO's own lightweight API is the backend shipped in this monorepo.

## Decisions

### Run NEXO frontend and API as separate services

Build the static browser client into an Nginx image and run the React Router server API in a Node image. Nginx proxies `/api/*` to the API service. Both targets use only files in this repository.

### Build NEXO from tracked files

Use a multi-stage Node build and exclude local environment files, dependency directories, build output, and runtime data from the Docker context. Supply RAGFlow credentials only as runtime server environment variables.

### Connect to an existing RAGFlow engine

Compose starts only `nexo` and `nexo-api`. The API container accepts a configurable RAGFlow URL and key; the admin URL is separately browser-facing. Compose must not declare a RAGFlow engine image, supporting services, or data volumes.

### Keep admin access as a browser link

Expose the admin UI URL as a separate runtime setting and provide a NEXO link. Do not proxy or bundle the admin frontend.

## Risks / Trade-offs

- [RAGFlow HTTP API changes] → Keep endpoint handling in the NEXO adapter and update it deliberately against the configured RAGFlow version.
- [The external API URL is unreachable from NEXO] → Document host versus Compose-network URLs and keep the setting configurable.
- [The admin UI may expose privileged operations] → Keep its URL explicit and limited to the operator's intended network.
- [Local `.env` fallback is unsuitable in a container] → Prefer runtime environment and keep missing-config errors safe.

## Migration Plan

1. Build the NEXO web and API targets from the repository root.
2. Start the two NEXO services against the existing RAGFlow API.
3. Stop NEXO with `docker compose down` to roll back; leave RAGFlow containers and volumes untouched.

## Open Questions

- None that change the selected architecture.
