# ADR-0007: Exactly one payer per expense

- **Status:** Accepted
- **Date:** 2026-10-01
- **Spec refs:** SPEC §1 Non-Goals, §5 `expenses.paid_by_user_id`, §6

## Context
Supporting multiple payers complicates the data model, the UI, and the meaning of "who owes whom" between two people.

## Decision
- `expenses.paid_by_user_id` is a single non-null column. `expense_shares` stores only `owed_paise`.
- The payer doesn't have to be a participant.

## Consequences
- Pairwise debt is unambiguous: participant B owes payer A `share(B)`.
- Adding multiple payers later needs a new ADR and a migration (for example, `paid_paise` per participant), plus a new pairwise definition.

## Alternatives considered
- **A `paid_paise` column per participant now**: more flexible, but makes pairwise balances ambiguous and adds UI complexity the MVP doesn't need.
