# Proposal

## Why

The Intelligence Center splits one decision (workspace → dataset(s) → assistant) across three places: a workspace selector moved into the page header, a single-dataset select inside a floating "FUENTE DE CONOCIMIENTO" overlay that covers the panel subtitle, and an assistant select in a prepended row. The graph itself offers only two edge toggles, only one dataset of a workspace can be visualized at a time, and the legend pills look interactive but do nothing. Workspaces already bind multiple datasets, and their shared terms are the natural bridges between them, so the Center cannot show the cross-dataset knowledge it is supposed to visualize.

## What Changes

- Replace the floating source overlay with a **unified context row** above the dashboard grid: workspace → dataset(s) → assistant, plus the authorized-source status line. The interim header workspace selector is absorbed back into this row so the whole context decision lives in one place.
- The Center's dataset list comes from the workspace's bindings (`/api/workspaces` → `workspaces[].datasets`), not from `/api/datasets` (which returns every RAGFlow dataset for site-admins and would show unauthorized sources as selectable).
- **Multi-dataset selection**: chips with checkboxes for the active workspace's datasets, capped at a configurable number of concurrent datasets (default 3). The client merges the per-dataset graph responses into one fused graph — per-dataset coloring, shared-term nodes acting as highlighted inter-dataset bridges — with an in-memory cache of loaded graphs.
- A collapsible **"Configurar grafo" bar inside the graph panel** (not floating over the title) with two levels:
  - Basic: the two existing edge toggles (center ↔ files, node-to-node), a clickable node-type legend that filters types, entity search with highlighting, and a Merged / Per-dataset mode switch.
  - "Opciones avanzadas" disclosure: sharing threshold (terms present in ≥N documents), anti-hairball minimum-degree filter (hide nodes with fewer than N connections), pause animation, 3D sphere / 2D radial layout, rotation speed, node labels on/off, max concurrent datasets, and a reset-to-defaults button.
- Default behaviors without toggles: hover tooltip on nodes and a selected-node side panel that replaces the current modal.
- Persistence: basic toggles are reflected in URL params; advanced options are stored per user in `localStorage` and restorable to defaults. Multi-dataset selection is not deep-linked; the primary dataset (the first selected chip) stays in the existing `dataset` URL param and remains the dataset bound to chat.
- Graph API (additive): `/api/datasets/:id/graph` exposes the per-term document count as structured node metadata so the client-side sharing threshold works without refetching.

## Capabilities

### New Capabilities

- `knowledge-source-selection`: The Intelligence Center context row — workspace, multi-dataset, and assistant selection sourced from workspace bindings, with the concurrent-dataset cap, authorized-source semantics, primary-dataset behavior for chat, and URL reflection of the primary selection.
- `knowledge-graph-visualization`: The Intelligence Center graph configuration bar and rendering — basic and advanced options, merged vs. per-dataset rendering, per-dataset coloring with highlighted bridges, node-type filtering, search highlighting, tooltips and the node side panel, caching, and persistence of graph settings.

### Modified Capabilities

None. The repository currently has no maintained specs in `openspec/specs/`; completed changes contain historical change-local specs only.

## Impact

- `public/nexo-ragflow.js`: the IIFE that owns the Center's state, context row, dataset/graph loading, and canvas rendering; most of it is rewritten around the new context row and config bar.
- `public/nexo-prototipo.html`: dashboard markup and CSS for the brain panel, context row, config bar, node panel, and legend.
- `public/shell-controls.js`: the header profile/workspace wiring that must stop referencing the absorbed header workspace selector and refresh the row instead.
- `app/routes/api.graph.ts`: additive node metadata (per-term document count) for client-side thresholds; no response shape removed.
- `test/intelligence-center.test.mjs`: vm-harness contract tests extended for multi-dataset merge, filters, and thresholds.
- No new dependencies; no RAGFlow-side changes. Docker image rebuild is required to serve updated `public/` assets.
