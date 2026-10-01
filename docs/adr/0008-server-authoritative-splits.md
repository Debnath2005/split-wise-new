# ADR-0008: The server computes splits and stores the split input

- **Status:** Accepted
- **Date:** 2026-10-01
- **Spec refs:** SPEC §4.1, §5 `expense_shares.input_value`, M3

## Context
The client shows live split previews, but a buggy or malicious client could send shares that don't add up. Editing an expense also needs to bring back the form the user originally filled in.

## Decision
- Clients send `split_type` + participants + raw values (paise for exact, basis points for percent). The **server recomputes** shares with `shared/src/lib/money/split.ts` and never trusts client-computed shares.
- Both the result (`owed_paise`) and the input (`input_value`, `split_type`) are stored.
- Mismatched sums are rejected with `SPLIT_SUM_MISMATCH`.

## Consequences
- The client and server use the same function (ADR-0001), so previews match what gets saved.
- The edit form can be rebuilt exactly as entered.

## Alternatives considered
- **Store only shares**: the edit form would lose the percentages the user entered.
- **Trust client shares**: breaks the sum invariant.
