# ADR-0001: npm workspaces monorepo with a shared package

- **Status:** Accepted
- **Date:** 2026-10-01
- **Spec refs:** SPEC §2 (D9), §3

## Context
The client and server must agree exactly on money parsing, split results, debt simplification and request validation. If the two sides drift apart, balances come out wrong.

## Decision
- One repo using npm workspaces: `client/` (React + Vite), `server/` (Express), `shared/` (plain TS, no DOM or Node APIs).
- `shared/` holds everything both sides must agree on: `src/lib/money/` (all money math) and `src/schemas.ts` (Zod schemas + inferred types).
- TypeScript `strict` in every workspace.

## Consequences
- Client forms and server validation use the same Zod schema, so they can't disagree.
- `shared/` must stay free of runtime dependencies beyond Zod, so it works in the browser and in Node.
- One install, and one CI pipeline that runs lint, typecheck, tests and build across all workspaces.

## Alternatives considered
- **Separate repos**: needs a published package or copied code for shared logic, which is too heavy for an MVP.
- **Single package with a top-level `src/`**: client and server code mix, and the build config gets messy.
