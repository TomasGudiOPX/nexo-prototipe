## ADDED Requirements

### Requirement: NEXO separates production workflows

NEXO SHALL provide Home, Workspaces, Knowledge, Assistants, Activity, Reports,
and Configuration as distinct site areas. Each SHALL load verifiable state from
protected NEXO or RAGFlow APIs and SHALL NOT use demo records as production data.

#### Scenario: A user selects a main navigation area

- **WHEN** an authenticated user selects an available site area
- **THEN** NEXO SHALL render its independent workspace and loading, empty,
  unavailable, and recoverable error states
- **AND** it SHALL preserve authorization boundaries

### Requirement: Configuration contains settings only

Configuration SHALL contain RAGFlow connection settings, model-provider and
model configuration, and external data-source configuration. It SHALL NOT
contain Knowledge, Documents, Assistants, or MCP operations.

#### Scenario: A non-admin opens Configuration

- **WHEN** a non-admin user opens Configuration
- **THEN** NEXO SHALL withhold connection credentials, provider credentials,
  and data-source credentials
