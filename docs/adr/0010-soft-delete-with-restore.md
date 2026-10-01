# ADR-0010: Soft delete with restore

- **Status:** Accepted
- **Date:** 2026-10-01
- **Spec refs:** SPEC §2 (D8), §5, §9

## Context
Because any involved member can delete (ADR-0009), deletions must be recoverable and visible.

## Decision
- `expenses` and `settlements` have `deleted_at` / `deleted_by_user_id`. Delete sets them, and restore clears them.
- Every balance and list query filters out `deleted_at IS NOT NULL`.

## Consequences
- Deleted items can be restored from the activity feed, which brings balances back to exactly where they were.
- Every query must remember the filter, so centralize it in the service/query helpers.
- There's no hard delete in the MVP.

## Alternatives considered
- **Hard delete + snapshot in activity**: restoring would mean re-inserting from JSON, which is fragile.
