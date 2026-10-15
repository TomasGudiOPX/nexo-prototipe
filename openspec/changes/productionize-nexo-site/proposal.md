# Productionize the NEXO site

## Why

The main NEXO site still presents demo projects, documents, alerts, and reports.
It also puts product operations in a Configuration modal. This hides distinct
workflows, prevents trustworthy operational state, and does not support a
production deployment backed by RAGFlow.

## What Changes

- Replace the demo navigation with Home, Workspaces, Knowledge, Assistants,
  Activity, Reports, and Configuration.
- Make each area an independent, API-backed workflow instead of tabs in a modal.
- Add NEXO workspaces that group authorized users with RAGFlow datasets and
  assistants.
- Replace demo documents, alerts, and reports with RAGFlow-backed data and
  persisted NEXO events; identify unavailable measures explicitly.
- Limit Configuration to RAGFlow connection, model providers/models, and
  revocable NEXO agent API keys.

## Impact

- Affected code: primary NEXO static application, protected API routes, SQLite
  schema, RAGFlow integration, session authorization, and documentation.
- NEXO becomes the product workspace while RAGFlow remains authoritative for
  datasets, documents, assistants, providers, and models.
