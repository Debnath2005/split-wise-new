# Architecture Decision Records

Each ADR records one decision: its context, the decision and its consequences. Before changing how something is built, check here. If a change contradicts an **Accepted** ADR, stop and ask (see `CLAUDE.md`).

**Process:** copy `0000-template.md` to the next number. New ADRs start as **Proposed** and become **Accepted** once approved. Never edit the decision in an accepted ADR. Write a new one that supersedes it, and mark the old one `Superseded by ADR-XXXX`.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-monorepo-with-shared-package.md) | npm workspaces monorepo with a `shared` package | Accepted |
| [0002](0002-money-as-integer-paise.md) | Money as integer paise, percent as basis points | Accepted |
| [0003](0003-sqlite-drizzle-better-sqlite3.md) | SQLite + Drizzle ORM + better-sqlite3 | Accepted |
| [0004](0004-email-password-auth-server-sessions.md) | Email + password auth, server-side sessions | Accepted |
| [0005](0005-placeholder-users-claimed-in-place.md) | Placeholder users, claimed in place | Accepted |
| [0006](0006-balances-computed-on-read.md) | Balances computed on read | Accepted |
| [0007](0007-single-payer-per-expense.md) | Exactly one payer per expense | Accepted |
| [0008](0008-server-authoritative-splits.md) | Server computes splits; split input is stored | Accepted |
| [0009](0009-edit-permissions-and-concurrency.md) | Any involved member may edit; optimistic concurrency | Accepted |
| [0010](0010-soft-delete-with-restore.md) | Soft delete with restore | Accepted |
| [0011](0011-transactional-activity-feed.md) | Activity feed written in the same transaction | Accepted |
| [0012](0012-greedy-debt-simplification.md) | Greedy debt simplification, suggestions only | Accepted |
| [0013](0013-upi-deep-link-handoff.md) | UPI deep-link handoff, self-reported settlements | Accepted |
| [0014](0014-single-origin-deployment.md) | Single-origin deployment | Accepted |
