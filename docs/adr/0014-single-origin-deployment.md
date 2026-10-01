# ADR-0014: Single-origin deployment (Express serves the client)

- **Status:** Accepted
- **Date:** 2026-10-01
- **Spec refs:** SPEC §3, §12, M8

## Context
Cookie sessions (ADR-0004) and the CSRF approach are simplest when the API and UI share an origin.

## Decision
- In production, Express serves the built `client/dist` and the API at `/api/v1` from one origin and one process.
- In dev, the Vite dev server proxies `/api` to Express.
- Deploy as one container with a persistent volume for the SQLite file. The hosting target is still open (SPEC §16).

## Consequences
- No CORS in production, and `SameSite=Lax` cookies just work.
- The client and API deploy together, so they can't drift between versions.
- No CDN-separated frontend in the MVP.

## Alternatives considered
- **Separate static host + API domain**: needs CORS and cross-site cookie settings.
