# Tasks

## 1. Containerize the NEXO application

- [x] 1.1 Add production Docker targets for the NEXO web and API services and verify both build from the NEXO repository root without sibling source directories.
- [x] 1.2 Add a Docker ignore policy and safe environment example; verify local secrets, dependency directories, and generated data are excluded from the build context.
- [x] 1.3 Verify the container serves the browser UI and server API with runtime RAGFlow settings, and confirm missing settings return a safe configuration error.

## 2. Add default Compose deployment and admin access

- [x] 2.1 Add default Compose services for NEXO web and API, wire browser API requests through the web proxy, and accept external RAGFlow API/key/admin settings; verify both services start and no RAGFlow engine services start.
- [x] 2.2 Add a NEXO entry point for the configured RAGFlow admin URL and document local versus Compose-network API URLs; verify both URLs can be configured independently.

## 3. Select the RAGFlow integration boundary

- [x] 3.1 Inspect the sibling RAGFlow backend and select the HTTP API operations NEXO needs for datasets, chunks/metadata, graph context, and chat.
- [x] 3.2 Exclude Go handlers and internal engine/storage packages because they are coupled; exclude the Python SDK because the existing Node API adapter already performs those HTTP calls.
- [x] 3.3 Keep RAGFlow engine services and persistent volumes outside this repository; document NEXO-only start/stop and rollback procedures without affecting RAGFlow data.
