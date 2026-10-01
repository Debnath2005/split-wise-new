# ADR-0009: Any involved member may edit; optimistic concurrency

- **Status:** Accepted
- **Date:** 2026-10-01
- **Spec refs:** SPEC §2 (D3), §9 Permissions, §9 Concurrency

## Context
Mistakes in shared expenses get fixed by whoever notices. Two people may edit the same expense at once.

## Decision
- **Permissions**: any current group member can edit, delete or restore group expenses. For non-group expenses, only the payer or a participant can. Settlements can be deleted by `from`, `to`, or any group member.
- Permissions are enforced in the **service layer**, not routes.
- **Concurrency**: each expense has a `version`. The update runs `WHERE id=? AND version=?`, and if nothing matches it returns 409 `CONFLICT`. The client then refetches and asks the user to try again.

## Consequences
- Low friction. Accountability comes from the activity feed (ADR-0011) and soft delete (ADR-0010).
- No silent lost updates.

## Alternatives considered
- **Creator-only edits**: blocks people from fixing others' mistakes.
- **Last write wins**: silent data loss.
