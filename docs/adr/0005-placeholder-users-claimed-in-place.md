# ADR-0005: Placeholder users, claimed in place

- **Status:** Accepted
- **Date:** 2026-10-01
- **Spec refs:** SPEC §2 (D2), §5 "Placeholder users"

## Context
Groups often include people who haven't signed up yet. Users must be able to log expenses with them right away.

## Decision
- Adding a person by name + email/phone **reuses** any existing user row with that email or phone. Otherwise it inserts a **placeholder** (`is_placeholder=1`, `password_hash NULL`).
- When someone signs up with a matching email or phone, the placeholder **row becomes their account** (same `id`). There's no merge or data migration.
- Placeholders can't log in, and are only visible to people who share a friendship or group with them.

## Consequences
- All foreign keys stay valid when a placeholder is claimed, so the app needs no merge logic.
- Email and phone must be unique and normalized (lowercase email, E.164 phone) before lookup.
- **Known risk:** without verification, someone could sign up with another person's email and claim their placeholder. This is accepted for the MVP. Email/OTP verification before claiming is required before a public launch (SPEC §13).

## Alternatives considered
- **Registered users only**: you can't log an expense until everyone has joined.
- **Separate placeholder table + merge on signup**: needs complex re-pointing of foreign keys in every table.
