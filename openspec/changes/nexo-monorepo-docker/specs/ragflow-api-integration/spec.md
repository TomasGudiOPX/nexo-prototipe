# Spec Delta

## Purpose

Defines the selected integration boundary between NEXO's backend and the RAGFlow HTTP API. NEXO implements its own lightweight API adapter and does not package RAGFlow's engine.

## ADDED Requirements

### Requirement: Integrate through the selected RAGFlow API surface

The system SHALL use server-side HTTP requests for the RAGFlow dataset, document/chunk metadata, graph context, and assistant chat operations required by NEXO.

#### Scenario: Use an existing RAGFlow engine

- **WHEN** the operator configures a reachable RAGFlow base URL and API key
- **THEN** NEXO's API container sends the required requests to that instance and keeps the key out of browser responses

#### Scenario: RAGFlow is unavailable

- **WHEN** the configured engine cannot be reached or is not configured
- **THEN** NEXO returns a clear service/configuration error and does not expose credentials

### Requirement: Exclude coupled RAGFlow internals

The system SHALL NOT copy or start RAGFlow's coupled Go handlers, engine internals, indexing/storage dependencies, Python SDK, or persistent volumes as part of the default NEXO deployment.

#### Scenario: Start NEXO without duplicating the engine

- **WHEN** the operator starts the default NEXO Compose configuration
- **THEN** only NEXO frontend and API containers start and no RAGFlow engine services or volumes are created

### Requirement: Link to the RAGFlow admin UI

The system SHALL allow a browser-facing RAGFlow admin URL to be configured independently of the server-side API URL.

#### Scenario: Open the admin UI

- **WHEN** an admin URL is configured
- **THEN** NEXO provides a link to that URL without proxying or bundling the RAGFlow admin frontend
