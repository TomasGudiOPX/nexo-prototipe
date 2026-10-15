## ADDED Requirements

### Requirement: Administrators can configure the RAGFlow connection

An authenticated `site-admin` SHALL be able to set a valid RAGFlow base URL and
replace the RAGFlow API key through a protected NEXO configuration interface.
The API SHALL validate origin and authorization before changing either value.

#### Scenario: Administrator saves a connection

- **WHEN** a site administrator submits a valid HTTPS or HTTP base URL and an
  API key
- **THEN** NEXO SHALL persist the base URL and encrypt the API key at rest
- **AND** subsequent server-side RAGFlow requests SHALL use the saved values

#### Scenario: Administrator leaves the API key unchanged

- **WHEN** a site administrator saves a changed base URL without supplying a
  replacement API key
- **THEN** NEXO SHALL retain the existing encrypted key
- **AND** it SHALL report whether a key is configured without returning it

### Requirement: Connection status is safe and actionable

The configuration interface SHALL expose the effective base URL, whether an API
key is configured, and a sanitized connectivity result. It SHALL NOT expose an
API key, authorization header, encrypted payload, or raw upstream error that
could contain credentials.

#### Scenario: Administrator validates a saved connection

- **WHEN** a site administrator requests connection validation
- **THEN** NEXO SHALL make a server-side health or capability request to
  RAGFlow using the effective settings
- **AND** return a success, unavailable, or sanitized failure state

#### Scenario: No saved setting exists

- **WHEN** no site-admin connection setting has been saved
- **THEN** NEXO SHALL use deployment environment values when available
- **AND** identify the connection as deployment-managed in the configuration
  status without exposing the API key

