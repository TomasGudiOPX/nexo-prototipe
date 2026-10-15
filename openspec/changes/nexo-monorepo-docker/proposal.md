# Proposal

## Why

The current deployment contains NEXO's web app and adapter API but not the RAGFlow backend that serves datasets, document processing, retrieval, and chat. The adapter therefore depends on a second, separately checked out and deployed RAGFlow stack. That violates the monorepo deployment requirement and is the direct cause of `No se pudo conectar con RAGFlow.` when that stack is absent or stopped.

NEXO needs one repository and one Compose project that builds and starts the browser app, NEXO API, and a deliberately selected RAGFlow backend runtime. The selection must omit RAGFlow's unrelated admin web app, client SDKs, optional services, and unused backend modules, while retaining every component required by NEXO's dataset, document, graph, and assistant flows. It must also reduce the current measured runtime footprint rather than reproducing the complete RAGFlow stack unchanged.

## What Changes

- Keep NEXO frontend, NEXO API, and selected RAGFlow backend source/build files in this repository; no build or runtime step may read `..\\ragflow-be` or require a second checkout.
- Replace the external-only RAGFlow URL dependency with an internal Compose service built from the selected in-repository RAGFlow backend source.
- Include only the RAGFlow runtime dependencies proven necessary by the selected backend paths; tune resource use and document the measured total.
- Keep RAGFlow credentials and service-to-service URLs server-side. NEXO API uses the internal Compose network and exposes neither credentials nor internal service URLs to browsers.
- Keep NEXO's operations panel as the operator interface. Do not bundle RAGFlow's separate admin frontend.
- Keep service state in named volumes owned by this Compose project, with documented backup and upgrade behavior.

## Capabilities

### Modified Capabilities

- `nexo-containerized-runtime`: the default Compose deployment includes the selected RAGFlow runtime required by NEXO, all built/deployed from this repository.
- `ragflow-api-integration`: NEXO's server adapter talks to the in-repository RAGFlow service over the private Compose network; a separately running RAGFlow installation is not required.

## Impact

Affected areas include selected vendored/upstream backend source and attribution, Docker build targets, root Compose services and health dependencies, server-only configuration, operations bootstrap, persistent volumes, and deployment documentation. The completed change must build from an isolated clone of this repository and must not depend on sibling source directories or an independently started RAGFlow stack.
