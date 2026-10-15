# Tasks

## 1. Re-select the RAGFlow backend boundary

- [x] 1.1 Trace the RAGFlow backend startup and transitive dependencies for datasets, document processing/chunks, graph metadata, and chat; record the selected modules/services, upstream version, license, and omitted components in `design.md`.
- [ ] 1.2 Confirm a buildable RAGFlow backend can be reduced to the selected source closure without requiring `..\\ragflow-be` at build or runtime; define the resource measurement method and compare with the recorded ~6.5 GiB baseline.

## 2. Build the selected backend from this repository

- [x] 2.1 Add the selected RAGFlow backend source/build inputs under this repository with upstream license and attribution; do not copy the RAGFlow admin frontend, SDKs, samples, or unused modules.
- [x] 2.2 Add a backend Docker target that builds from the in-repository selected source and verify it builds without sibling directories.
- [ ] 2.3 Keep generated binaries, caches, local configuration, credentials, and runtime data outside tracked source and image layers.

## 3. Integrate the runtime into NEXO Compose

- [x] 3.1 Add only the dependency services proven necessary by the selected backend and NEXO's required flows; apply safe resource limits/defaults and persistent named volumes.
- [ ] 3.2 Configure the NEXO API to use the private Compose service endpoint and server-only credential; remove the external RAGFlow deployment requirement and browser-facing separate admin link.
- [x] 3.3 Add readiness/health checks and dependency ordering so NEXO does not report healthy before RAGFlow and its required stores are ready.
- [ ] 3.4 Make the single documented `docker compose up --build -d` command build and start all NEXO and selected RAGFlow services.

## 4. Restore required operator flows and document deployment

- [ ] 4.1 Verify dataset discovery/management, document processing, chunk/graph context, and assistant chat against the in-repository backend.
- [ ] 4.2 Update README setup, secrets, ports, storage backup/restore, clean stop, and upgrade instructions for the one-project deployment.
- [ ] 4.3 Measure idle and active memory for the selected stack and document the result; do not declare completion unless it is below the recorded full-stack baseline.
