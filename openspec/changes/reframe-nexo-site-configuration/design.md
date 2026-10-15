## Context

The main route renders the existing NEXO prototype in an iframe. RAGFlow calls
read `RAGFLOW_BASE_URL` and `RAGFLOW_API_KEY` from process or `.env` values.
NEXO already has SQLite storage, AES-256-GCM helpers, authenticated sessions,
and site-admin guards. The current `/admin` asset is an operations console,
which duplicates work that belongs in the product interface.

## Goals / Non-Goals

**Goals:**

- Make the existing main-site Configuration affordance open product operations.
- Keep the site-admin surface small and dedicated to site and RAGFlow connection
  configuration.
- Allow safe runtime connection updates without leaking the API key.
- Preserve deployment configuration as an effective fallback.

**Non-Goals:**

- Replicate all RAGFlow administrative or infrastructure controls.
- Return, export, or display any saved RAGFlow API key.
- Replace RAGFlow's own admin frontend.

## Decisions

### Integrate operations into the existing main application shell

Extend the static NEXO application behind the homepage iframe rather than add a
second application. The Configuration control opens an in-site workspace or
overlay with the operational views. Existing protected NEXO API contracts can
be reused, with authorization adjusted where appropriate for normal product
users.

### Keep admin as a connection-settings surface

`/admin` becomes a compact site-admin settings page. Its primary panel contains
the effective RAGFlow base URL, credential-configured state, source
(deployment-managed or site-managed), save controls, and a validation action.
Operational resource views are removed from this surface.

### Store an override record in SQLite

Add a singleton site-settings record with a base URL and encrypted API-key
override. The RAGFlow server client resolves each setting in this order:

1. Saved site-admin override.
2. Deployment environment or `.env` value.

The API key is encrypted with the existing `NEXO_ENCRYPTION_KEY`. Read APIs
return only `apiKeyConfigured`; write APIs accept an optional replacement key.
Saving a blank key retains an existing override. A deliberate clear action, if
provided, requires explicit confirmation and falls back to deployment values.

### Validate from the server

The browser asks NEXO to validate the effective configuration. NEXO performs a
small RAGFlow request server-side, maps failures to safe status messages, and
does not include request headers, raw upstream bodies, or credential fragments
in its response.

## Risks / Trade-offs

- Runtime settings add a stateful override above deployment configuration.
  Showing the value source and supporting explicit clear avoids ambiguity.
- Moving operations into the iframe requires a clear message boundary between
  the static app and protected same-origin APIs. The implementation must avoid
  embedding secrets or connection state in static assets.
- An unavailable RAGFlow instance must leave the main site usable and surface a
  recoverable connection state instead of blocking navigation.

## Migration Plan

1. Add the singleton settings storage and effective-setting resolver while
   retaining environment fallback.
2. Add protected settings read, update, clear, and validate endpoints.
3. Integrate the operations workspace with the main NEXO application and wire
   the existing Configuration control.
4. Reduce `/admin` to connection and site settings, then remove duplicated
   operational navigation and assets.
5. Validate both deployment-managed and saved-setting paths before release.

## Open Questions

- None. The proposal assumes the current main-site Configuration control is the
  intended entry point and that normal users may operate only resources their
  existing NEXO role permits.

