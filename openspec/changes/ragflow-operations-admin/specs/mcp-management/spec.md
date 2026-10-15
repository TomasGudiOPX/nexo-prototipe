# Spec Delta

## Purpose

Provides controlled registration of remote MCP servers and approval of their tools for use from NEXO's main assistant experience.

## ADDED Requirements

### Requirement: Site admins register remote MCP servers
NEXO SHALL allow site admins to register and manage remote MCP servers using supported transport and endpoint settings, with optional authentication credentials stored server-side.

#### Scenario: Register a valid MCP server
- **WHEN** a site admin submits a valid endpoint, supported transport, and required credentials
- **THEN** NEXO stores the server configuration and shows its connection state without returning credentials

#### Scenario: Invalid or unreachable MCP server
- **WHEN** a registration or connection check fails
- **THEN** NEXO reports the failure and does not mark the server or its tools as ready for use

### Requirement: Site admins discover and approve MCP tools
NEXO SHALL let site admins test registered servers, discover available tools, and explicitly approve which tools may be invoked by main-site assistants.

#### Scenario: Admin approves discovered tools
- **WHEN** a site admin selects discovered tools and saves the approval
- **THEN** only those tools become available for configured NEXO assistant experiences

#### Scenario: Tool approval is removed
- **WHEN** a site admin revokes approval for a tool
- **THEN** subsequent main-site requests cannot invoke that tool

### Requirement: Main-site users invoke only approved MCP tools
NEXO SHALL expose approved MCP tools only through supported assistant experiences and SHALL enforce tool approval and user authorization on the server for each invocation.

#### Scenario: User invokes an approved tool
- **WHEN** an authenticated main-site user makes an assistant request that selects an approved and available MCP tool
- **THEN** NEXO invokes the registered server using server-held credentials and returns the tool result through the assistant experience

#### Scenario: Request targets an unapproved tool
- **WHEN** a user request attempts to invoke an unapproved, disabled, or unknown tool
- **THEN** NEXO blocks the invocation and does not call the MCP server

### Requirement: MCP tools are distinct from Data Sources
NEXO SHALL present MCP tools as query-time/action capabilities and Data Sources as content-ingestion connections, with separate configuration and lifecycle controls.

#### Scenario: Admin manages an MCP server
- **WHEN** a site admin opens MCP management
- **THEN** NEXO shows server and tool approval controls separately from Data Source ingestion controls
