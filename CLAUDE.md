# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Splitwise-style expense splitter (INR/UPI, mobile-first). npm workspaces: `client/` (React + TS + Vite + Tailwind), `server/` (Express + TS, SQLite via Drizzle + better-sqlite3), `shared/` (code used by both sides).

## Rules

- **Follow `SPEC.md`.** If something isn't in it, ask before building it. Build in milestone order (SPEC §15).
- **Architecture decisions live in `docs/adr/`.** Before changing how something is built, check for a relevant ADR. If a change contradicts an accepted ADR, stop and ask.
- **UI** follows `DESIGN.md` and uses only components from `client/src/components/ui`.
- **TypeScript strict** in every workspace.
- **Money is always integer paise, never floats**: in the DB, the API and the code. Percent is stored in basis points.
- **All money math** (parse/format, splits, balances helpers, simplify debts) lives in `shared/src/lib/money`, with unit tests. The server recomputes splits there and never trusts the client's numbers.

## When a task is finished

1. Run tests, lint and the build. Fix any failures before continuing.
2. Report the results and list exactly what to check manually on a phone.
3. Wait for the user to confirm it works. **Do not commit before confirmation.**
4. If they report a problem, fix it and repeat from step 1.
5. Only after confirmation, commit with a clear message.

Never commit failing tests or a broken build.

## Commands

- `npm run dev`: shared (tsc watch) + server (:3000, tsx watch) + client (:5173, proxies `/api`, LAN-exposed for phones)
- `npm test` / `npm run lint` / `npm run format:check` / `npm run typecheck` / `npm run build`: what CI runs. `test` and `typecheck` build `shared` first, because the other workspaces import its `dist/`.
- Single test: `npm test -w server -- src/app.test.ts -t "reports API"`
- New migration: edit `server/src/db/schema.ts`, then `npm run db:generate -w server`. Migrations apply automatically when the server starts.
- Production: `npm run build && npm start` (Express serves `client/dist`). `DATABASE_PATH` defaults to `server/data/app.db`.
