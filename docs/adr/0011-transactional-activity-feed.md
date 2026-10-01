# ADR-0011: Activity feed written in the same transaction as each change

- **Status:** Accepted
- **Date:** 2026-10-01
- **Spec refs:** SPEC §5 `activities`, `activity_recipients`, §9

## Context
The activity feed is how users trust shared history. It must never miss a change or show one that didn't happen.

## Decision
- Every mutating service call writes one `activities` row (with a JSON snapshot: `{before, after}` for updates, `{before}` for deletes) and the matching `activity_recipients` rows **in the same DB transaction** as the change.
- Recipients: all group members for group items. For non-group items, the payer, participants and settlement parties. For updates, the **union of before and after** participants.
- Read state is tracked per recipient (`read_at`).

## Consequences
- The feed and the data can't disagree, and removed participants still see what changed.
- The feed query is a simple index scan on `activity_recipients(user_id, activity_id DESC)`.
- Snapshots duplicate some data, which is acceptable.

## Alternatives considered
- **Derive the feed from current rows**: loses the before/after history.
- **Async events/queue**: more moving parts and possible inconsistency.
- **Fan-out on read**: complex visibility queries.
