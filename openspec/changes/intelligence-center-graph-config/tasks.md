# Tasks

## 1. Graph API metadata

- [x] 1.1 Add a numeric `documentCount` field to term nodes in `app/routes/api.graph.ts` (`buildDocumentConnections`) without removing any existing response field; verify with a signed-in request against a derived-chunks dataset that term nodes carry a numeric `documentCount` and the rest of the payload is unchanged.

## 2. Context row and source selection

- [x] 2.1 Rework the context row in `public/nexo-ragflow.js` to hold workspace, dataset chips, and assistant, sourcing chips from `workspaces[].datasets`; absorb the header workspace selector and remove the interim header-move code and its `shell-controls.js` refresh wiring; verify a vm-harness test where a site-admin workspace binds 2 of many RAGFlow datasets and exactly the 2 bound datasets are offered.
- [x] 2.2 Implement ordered multi-selection (`datasetIds`) with the concurrent-dataset cap (default 3) and refusal feedback, primary-dataset promotion on deselect, the single `dataset` URL param following the primary, and chat staying bound to the primary; verify vm-harness tests for cap refusal, lowering the cap below the selection, primary promotion, and chat refusal with no dataset selected.
- [x] 2.3 Clear the dataset selection, graph cache, and conversation on session end, 401 responses, and workspace switches; verify a vm-harness test for workspace-switch reset and a browser check with an expired session.

## 3. In-panel graph configuration bar

- [x] 3.1 Remove the floating `.ragflow-source-control` overlay from `.brain-top` and add the collapsible "Configurar grafo" bar inside the graph panel above the canvas (markup + CSS via the injected `<style>` in `nexo-ragflow.js`); verify in a rebuilt Docker image that the bar expands/collapses without covering the panel heading or subtitle.
- [x] 3.2 Implement the basic options: both edge toggles, clickable node-type legend filter, entity search with highlight, and the Merged / Per-dataset mode switch, all reflected in URL params; verify vm-harness tests for type filtering, search highlight, mode switch, and URL param reflection/restoration.
- [x] 3.3 Implement the "Opciones avanzadas" disclosure: sharing threshold (term `documentCount`), anti-hairball minimum degree, pause animation, 3D/2D layout switch, rotation speed, node labels, max concurrent datasets, and reset-to-defaults, persisted per user in `localStorage`; verify vm-harness tests that threshold changes hide terms without new graph requests, stored values are restored, and reset restores defaults.

## 4. Merged multi-dataset rendering

- [x] 4.1 Add the per-session graph cache, progressive rendering as each dataset arrives, and per-dataset error isolation; verify vm-harness tests that a failing dataset does not block the others and that re-selecting a cached dataset issues no new graph request (fetch call counting in the harness).
- [x] 4.2 Implement the merge pipeline and projections: de-duplicate shared term nodes into bridges, mark bridges distinctly, color nodes per dataset with a visible color key, compute the minimum-degree view model, and render both the 3D sphere and the 2D radial layout, including Per-dataset mode with per-dataset namespaced terms in separate labeled clusters; verify vm-harness tests that a shared term becomes one bridge node in Merged mode and no bridges exist in Per-dataset mode.
- [x] 4.3 Replace the node modal with the hover tooltip and the in-panel selected-node side panel (detail, connections, identifier, source dataset); verify a vm-harness test for the panel content and a browser check that selecting and dismissing nodes never navigates away.

## 5. Integration verification

- [x] 5.1 Run the full `npm test` suite in `nexo-prototipe` and confirm every test, including the pre-existing Intelligence Center regression tests, passes.
- [ ] 5.2 Rebuild and restart the image (`docker compose build nexo && docker compose up -d nexo`) and verify in a real browser: signed-in admin with multiple datasets selected (merged and per-dataset views, thresholds and advanced persistence across reload), signed-out states, and no console errors.
