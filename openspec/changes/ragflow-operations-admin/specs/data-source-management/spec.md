# Spec Delta

## Purpose

Allows site admins to connect multiple supported content sources and control their association and synchronization with RAGFlow datasets.

## ADDED Requirements

### Requirement: Site admins manage multiple Data Sources
NEXO SHALL allow site admins to discover the Data Source types supported by the connected RAGFlow instance, create and inspect multiple source connections, and report unsupported source types clearly.

#### Scenario: Create a supported source connection
- **WHEN** a site admin provides valid configuration for a source type supported by RAGFlow
- **THEN** NEXO creates the connection and shows its identity and connection state

#### Scenario: Source type is unsupported
- **WHEN** a site admin selects a source type not supported by the connected RAGFlow instance
- **THEN** NEXO explains that the source type is unavailable and does not create a partial connection

### Requirement: Source credentials remain protected
NEXO SHALL transmit source credentials only through protected server-side operations and SHALL NOT return secret values in browser responses, logs, or ordinary source listings.

#### Scenario: Inspect a configured source
- **WHEN** a site admin views an existing source connection
- **THEN** NEXO displays non-secret configuration and masks or omits stored credentials

### Requirement: Site admins associate sources with datasets
NEXO SHALL allow site admins to associate a source with a supported dataset and configure available synchronization behavior.

#### Scenario: Associate source and dataset
- **WHEN** a site admin saves a valid source-to-dataset association
- **THEN** NEXO displays the association and its configured synchronization behavior

### Requirement: Site admins monitor and control source synchronization
NEXO SHALL show source synchronization status and available logs, and SHALL provide supported sync, rebuild, pause, or retry actions exposed by the connected RAGFlow instance.

#### Scenario: Synchronization completes or fails
- **WHEN** RAGFlow reports a source synchronization result
- **THEN** NEXO updates the source status and presents relevant completion or failure details

#### Scenario: Site admin starts a supported sync action
- **WHEN** a site admin requests an available synchronization action
- **THEN** NEXO submits it to RAGFlow and shows the resulting running state
