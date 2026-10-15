## 1. Secure connection settings

- [x] 1.1 Add a versioned singleton SQLite record for RAGFlow base URL and encrypted API-key override, including a safe migration path for existing NEXO data.
- [x] 1.2 Add an effective RAGFlow settings resolver that prefers saved values and falls back to deployment environment values.
- [x] 1.3 Update the RAGFlow client to use the effective resolver and retain sanitized upstream error handling.
- [x] 1.4 Add site-admin-only settings read, update, clear, and validation endpoints with origin checks; expose only base URL, source, key-configured state, and safe validation results.

## 2. Main-site configuration workspace

- [x] 2.1 Inspect and extend the existing `nexo-prototipo.html` application rather than create a second product shell.
- [x] 2.2 Wire the visible Configuration control to an interactive in-site workspace that uses authenticated NEXO APIs.
- [x] 2.3 Move knowledge, assistant, document, Data Source, and MCP operational flows into the main-site workspace with capability-aware actions and recoverable states.
- [x] 2.4 Ensure normal users see only authorized operational views and cannot access site-admin connection controls.

## 3. Configuration-focused admin surface

- [x] 3.1 Replace the operations-admin navigation with a compact RAGFlow connection settings page for site administrators.
- [x] 3.2 Show effective base URL, setting source, API-key configured state, save/replace controls, explicit clear-to-deployment action, and connection validation feedback.
- [x] 3.3 Prevent API keys, authorization headers, encrypted values, and sensitive upstream error bodies from rendering in the browser or server logs.
- [x] 3.4 Remove or redirect duplicated operations-admin entry points after the main-site workspace is available.

## 4. Validation and documentation

- [x] 4.1 Add focused coverage for effective-setting precedence, encryption boundaries, authorization, origin validation, clear behavior, and sanitized validation failures.
- [x] 4.2 Add focused client coverage for Configuration entry, authorization-gated controls, save-without-key-replacement, and unavailable-connection states.
- [x] 4.3 Update `.env.example` and the NEXO README to explain deployment fallback, runtime configuration, encryption-key requirements, and the revised navigation model.
- [x] 4.4 Perform a walkthrough for unconfigured, deployment-managed, site-managed, invalid-connection, and normal-user states.

