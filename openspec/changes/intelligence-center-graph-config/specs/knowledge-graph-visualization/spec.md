# Spec Delta

## Purpose

Lets users configure and read the Intelligence Center knowledge graph: basic view controls in an in-panel bar, calibratable options behind an advanced disclosure, and multi-dataset rendering with per-dataset colors and inter-dataset bridges.

## ADDED Requirements

### Requirement: Graph configuration lives in an in-panel collapsible bar

The graph configuration controls SHALL live in a collapsible bar inside the graph panel, below the panel heading area, and MUST NOT overlap or obscure the panel heading or subtitle. The bar SHALL be collapsible so the graph can be viewed full-size.

#### Scenario: Bar is opened and collapsed
- **WHEN** a user toggles the graph configuration bar
- **THEN** its controls appear and disappear without covering the panel heading or subtitle

### Requirement: Basic graph options are always reachable

The configuration bar SHALL expose as basic options: the center ↔ files connection toggle, the node-to-node connection toggle, a clickable node-type legend that filters node types in and out of view, entity search that highlights matching nodes, and a Merged / Per-dataset mode switch. The state of these basic options SHALL be reflected in URL parameters so the view survives a reload.

#### Scenario: Toggling a connection class
- **WHEN** a user toggles center ↔ files or node-to-node connections off
- **THEN** the corresponding edges are hidden from the rendered graph and the URL reflects the new state

#### Scenario: Filtering a node type by legend
- **WHEN** a user clicks a legend pill for a node type
- **THEN** nodes of that type and their edges disappear from view, and clicking the pill again restores them

#### Scenario: Searching an entity
- **WHEN** a user types a query in the entity search
- **THEN** matching nodes stay highlighted while the rest of the graph dims

#### Scenario: Reloading with a configured view
- **WHEN** a user reloads the page with basic-option URL parameters present
- **THEN** the graph renders with the same basic option state as before the reload

### Requirement: Advanced options are progressive-disclosure and persisted

The configuration bar SHALL provide an "Opciones avanzadas" disclosure containing: the sharing threshold (terms present in at least N documents), the anti-hairball minimum-degree filter (hide nodes with fewer than N connections), pause animation, the 3D sphere / 2D radial layout switch, rotation speed, node labels on/off, the maximum number of concurrent datasets, and a reset-to-defaults button. Advanced option values SHALL be persisted per user in browser-local storage and restored on return; the reset button SHALL restore every advanced option to its default value.

#### Scenario: Applying the sharing threshold
- **WHEN** a user raises or lowers the sharing threshold
- **THEN** term nodes present in fewer documents than the threshold are hidden without a new graph request

#### Scenario: Applying the anti-hairball filter
- **WHEN** a user raises the minimum-degree filter
- **THEN** nodes with fewer connections than the filter are hidden from view

#### Scenario: Returning with custom calibration
- **WHEN** a user who changed advanced options returns to the Center
- **THEN** the previously chosen values are restored from browser-local storage

#### Scenario: Resetting to defaults
- **WHEN** a user presses the reset-to-defaults button
- **THEN** every advanced option returns to its default value and the graph re-renders accordingly

### Requirement: Multiple selected datasets render as one fused graph with bridges

In Merged mode the Center SHALL render the selected datasets' graphs as one fused graph, with each dataset's nodes identifiable by a per-dataset color and a visible dataset-color key. Term nodes shared by more than one selected dataset SHALL act as inter-dataset bridges and SHALL be visually distinguished from within-dataset nodes.

#### Scenario: Two datasets share a term
- **WHEN** two selected datasets both contain the term "budget"
- **THEN** the merged graph shows a single "budget" node connected to documents of both datasets, visually marked as an inter-dataset bridge

#### Scenario: A selected dataset fails to load
- **WHEN** one of the selected datasets fails to load
- **THEN** the other selected datasets still render and the failure is surfaced for the failed dataset only

### Requirement: Per-dataset mode renders separate labeled clusters

In Per-dataset mode the Center SHALL render each selected dataset as its own visually separate, labeled cluster with its per-dataset color, without merging shared terms into bridge nodes.

#### Scenario: Switching from Merged to Per-dataset
- **WHEN** a user switches the mode from Merged to Per-dataset with two datasets selected
- **THEN** each dataset renders as its own labeled cluster and no inter-dataset bridge nodes are shown

### Requirement: Nodes expose a hover tooltip and a selection panel

The graph SHALL show a tooltip with the node label when the pointer hovers a node, and SHALL show a selected-node panel — replacing the current modal — with the node's detail, its connections, its identifier, and its source dataset when a node is selected. Selecting another node or closing the panel SHALL update or dismiss it without navigating away.

#### Scenario: Hovering a node
- **WHEN** the pointer hovers a visible node
- **THEN** a tooltip shows the node's label near the pointer

#### Scenario: Selecting a node
- **WHEN** a user clicks a visible node
- **THEN** a side panel inside the graph panel shows the node's detail, connections, identifier, and source dataset, and no modal dialog opens

### Requirement: Loaded graphs are cached in memory

The Center SHALL cache each loaded dataset graph in memory for the duration of the session and re-render a cached dataset without issuing a new graph request when it is re-selected. The cache SHALL NOT serve graphs across sessions, and dataset graphs MUST be reloaded after a workspace switch or session change.

#### Scenario: Re-selecting a cached dataset
- **WHEN** a user deselects a dataset and re-selects it in the same session
- **THEN** the dataset's graph renders from the in-memory cache without a new graph request

#### Scenario: Switching workspaces
- **WHEN** a user switches workspace and re-selects a previously loaded dataset
- **THEN** the graph is requested and loaded fresh for the new context
