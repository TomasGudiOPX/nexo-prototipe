# Selected RAGFlow backend source

This directory contains a deliberately limited source export from the local RAGFlow checkout.

- Upstream: InfiniFlow/RAGFlow
- Version: `v1.0.0-rc1`
- Source commit: `14bb02ee4584c1ab18f0c722c48beecd6bbf9860`
- License: Apache-2.0 (`LICENSE` is included)
- Export size: about 34 MB before Docker build caches

Included: `cmd/`, `internal/`, `common/`, `conf/`, `agent/templates/`, `rag/prompts/`, `api/db/init_data/compilation_templates/`, `go.mod`, `go.sum`, `build.sh`, the root `Dockerfile` as a build-script version-pin input, the Go dependency preparation scripts, and the needed Go runtime configuration/database init scripts under `docker/`.

Excluded: Python `api/`, `agent/`, and `rag/` runtime trees except the documented static template/prompt assets; RAGFlow's `web/` admin frontend; SDKs; examples; tests outside the Go package tree; optional database/vector-engine profiles; and the upstream full-stack Compose definitions. This keeps the selected Go server and its in-process DeepDoc ingestion path while NEXO supplies the operator UI.

NEXO's local patches to `docker/entrypoint-go.sh` start the Go API directly on port 9380 without RAGFlow's Nginx/admin web frontend, and set the ingestion worker default to one for this resource-limited profile. `internal/admin/service.go` seeds the initial RAGFlow superuser from NEXO bootstrap variables plus a dedicated regular service user/tenant for `RAGFLOW_API_KEY`; RAGFlow forbids superusers from using its dataset API. This replaces the upstream `admin/admin` defaults for this deployment. `download_go_deps.py` adds a `--nexo-profile` option to skip optional Stagehand Browser sidecars. `VERSION` records the pinned upstream version for the runtime entrypoint. The Docker build refreshes the runner image's stale `office_oxide` library and downloads the Go runtime's native libraries/models/tokenizers; it does not import the large general-purpose `ragflow_deps` model image. The selected Go server is internally broad, so `internal/` is included as a build dependency closure rather than copying a few HTTP handlers that cannot compile or initialize independently. Review upstream license terms and update this manifest whenever the vendored source is refreshed.
