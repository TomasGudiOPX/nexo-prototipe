# Spec Delta

## Purpose

Defines a single-repository, single-Compose-project deployment for NEXO and the selected RAGFlow backend runtime needed by NEXO.

## ADDED Requirements

### Requirement: Build the application and selected backend from this repository

The system SHALL build the NEXO web app, NEXO API, and selected RAGFlow backend from source paths within this repository. The build SHALL NOT require a sibling checkout or RAGFlow source outside this repository.

#### Scenario: Build from an isolated clone

- **WHEN** an operator builds from a clean clone with no sibling repositories available
- **THEN** the web, NEXO API, and selected RAGFlow backend images build successfully using this repository's tracked files and declared base/dependency images

### Requirement: Start one complete Compose deployment

The default Compose command SHALL start NEXO web, NEXO API, the selected RAGFlow backend, and all required runtime dependencies in this project. NEXO API SHALL wait for the RAGFlow health check before becoming healthy.

#### Scenario: Start the full monorepo deployment

- **WHEN** an operator runs `docker compose up --build -d` from the repository root with the documented environment configured
- **THEN** NEXO web, NEXO API, and the selected RAGFlow backend become healthy without starting another repository or Compose project

#### Scenario: Preserve runtime data

- **WHEN** an operator stops the project with `docker compose down`
- **THEN** the selected RAGFlow and NEXO persistent data remains in this project's named volumes

### Requirement: Keep credentials server-side

The system SHALL provide RAGFlow credentials only to server-side containers and SHALL NOT expose them or internal service URLs in browser responses or built assets.

#### Scenario: Inspect browser configuration

- **WHEN** a browser loads NEXO configuration and API responses
- **THEN** the responses contain neither a RAGFlow API key nor a private Compose service URL

### Requirement: Keep runtime secrets and data out of images

The system SHALL NOT include local environment files, runtime credentials, or generated database/index/object data in application/backend image layers.

#### Scenario: Build with local data present

- **WHEN** an operator builds images from a working tree containing local environment files or runtime data
- **THEN** those secrets and data are absent from the resulting image layers
