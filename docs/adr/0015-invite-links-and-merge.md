# ADR-0015: Invite links, and merging a placeholder into an existing account

- **Status:** Accepted
- **Date:** 2026-10-01
- **Spec refs:** SPEC §5 `invites`, §10 Invites, §11, §13
- **Relates to:** ADR-0005 (placeholder users, claimed in place) — extends it with a deliberate, link-only exception

## Context
Placeholders are claimed when someone signs up with a matching email or phone (ADR-0005). That has two gaps:
1. Friends often sign up with a different email or phone than the one you entered, so their history doesn't follow them.
2. Someone who *already* has an account can never claim a placeholder made for them. Their debts stay split across two users.

The owner asked for a shareable invite link on Add friend.

## Decision
- **Invite links.** For a placeholder, any of its friends can create a link `/invite/<token>`.
  - The token is 32 random bytes (base64url). Only its SHA-256 is stored, the same as sessions (ADR-0004).
  - It is **single use** and **expires after 30 days**. Creating a new link for the same placeholder cancels the old one.
  - The preview `GET /invites/:token` needs no login, and gives the same "invalid" answer for unknown, expired and used tokens.
- **Signup with a link** claims *that* placeholder in place, as in ADR-0005, even if the email differs. The email must still not belong to another real account. The existing email/phone matching stays.
- **Accepting a link while logged in merges** the placeholder into the current account, in one transaction:
  - Every foreign key moves to the account: memberships, friendships, expenses (payer, creator, editor, deleter), shares, settlements, activity actors and recipients, and created-by fields.
  - Duplicates are collapsed. **Two shares in one expense are summed** (owed paise; exact paise or percent basis points for the stored input), so every balance is unchanged.
  - Rows that would point a person at themselves are removed: a settlement between them, or a friendship with themselves.
  - The ids stored inside old activity snapshots are rewritten, so history reads correctly.
  - The placeholder row is deleted and the invite marked used.
- Merging is allowed **only through an invite link**. ADR-0005's "no merge on signup" still holds for email/phone matching.

## Consequences
- Every balance is the same before and after a merge (tested), for the account and for everyone else.
- The merge code must know every table that references `users.id`. **Any new table with a user foreign key must be added to the merge**, and the merge test fails if one is missed.
- Like the rest of the MVP, a link is a bearer token: whoever has it can claim the placeholder. Single use, expiry and regeneration limit the damage of a leak.

## Alternatives considered
- **Refuse existing accounts:** simpler, but it strands the debts this feature exists to connect.
- **Just befriend, no merge:** the debts still don't follow the person.
- **Merge on email/phone match at signup:** rejected in ADR-0005, and still rejected. Only possessing a link is strong enough to justify a merge.
