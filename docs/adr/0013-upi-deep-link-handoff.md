# ADR-0013: UPI deep-link handoff with self-reported settlements

- **Status:** Accepted
- **Date:** 2026-10-01
- **Spec refs:** SPEC §1 Non-Goals, §8

## Context
Indian users pay each other through UPI apps. Integrating a real payment provider is outside the MVP's scope and needs merchant onboarding.

## Decision
- Settle-up builds `upi://pay?pa=&pn=&am=&cu=INR&tn=` from the payee's `upi_vpa`. The `am` string is built from integer paise (ADR-0002). Phones get the link, desktop gets a client-side QR code, and a "Copy UPI ID" fallback is always shown.
- The app **does not verify** payments. The user confirms "Did the payment go through?" and a settlement (`method='upi'`) is recorded. Cash/other payments can be recorded without UPI.

## Consequences
- No payment provider and no fees, and it works with any UPI app.
- Settlements are self-reported. They can be deleted by either party and are audited in the feed.
- Some UPI apps limit P2P links with a pre-filled amount, so the M6 DoD requires testing on GPay, PhonePe, Paytm and BHIM.

## Alternatives considered
- **Payment provider (Razorpay etc.)**: needs KYC and merchant onboarding, adds fees, and is overkill for P2P.
