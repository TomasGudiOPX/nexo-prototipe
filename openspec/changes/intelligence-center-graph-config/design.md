# Design

## Context

See `proposal.md` for motivation and `specs/` for observable behavior. The Center is one IIFE in `public/nexo-ragflow.js` that owns state, the context row, dataset/graph loading, and a canvas 3D-sphere renderer; the dashboard markup and minified CSS live in `public/nexo-prototipo.html`. The whole thing is currently mid-rewrite and uncommitted, including an interim change that moved the workspace selector into the page header. Contract tests run in `test/intelligence-center.test.mjs` through a Node `vm` harness with DOM stubs. The served image bakes `public/` at build time (nginx), so verification requires a Docker image rebuild.

Relevant existing contracts (verified against the code):

- `/api/workspaces` returns each workspace with its bound `datasets[]` and `assistants[]` (`app/server/workspaces.server.ts`, tables `workspace_datasets` / `workspace_assistants`).
- `/api/datasets?workspaceId=` returns **all** RAGFlow datasets for `site-admin` (unfiltered by binding); only non-admins get a binding-filtered list.
- `/api/datasets/:id/graph?workspaceId=` returns one dataset's graph. Derived `chunks` graphs paginate chunks (up to 500 docs × 100/page, concurrency 8; ~1.1s on TEST3). Node ids: documents use raw RAGFlow ids, terms use `term:<encodeURIComponent(kind:normalizedTerm)>`, and the hub is `dataset:<id>`. Edge kinds: `membership`, `keyword`, `metadata`, `chunk`, `shared-document`.
- Chat (`/api/datasets/:id/chat`) is single-dataset; it cannot take a dataset list.

## Goals / Non-Goals

**Goals:**

- One place for the workspace → datasets → assistant decision, and one in-panel place for graph configuration, with progressive disclosure for calibratable options.
- Multi-dataset visualization without new server-side graph endpoints, reusing per-dataset authorization as-is.
- Client-side calibration (thresholds, filters) that never re-issues graph requests.
- Keep the change frontend-centric: one additive metadata field in the graph API, everything else in `public/` plus tests.

**Non-Goals:**

- Server-side graph merging or a batched graph endpoint.
- Deep-linking the full multi-dataset selection or advanced options in the URL.
- Multi-dataset chat/retrieval (chat stays bound to the primary dataset).
- Changing RAGFlow-side behavior or the workspace binding model.

## Decisions

### Merge graphs in the client; no new backend endpoint

Load each selected dataset with the existing `GET /api/datasets/:id/graph?workspaceId=` and merge payloads in the client. Term node ids are identical across datasets for the same `kind:normalizedTerm`, so merging by `sourceId` de-duplicates shared terms into single bridge nodes automatically; document ids are RAGFlow-unique and hubs are `dataset:<id>`. Bridges are then just term nodes whose adjacent dataset hubs number more than one — computed at merge time, no extra requests.

*Alternative:* a server endpoint taking a dataset list. Rejected: it duplicates authorization, couples N-dataset merge semantics to the server, and the client already needs per-dataset caching anyway.

### Expose per-term document counts as structured node metadata

The sharing threshold needs each term's document count client-side. Today that number only exists inside the term node's Spanish description text ("… presente en N documentos"), which is not a parseable contract. `app/routes/api.graph.ts` gains an additive numeric field on term nodes (e.g. `documentCount`) in `chunks` graphs. The field is additive; no response shape is removed.

*Alternative:* a `minSharedDocuments` query parameter on the graph endpoint. Rejected: every threshold adjustment would re-fetch (and `chunks` graphs are expensive), and it would break cache reuse for the same dataset at different thresholds.

### Selection model: an ordered dataset list with a stable primary

`state.datasetIds` is an ordered array; the first entry is the primary dataset and drives the existing single `dataset` URL param and all chat calls. Deselecting the primary promotes the next-oldest selection. Only the primary stays in the URL; the other chips are session state (the user explicitly declined dataset deep-linking).

### Dataset options come from workspace bindings

The chips render `workspaces[].datasets` from `/api/workspaces`, never `/api/datasets` — the latter lists every RAGFlow dataset for site-admins, which would offer unauthorized sources as selectable. The binding list is the authorization surface the rest of the app already uses.

### Configuration UI: in-panel bar + `<details>` advanced disclosure

The floating `.ragflow-source-control` overlay is removed from `.brain-top`. The context row (today's prepended `contextControls`) gains the dataset chips and absorbs the workspace selector back from the header; the interim header-move code and the corresponding `shell-controls.js` refresh wiring are removed. A collapsible "Configurar grafo" bar is inserted inside `.brain-panel` above the canvas (the panel is already `position:relative`), with a "Opciones avanzadas" native `<details>` disclosure — the same progressive-disclosure pattern as the `profile-menu` in `shell-controls.js`. The selected-node side panel is an absolutely positioned card inside the graph panel, replacing the current `openModal` call.

### Rendering: derive a filtered model, then project

Split the current monolithic `animateGraph` step into (1) a derived view model and (2) projections. The view model merges cached per-dataset graphs, then applies, in order: node-type filters (legend + existing edge toggles, unified as filter sets), the sharing threshold (term `documentCount`), the anti-hairball minimum degree (computed from merged edges), and the per-dataset mode. Projections: the existing 3D sphere (`stablePoint` hash stays, so node positions remain deterministic), or a 2D radial layout (dataset hubs on an inner ring; documents around their hub; terms on an outer ring, angles hashed deterministically). Per-dataset colors come from a small fixed palette keyed by dataset position in the selection; bridge nodes get a distinct marker style. In Per-dataset mode, term ids are namespaced per dataset (`ds:<id>::term:…`) at merge time so terms are not merged and each dataset lands in its own labeled sector.

*Alternative:* one physics/force layout for everything. Rejected: undeterministic layout makes node positions jump between renders; deterministic hashed placement keeps the current stable-sphere feel at zero cost.

### Cache per dataset, scoped to the session and workspace

A `Map<datasetId, graphPayload>` in memory. Progressive rendering: each dataset paints as it arrives; a failed dataset surfaces its own error without blocking the others. The cache is cleared whenever `contextVersion` bumps (workspace switch, session change), which the code already uses to invalidate in-flight loads.

### Persistence split: URL for basic, localStorage for advanced

Basic options (edge toggles, node-type filter, mode, search) become URL params alongside the existing `dataset` param, so a configured view survives reload. Advanced values are stored per user under a `localStorage` key scoped by user id (`nexo:graph-adv:<userId>`) and restored on load; the reset button writes defaults back. Basic-vs-advanced mirrors the visibility split, so what you can share in a link is exactly what is always visible.

## Risks / Trade-offs

- [`chunks` graphs are expensive; three concurrent selections triple load time] → Progressive rendering per dataset, in-memory cache, default cap of 3, and per-dataset error isolation.
- [Merging by `sourceId` could collide if a document id ever matched a `term:` id] → RAGFlow ids are UUID-shaped; additionally, merge keys are prefixed by node kind so term ids only collide with term ids.
- [Client merge grows the node/edge arrays (3 × up to ~1300 nodes)] → Anti-hairball and sharing-threshold defaults tuned so the merged view stays readable; counts shown in the legend.
- [Removing `openModal` for the node panel changes an existing interaction] → The panel carries the same content (detail, connections, id, source) plus dataset attribution, and closes without navigation.
- [`localStorage` keyed per user on a shared browser profile] → Keys are user-scoped; one user's calibration never applies to another.
- [Served assets are baked into the Docker image] → Verification plan includes `docker compose build nexo && docker compose up -d nexo`; quick iteration can `docker cp` into the running container.

## Migration Plan

Single change inside the ongoing uncommitted Center rewrite: rewrite the IIFE around the new row/config-bar structure, apply the additive `documentCount` field in `app/routes/api.graph.ts`, extend the vm-harness tests. No stored data changes; `localStorage` keys are additive and old keys are ignored. Rollback is reverting the touched files and rebuilding the image.

## Open Questions

- Whether dataset chips should also show each dataset's document count as a small badge (cosmetic, deferrable without touching the specs).
