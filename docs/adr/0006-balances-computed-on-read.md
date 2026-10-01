# ADR-0006: Balances computed on read

- **Status:** Accepted
- **Date:** 2026-10-01
- **Spec refs:** SPEC §2 (D7), §6, §12

## Context
Balances change whenever an expense or settlement is created, edited, deleted or restored. A stored balance would have to be kept in sync with every one of those changes.

## Decision
- There is **no balance table**. Nets and pairwise balances are aggregated from `expenses`, `expense_shares` and `settlements` (excluding soft-deleted rows) each time they're requested.
- Sign convention: **positive = others owe you**. Invariant: Σ net over the members of a scope = 0.
- The pairwise formula relies on the single-payer rule (ADR-0007).

## Consequences
- There's one source of truth, and edits or restores can't leave a stale balance behind.
- Read cost grows with history. It's fine for the target (≤ 5k expenses per group). Revisit with cached nets if p95 goes above 200ms, which would mean a new ADR.
- Balance queries must be tested against hand-computed fixtures and the Σ = 0 invariant.

## Alternatives considered
- **Materialized balance table updated on write**: faster reads, but risks drift and makes edit/delete/restore harder.
