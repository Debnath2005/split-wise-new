# ADR-0012: Greedy debt simplification, suggestions only

- **Status:** Accepted
- **Date:** 2026-10-01
- **Spec refs:** SPEC §6 Group balances, §7

## Context
Groups build up tangled debts. Users want fewer payments to settle up.

## Decision
- Per group (`groups.simplify_debts`, on by default), suggested transfers come from a pure, deterministic **greedy** algorithm in `shared/src/lib/money/simplify.ts`. It repeatedly matches the largest creditor with the largest debtor (ties broken by user id) and produces ≤ n−1 transfers.
- Simplification only changes the **suggestions**. It never modifies stored expenses or settlements. Toggling it logs `group_settings_changed`.

## Consequences
- The result isn't always the global minimum (that problem is NP-hard), but it's good enough and predictable.
- Covered by property-based tests: the transfers bring every net to zero, there are ≤ n−1 of them, and all amounts are > 0.

## Alternatives considered
- **Exact minimum-transfer search**: exponential time, and the gain for small groups is small.
- **Rewriting the ledger**: destroys the history.
