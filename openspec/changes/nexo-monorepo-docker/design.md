# Design

## Context

NEXO already has a web container and a lightweight Node API adapter. That API currently forwards dataset, document/chunk, graph, and chat requests to `RAGFLOW_BASE_URL`. Default Compose does not run the service at that URL. This is why the admin panel reports that RAGFlow cannot be reached unless someone starts a separate RAGFlow checkout and its services.

The required outcome is a single-clone, single-Compose-project deployment. The RAGFlow backend code needed for NEXO must be included in this repository and built here. The current RAGFlow runtime was measured at about 6.5 GiB, with Elasticsearch using most of it, so copying its full deployment unchanged is not an acceptable selection.

## Goals / Non-Goals

**Goals:**

- Build NEXO web, NEXO API, and the selected RAGFlow backend from this repository alone.
- Start the selected RAGFlow runtime and only its proven runtime dependencies from the default Compose command.
- Support NEXO's existing dataset discovery/management, document processing, chunk/graph context, and assistant chat flows.
- Keep API credentials private to server containers and keep RAGFlow data in documented persistent volumes.
- Measure the selected stack's idle and active memory, and make it lower than the previously measured full-stack baseline.

**Non-Goals:**

- Require a sibling checkout, external RAGFlow deployment, or a second Compose command.
- Bundle the RAGFlow admin web frontend, Python client SDK, sample apps, unrelated agent/channel integrations, or services not used by the selected backend paths.
- Reimplement RAGFlow's indexing/retrieval behavior in NEXO merely to avoid tracing its actual backend dependencies.
- Claim the monorepo runtime is self-contained if any required engine/service is still missing from the repository's build/deployment definition.

## Selective source decision

| Component | Decision | Boundary |
|---|---|---|
| NEXO web and Node API | Keep | Existing application, routes, auth, RBAC, and RAGFlow HTTP adapter. |
| RAGFlow backend | Include the Go-only runtime source in this repository | Upstream `v1.0.0-rc1`, commit `14bb02ee4584c1ab18f0c722c48beecd6bbf9860`. Include `cmd/ragflow_server.go`, its `internal/` package closure, `common/`, `conf/`, Go module manifests, Go build inputs, `docker/entrypoint-go.sh`, and `docker/service_conf.yaml.template`, with Apache-2.0 license/attribution. The in-repo export is about 34 MB. |
| RAGFlow storage/index/queue dependencies | Include the required Go CPU dependency closure | MySQL (metadata), Elasticsearch (chunk/vector search and graph operations), MinIO (object storage), Kvrocks (cache), and NATS (ingestion queue). The selected Go profile has no ClickHouse driver initialization, so analytics storage stays out. Keep optional engines, Python services, TEI, sandbox, and alternate profiles out. |
| RAGFlow web admin | Leave out | NEXO's operations panel is the operator UI for the shipped deployment. |
| Python server, Python SDK, and client libraries | Leave out | The selected Go server runs API, ingestor, syncer, admin coordination, and in-process DeepDoc; Python is not part of that runtime. Client SDKs duplicate NEXO's server adapter. |
| RAGFlow web frontend, optional channels, sample apps, unused providers and profiles | Leave out | NEXO provides the operator UI; these are not required by NEXO's selected server flows. |

This is a Go-only backend runtime, not a handler-only copy: `cmd/ragflow_server.go` imports a broad internal package set and requires its transitive closure. It initializes metadata, document engine, cache, object storage, and message queue at startup; the chosen services match those requirements. The selected ClickHouse package is a no-op driver and startup does not initialize it, so no ClickHouse service is included. Elasticsearch receives an explicit heap and container memory cap to avoid the prior unconstrained 4+ GiB use. The build omits RAGFlow's web/Python build stages and ships no RAGFlow admin frontend.

The backend image obtains only the Go server's pinned native libraries and required in-process DeepDoc weights/tokenizers through the vendored `download_go_deps.py`; it does not pull the all-model `ragflow_deps` image. Measure runtime memory by summing `docker stats --no-stream` for every running service in this Compose project after five idle minutes, then again during one representative Markdown ingestion and assistant query. Record both totals and compare with the previously measured ~6.5 GiB full-stack baseline.

## Decisions

### Build from one repository

The NEXO API image and RAGFlow backend image use build contexts within this repository. Compose may pull declared base/database images, but it must not require source from `..\\ragflow-be`, an external RAGFlow API endpoint, or a second compose file.

### Use a private Compose network

NEXO API calls the RAGFlow service by its internal service name. `RAGFLOW_BASE_URL` is derived from or defaults to this internal endpoint for container deployment. The browser-facing RAGFlow admin link is removed from the shipped flow; NEXO's own operations panel manages the supported operations.

### Start in dependency order

The RAGFlow service exposes a health check that verifies its API and required stores. NEXO API waits for RAGFlow readiness; the web proxy waits for the NEXO API health check. A container being merely started is not sufficient.

### Keep persistent data scoped and protected

Named volumes cover only required database, object, index, and NEXO application state. `docker compose down` preserves them. Documentation describes backup/restore and warns that encryption secrets must be backed up with the NEXO database.

## Risks / Trade-offs

- [RAGFlow backend is tightly coupled] → Vendor/build the transitive internal closure, not isolated route files; validate the selected binary's required startup services.
- [Upstream updates change paths or licenses] → Pin the source version and preserve license/attribution; document the upgrade procedure.
- [Memory remains high] → Measure the selected stack against the 6.5 GiB baseline; tune or remove optional subsystems before declaring the deployment complete.
- [Backend takes time to become ready] → Add health checks and make dependent services wait for health, not process start.
- [NEXO operator features require backend APIs not in the selected subset] → Keep unsupported operations explicit in the UI; do not point the UI at a separately deployed server as a fallback.

## Migration Plan

1. Trace the upstream runtime dependency closure for NEXO's existing operations and record the selected source/services.
2. Add the selected source, attribution, and in-repository Docker build.
3. Wire one default Compose project, internal URLs, health checks, secrets, and persistent volumes.
4. Build and start from a clean clone with no sibling checkout or external RAGFlow stack; verify NEXO's required flows against the in-repo service.
5. Measure resource use and document clean stop, persistence, backup, and upgrade behavior.

## Open Questions

- Can the selected Go-only runtime build and run within the tuned memory limits while processing the representative NEXO Markdown dataset? Verify during implementation; raise a limit only with measured evidence and update the documented footprint.
