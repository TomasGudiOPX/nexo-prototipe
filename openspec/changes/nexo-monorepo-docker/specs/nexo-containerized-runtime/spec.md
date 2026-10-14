# Spec Delta

## Purpose

Defines how NEXO's browser application and server API are built and run from the NEXO repository as a deployable container. It ensures a checkout does not depend on a sibling source repository.

## ADDED Requirements

### Requirement: Build NEXO from the repository
The system SHALL provide separate web and API container targets for NEXO using only files tracked in this repository and declared external images.

#### Scenario: Build from an isolated checkout
- **WHEN** an operator builds NEXO from a clean checkout without access to sibling repositories
- **THEN** the build produces a web container serving the browser application and an API container serving its server routes

### Requirement: Configure the NEXO server at runtime
The system SHALL accept RAGFlow connection settings through runtime environment variables and SHALL keep API credentials on the server side.

#### Scenario: Configure RAGFlow without rebuilding
- **WHEN** an operator supplies the RAGFlow base URL and API key to the NEXO container
- **THEN** NEXO's server API uses those values for RAGFlow requests without exposing the API key to browser clients

#### Scenario: Required RAGFlow settings are absent
- **WHEN** a request requires RAGFlow and its required connection settings are missing
- **THEN** the server API returns a clear configuration error and does not include a credential in the response

### Requirement: Exclude secrets from the image
The system SHALL NOT include local secret files, runtime credentials, or generated application data in the NEXO container image.

#### Scenario: Build with local credentials present
- **WHEN** an operator builds the image from a working tree containing local environment files
- **THEN** those secret values are absent from the resulting image layers
