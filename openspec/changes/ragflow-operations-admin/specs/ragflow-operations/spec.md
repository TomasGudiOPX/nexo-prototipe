# Spec Delta

## Purpose

Lets site administrators perform the initial RAGFlow setup and core dataset, document, indexing, and assistant operations from NEXO.

## ADDED Requirements

### Requirement: Operations panel shows RAGFlow readiness
The operations panel SHALL show whether the configured RAGFlow service is reachable and report actionable setup prerequisites without exposing the server API key.

#### Scenario: RAGFlow is configured and reachable
- **WHEN** a site admin opens the operations overview
- **THEN** NEXO shows connection readiness and the available setup areas

#### Scenario: RAGFlow is unavailable or misconfigured
- **WHEN** the service cannot be reached or rejects its configured credentials
- **THEN** NEXO reports a useful connection state without returning secrets to the browser

### Requirement: Site admins manage datasets
NEXO SHALL allow site admins to list and create datasets, inspect dataset configuration and indexing state, and update or delete datasets when the connected RAGFlow API supports the requested operation.

#### Scenario: Create dataset
- **WHEN** a site admin submits valid dataset settings supported by the connected RAGFlow service
- **THEN** NEXO creates the dataset and displays the resulting dataset identity and state

#### Scenario: Unsupported or invalid dataset operation
- **WHEN** a requested operation is unsupported by the connected service or its input is invalid
- **THEN** NEXO explains the failure and leaves existing dataset state unchanged

### Requirement: Site admins manage dataset documents and indexing
NEXO SHALL allow site admins to upload and inspect dataset documents, start or retry parsing/indexing where supported, and display per-document processing state and errors.

#### Scenario: Upload and process document
- **WHEN** a site admin uploads a supported document to a dataset and requests processing
- **THEN** NEXO submits the document and reports its processing state until completion or failure

#### Scenario: Document processing fails
- **WHEN** RAGFlow reports a document parsing or indexing failure
- **THEN** NEXO displays the failed state and available error detail and offers supported retry actions

### Requirement: Site admins configure assistants for datasets
NEXO SHALL allow site admins to view and configure supported RAGFlow assistants, including their dataset association and available model/retrieval settings, and SHALL make a configured assistant selectable by authorized main-site users.

#### Scenario: Assistant is bound to a dataset
- **WHEN** a site admin saves a valid assistant configuration with one or more datasets
- **THEN** NEXO records or updates that configuration through RAGFlow and exposes the assistant as available for the main site

#### Scenario: Assistant prerequisites are missing
- **WHEN** required model, dataset, or service configuration is unavailable
- **THEN** NEXO identifies the missing prerequisite and does not report the assistant as ready
