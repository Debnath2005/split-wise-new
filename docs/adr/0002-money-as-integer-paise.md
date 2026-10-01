# ADR-0002: Money as integer paise, percent as basis points

- **Status:** Accepted
- **Date:** 2026-10-01
- **Spec refs:** SPEC §2 (D5, D6), §4, §4.1

## Context
Binary floats can't represent most decimal rupee amounts exactly, so `0.1 + 0.2` style errors would build up in balances. Splits also produce remainders (₹100 / 3), and those must go somewhere deterministic.

## Decision
- Every amount is an **integer number of paise**: SQLite `INTEGER`, JSON `number`, TS `number`, checked with `Number.isSafeInteger`. The app is INR only.
- Percent is stored in **basis points** (1% = 100, total 10000).
- User input is converted with **string math** in `parseRupeesToPaise`, never `parseFloat * 100`. Only `formatPaise` divides by 100, and only for display.
- Split remainders go out 1 paisa at a time in a deterministic order (participants sorted by user id ascending; for percent splits, largest remainder first). Invariant: `Σ owed_paise === amount_paise`.
- All money math lives in `shared/src/lib/money/`, with unit tests.

## Consequences
- Balances are exact and reproducible, and tests can assert exact equality.
- The limit is ₹10,00,000 per expense (1e8 paise). `A * bp` ≤ 1e12 stays well within the safe-integer range.
- Floats must never appear in money code. Reviewers should reject `toFixed`, `parseFloat` or `/ 100` outside formatting.

## Alternatives considered
- **Decimal library (big.js, dinero.js)**: correct, but adds a dependency and a type that has to be serialized. Integers are simpler with a single currency.
- **Rupees as REAL / float**: rejected because of rounding errors.
- **Store percent as float**: same rounding problem.
