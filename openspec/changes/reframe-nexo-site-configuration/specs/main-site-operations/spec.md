## ADDED Requirements

### Requirement: Main site exposes product operations

The main NEXO site SHALL provide the day-to-day knowledge, assistant, document,
Data Source, and MCP management experiences for authenticated users with the
appropriate role. These experiences SHALL be part of the main site navigation
and SHALL NOT require users to open a separate operations-admin application.

#### Scenario: A user opens configuration from the main site

- **WHEN** an authenticated user selects the visible Configuration control in
  the main NEXO interface
- **THEN** the site SHALL open an interactive NEXO configuration workspace
  within the main site context
- **AND** it SHALL preserve the user session and use the site's protected APIs

#### Scenario: An authorized user manages an operational resource

- **WHEN** a user with the required authorization opens a knowledge, assistant,
  or integration view
- **THEN** the site SHALL show only the operations the API supports
- **AND** it SHALL provide in-context loading, empty, error, and retry states

### Requirement: Site admin is configuration-focused

The site-admin area SHALL focus on product and connection settings. It SHALL
not duplicate the day-to-day resource management views offered by the main
site.

#### Scenario: A non-admin opens the main site configuration workspace

- **WHEN** a signed-in non-admin user opens Configuration
- **THEN** the site SHALL show the operational views available to that user
- **AND** it SHALL not reveal or enable connection credential controls

