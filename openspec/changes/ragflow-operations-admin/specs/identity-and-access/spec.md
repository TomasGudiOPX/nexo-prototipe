# Spec Delta

## Purpose

Provides authenticated NEXO accounts and role-based authorization so administrative RAGFlow operations are restricted to trusted site administrators.

## ADDED Requirements

### Requirement: Users authenticate to NEXO
NEXO SHALL require an authenticated account for user-specific and administrative actions, and SHALL keep credentials and session secrets out of browser-delivered code.

#### Scenario: Valid sign-in
- **WHEN** an active user submits valid credentials
- **THEN** NEXO establishes an authenticated session for that user

#### Scenario: Invalid or inactive account
- **WHEN** invalid credentials are submitted or a deactivated account attempts to sign in
- **THEN** NEXO denies access without disclosing whether a particular account exists

### Requirement: Site-admin is the only operations-panel role
NEXO SHALL authorize only users with the `site-admin` role to access the operations panel and its protected APIs, and SHALL enforce authorization on the server for every protected operation.

#### Scenario: Site admin opens operations panel
- **WHEN** an authenticated `site-admin` requests an operations-panel page or API
- **THEN** NEXO grants access subject to the requested operation's validation

#### Scenario: Regular user requests operations panel
- **WHEN** an authenticated non-admin requests an operations-panel page or API
- **THEN** NEXO denies the request and does not perform the operation

#### Scenario: Anonymous request targets protected operation
- **WHEN** an unauthenticated request targets an operations-panel API
- **THEN** NEXO rejects it and does not perform the operation

### Requirement: Site admins manage NEXO users
NEXO SHALL allow site admins to create, view, update, assign supported roles to, and deactivate user accounts, and SHALL prevent the system from being left without an active site admin.

#### Scenario: Admin creates a site user
- **WHEN** a site admin creates a user with valid account details and an allowed role
- **THEN** NEXO stores the account and makes it available for sign-in according to its activation state

#### Scenario: Last active admin is deactivated or demoted
- **WHEN** an operation would remove the final active `site-admin`
- **THEN** NEXO rejects the operation and leaves the admin account unchanged

### Requirement: First site admin is bootstrapped securely
NEXO SHALL provide a deployment-time bootstrap path for the initial site admin that does not expose a public self-registration path or place bootstrap credentials in client responses.

#### Scenario: Initial admin bootstrap
- **WHEN** an operator configures valid first-admin bootstrap credentials for a fresh NEXO installation
- **THEN** NEXO creates the initial `site-admin` account and does not repeat bootstrap after initialization

#### Scenario: Bootstrap after initialization
- **WHEN** bootstrap credentials are supplied after an initial admin already exists
- **THEN** NEXO does not create or overwrite an account through the bootstrap path
