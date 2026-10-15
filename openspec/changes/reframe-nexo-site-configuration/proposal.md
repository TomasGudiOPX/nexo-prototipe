# Reframe NEXO site configuration

## Why

NEXO currently separates the primary experience from `/admin`, even though the
most common work—knowledge, assistants, documents, and integrations—is part of
using the product. The primary route is also only an iframe, so its visible
Configuration control cannot open a first-class NEXO experience. Meanwhile,
the RAGFlow base URL and API key are fixed through server environment variables,
which makes a deployment difficult to configure safely from the product.

## What Changes

- Move day-to-day RAGFlow resource management into the main NEXO site and make
  it reachable from the existing Configuration control.
- Reframe the site-admin surface as a narrow connection and site-settings area,
  rather than an operations console.
- Allow a site administrator to configure the RAGFlow base URL and API key,
  validate the connection, and see a non-secret connection summary.
- Persist the API key encrypted in NEXO-managed storage; never return its value
  to browsers, logs, or status responses.
- Preserve environment values as initial or deployment-level fallbacks until a
  site-admin setting is saved.

## Impact

- Affected code: primary NEXO static application, homepage integration, admin
  API routes, RAGFlow client configuration, database schema, and deployment
  configuration documentation.
- Affected capabilities: main-site navigation, RAGFlow connection management,
  secure credential storage, and site-admin authorization.
- Existing operations-admin UI will be replaced or reduced so its operational
  views do not duplicate the main site.
