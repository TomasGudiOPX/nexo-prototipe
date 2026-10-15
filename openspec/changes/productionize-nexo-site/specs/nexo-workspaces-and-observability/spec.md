## ADDED Requirements

### Requirement: Workspaces bind NEXO context to RAGFlow resources

NEXO SHALL provide local workspaces that group authorized users, RAGFlow
datasets, and RAGFlow assistants without duplicating RAGFlow-owned documents or
assistant configuration.

#### Scenario: A user opens an authorized workspace

- **WHEN** a user opens a workspace
- **THEN** NEXO SHALL show current linked dataset and assistant state
- **AND** document work SHALL be scoped to the selected dataset

### Requirement: Activity and reports use verifiable signals

NEXO SHALL derive Activity and Reports from recorded NEXO events and observable
RAGFlow state. It SHALL label unavailable metrics instead of showing synthetic
values.

#### Scenario: A RAGFlow operation fails

- **WHEN** NEXO receives a sanitized RAGFlow failure or failed processing state
- **THEN** it SHALL record a visible activity event for authorized users
