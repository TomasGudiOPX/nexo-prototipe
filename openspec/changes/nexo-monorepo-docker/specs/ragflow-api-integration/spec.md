# Spec Delta

## Purpose

Defines the in-repository RAGFlow backend boundary used by the NEXO server API. NEXO and the selected RAGFlow backend are deployed together; the default application must not depend on an independently running RAGFlow stack.

## ADDED Requirements

### Requirement: Provide the selected RAGFlow operations in-repository

The system SHALL include and build the selected RAGFlow backend source and its required runtime dependency closure from this repository for dataset, document/chunk, graph metadata, and assistant chat operations used by NEXO.

#### Scenario: Run required operations without an external RAGFlow deployment

- **WHEN** an operator starts the documented default Compose project
- **THEN** NEXO's dataset, document/chunk, graph, and chat API requests are served by the RAGFlow backend in the same project

#### Scenario: An optional RAGFlow operation is not included

- **WHEN** an operation is outside the selected backend surface
- **THEN** NEXO reports that operation as unsupported and does not require a second RAGFlow deployment

#### Scenario: External Data Sources API is outside the selected backend

- **WHEN** a site administrator opens Data Sources in NEXO
- **THEN** NEXO reports external connector management as unsupported in this backend profile and does not link to a separate RAGFlow admin panel

### Requirement: Use the private internal service address

The system SHALL route NEXO server-to-server calls to the RAGFlow service through the private Compose network and SHALL keep the RAGFlow API key on the server.

#### Scenario: Configure the integrated service

- **WHEN** Compose starts the NEXO API and RAGFlow backend
- **THEN** the NEXO API reaches the backend at its internal service endpoint without an operator-provided external URL

#### Scenario: RAGFlow is not ready

- **WHEN** the RAGFlow backend or one of its required dependencies is unhealthy
- **THEN** NEXO API remains unready and reports a safe dependency-health error without exposing credentials

### Requirement: Exclude unrelated RAGFlow components

The system SHALL NOT bundle the RAGFlow admin web frontend, Python client SDK, sample applications, optional channels, unused backend modules, or runtime services outside the documented dependency closure.

#### Scenario: Inspect default Compose services

- **WHEN** an operator inspects the default Compose deployment
- **THEN** it contains only NEXO services and the explicitly documented RAGFlow runtime/dependency services

### Requirement: Keep operator workflows in NEXO

The system SHALL provide the supported initial and ongoing RAGFlow operations through NEXO's operations panel rather than requiring a separate RAGFlow admin frontend.

#### Scenario: Prepare a dataset for NEXO

- **WHEN** a site administrator uses the NEXO operations panel
- **THEN** the administrator can complete the supported dataset, document, and assistant setup against the in-repository backend

#### Scenario: No separate RAGFlow admin frontend is deployed

- **WHEN** an operator uses NEXO's operations panel
- **THEN** supported operations are managed there and no browser-facing link depends on an external RAGFlow frontend
