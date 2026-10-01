# ADR-0004: Email + password auth with server-side sessions

- **Status:** Accepted
- **Date:** 2026-10-01
- **Spec refs:** SPEC §2 (D1), §10 Auth, §12

## Context
Users need accounts. The MVP should not depend on SMS, email or OAuth providers.

## Decision
- Email + password, hashed with argon2id (bcrypt cost 12 as a fallback).
- **Server-side sessions**: a random 32-byte id goes in an `httpOnly`, `SameSite=Lax`, `Secure` (prod) cookie. Only its SHA-256 is stored in `sessions`. The cookie has a 30-day sliding expiry.
- CSRF defense: SameSite=Lax plus a required `X-Requested-With: fetch` header on mutating requests.
- Rate limits: 5/min on auth endpoints.

## Consequences
- Sessions can be revoked right away (logout deletes the row). No JWTs to handle.
- Needs same-origin deployment (ADR-0014) for a simple cookie setup.
- No email verification, which creates the placeholder-claim risk described in ADR-0005. Verification is required before a public launch.
- No password reset in the MVP (it needs email delivery).

## Alternatives considered
- **Phone OTP / magic link**: needs an SMS or email provider.
- **Google OAuth**: needs external setup, and not every user wants to log in with Google.
- **JWT in localStorage**: XSS can steal it, and it's hard to revoke.
