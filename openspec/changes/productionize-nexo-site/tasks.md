## 1. Foundation and authorization

- [x] 1.1 Inventory current demo markup and the available protected RAGFlow APIs.
- [x] 1.2 Add versioned storage for workspaces, memberships, resource bindings, activity events, and hashed NEXO API keys.
- [x] 1.3 Enforce workspace and site-admin authorization on every new endpoint.

## 2. Main site information architecture

- [x] 2.1 Replace demo navigation with Home, Workspaces, Knowledge, Assistants, Activity, Reports, and Configuration.
- [x] 2.2 Build independent API-backed views and remove the operations modal from Configuration.
- [x] 2.3 Replace demo projects/documents/alerts/reports with real state, empty states, and unavailable-state messaging.

## 3. Product operations and settings

- [x] 3.1 Build workspace management and bind datasets and assistants by name.
- [x] 3.2 Build Knowledge and Assistant workflows on the existing RAGFlow proxy APIs.
- [x] 3.3 Add sanitized RAGFlow provider/model configuration and validation for site admins.
- [x] 3.4 Implement generate-once, hashed, scoped, revocable NEXO agent API keys.
- [x] 3.5 Record activity and produce reports only from stored events and observable state.

## 4. Validation and release readiness

- [x] 4.1 Add focused coverage for role scope, workspace bindings, event creation, provider secrecy, and API-key lifecycle.
- [ ] 4.2 Validate each navigation area in empty, populated, unavailable-RAGFlow, and normal-user states.
- [x] 4.3 Update operator documentation for provider setup, agent API keys, and the production navigation model.
