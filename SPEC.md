# SPEC — Splitwise-style Expense Splitter (MVP)

> Status: Draft v1 · 2026-10-01
> Audience: whoever builds it (human or agent). Keep this doc in sync with the code.

---

## 1. Goals & Non-Goals

### Goals
- Let a small circle of people (friends, flatmates, trip groups) record shared expenses and see who owes whom.
- **Mobile-first**: most usage is on a phone browser. Every screen must work well at 360px wide.
- **Correct money math**: every amount is an integer number of **paise**. No floats anywhere in the money path.
- Settle up in a couple of taps with a **UPI deep link** (plus a QR code on desktop).
- Be able to trust the history: every create, edit, delete or settle shows up in an **activity feed**.

### Non-Goals (MVP)
- Multiple currencies or FX (the app is **INR only**).
- More than one payer per expense ("A paid ₹300 and B paid ₹200").
- Itemised or receipt splitting, receipt photos, OCR.
- Recurring expenses.
- Real payment processing or payment verification. UPI is a hand-off only.
- Email or SMS delivery: no verification emails, no invites, no notifications.
- Native apps. PWA install is a stretch goal (M8).
- Shares-based splits ("2 shares vs 1 share") and adjustment splits.

---

## 2. Decisions Log

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Auth | Email + password. Server-side sessions in an httpOnly cookie | No third-party services. Simple and secure enough for the MVP |
| D2 | Non-registered people | **Placeholder users**, claimed when they sign up | Expenses can be logged before everyone joins (this is how Splitwise works) |
| D3 | Edit/delete permission | **Any involved member** (group member, or a participant in a non-group expense) | Low friction. The activity feed and soft-delete provide accountability |
| D4 | DB access | **Drizzle ORM + better-sqlite3** | Typed schema, SQL-like queries, light migrations |
| D5 | Money unit | Integer **paise** (`INTEGER` in SQLite, `number` in TS, always guarded with `Number.isSafeInteger`) | No float rounding errors. ₹1 crore = 1e9 paise, far below the safe-integer limit |
| D6 | Percent precision | Stored as **basis points** (1% = 100 bp, total = 10 000) | Allows 2 decimal places of percent while staying an integer |
| D7 | Balances | **Computed on read** from expenses and settlements (no balance table) | One source of truth. Fast enough at MVP scale |
| D8 | Deletes | **Soft delete** (`deleted_at`) for expenses and settlements, with restore | The activity feed can show what was deleted and undo it |
| D9 | Repo layout | npm workspaces monorepo: `client`, `server`, `shared` | Zod schemas, types and money/split utilities are shared by both sides |

---

## 3. Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | React 18 + TypeScript, Vite, Tailwind CSS v4 (theme tokens from `DESIGN.md`), React Router, TanStack Query (server state), React Hook Form + Zod |
| Backend | Node.js 22 LTS (`.nvmrc`), Express 4, TypeScript (`tsx` for dev, `tsc` for build) |
| DB | SQLite (WAL mode) via better-sqlite3 + Drizzle ORM + drizzle-kit migrations. better-sqlite3 is pinned to 12.x through root `overrides`, because the 13.x prebuilt binary segfaults on Ubuntu 22.04 / Node 22.13 |
| Validation | Zod schemas in `shared/`, used by both client forms and server request validation |
| Auth | `argon2` (or `bcrypt` if native builds cause trouble), session table, `cookie-parser` |
| Security middleware | `helmet`, `express-rate-limit`, CORS locked to the client origin in dev (same origin in prod) |
| QR code | `qrcode` (client side) for the UPI link on desktop |
| Testing | Vitest (unit tests for shared and server), Supertest (API), Playwright (mobile-viewport E2E smoke tests) |
| Lint/format | ESLint + Prettier, `tsc --noEmit` in CI |

### Repo layout
```
/
├─ package.json            # workspaces: client, server, shared
├─ shared/
│  └─ src/
│     ├─ lib/money/        # ALL money math, each file with unit tests
│     │  ├─ money.ts       # parse/format paise
│     │  ├─ split.ts       # equal / exact / percent → shares
│     │  └─ simplify.ts    # debt simplification
│     └─ schemas.ts        # zod request/response schemas + inferred types
├─ server/
│  └─ src/
│     ├─ db/ (schema.ts, migrations/, client.ts)
│     ├─ routes/ (auth, users, friends, groups, expenses, settlements, balances, activity)
│     ├─ services/         # business logic + transactions
│     ├─ middleware/ (auth, validate, error)
│     └─ app.ts, index.ts
└─ client/
   └─ src/
      ├─ api/              # typed fetch wrapper + TanStack Query hooks
      ├─ components/ui/    # the only UI primitives screens may use (Button, Sheet, AmountInput, Avatar…), per DESIGN.md
      ├─ features/ (auth, friends, groups, expenses, settle, activity)
      ├─ routes/
      └─ main.tsx
```
In production, Express serves the built client from `client/dist`. Running on one origin means no CORS and lets us use a `SameSite=Lax` cookie.

---

## 4. Money Rules (MUST)

1. **Storage and transport**: every amount is an integer of paise, in both the DB and the JSON API. The API never sends rupees as floats.
2. **Parsing user input** (`shared/src/lib/money/money.ts` → `parseRupeesToPaise(str)`):
   - Accept `^\d{1,8}(\.\d{1,2})?$` after trimming and removing commas. Reject anything else, including negative numbers and exponents.
   - Convert with string math: `"123.4"` → `12340`. **Never** use `parseFloat(x) * 100`.
   - Allowed range: 1 paisa to ₹10,00,000.00 (1e8 paise) per expense. Make this a config constant.
3. **Formatting**: `formatPaise(12340)` → `"₹123.40"` with Indian grouping (`₹1,23,456.00`) via `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`. Pass `paise / 100` **only** for display.
4. **Invariant**: for every expense, `sum(shares.owed_paise) === expense.amount_paise`. Check it in the service layer and in a DB-level test.
5. **UPI amount string**: build it from integers, `${Math.floor(p/100)}.${String(p%100).padStart(2,'0')}`, never from float formatting.

### 4.1 Split algorithms (`shared/src/lib/money/split.ts`)
Input: `amount_paise`, an ordered list of participants (**sorted by user id ascending**, so results are deterministic), and the split type.

- **Equal**: `base = floor(A / n)`, `r = A - base*n`. The first `r` participants get `base + 1` and the rest get `base`.
  Example: ₹100.00 split 3 ways gives 3334 / 3333 / 3333.
- **Exact**: the user enters each share in paise. Validation: every share ≥ 0, `sum === A`. Otherwise return error `SPLIT_SUM_MISMATCH` with the difference, which the UI shows as "₹X left to assign".
- **Percent**: the user enters basis points per participant. Validation: every value ≥ 0, `sum === 10000`.
  `raw_i = A * bp_i` (an integer, safe because A ≤ 1e8 and bp ≤ 1e4). `owed_i = floor(raw_i / 10000)`.
  The remainder `R = A - Σ owed_i` goes out 1 paisa at a time to participants with the **largest `raw_i % 10000`**, with ties broken by user id ascending.
- A participant may end up with a 0 share in exact or percent splits. A participant row is still stored, so the expense lists them.
- The payer does **not** have to be a participant ("I paid for Ravi's dinner": payer A, only participant B).

The split result is stored per participant. **The original input is also kept** (`split_type` plus per-share `input_value`) so that editing the expense brings back the same form.

---

## 5. Data Model (SQLite via Drizzle)

All tables have `id INTEGER PRIMARY KEY` and `created_at INTEGER` (unix ms). Foreign keys are on (`PRAGMA foreign_keys = ON`).

```text
users
  id, name TEXT NOT NULL,
  email TEXT UNIQUE NULL (stored lowercased),
  phone TEXT UNIQUE NULL (E.164),
  password_hash TEXT NULL          -- NULL ⇒ placeholder
  upi_vpa TEXT NULL                -- e.g. "ravi@okicici"
  is_placeholder INTEGER NOT NULL DEFAULT 0,
  created_by_user_id → users NULL  -- who created the placeholder
  claimed_at INTEGER NULL
  CHECK (email IS NOT NULL OR phone IS NOT NULL OR is_placeholder = 1)

sessions
  id TEXT PRIMARY KEY (32 random bytes, base64url; only its SHA-256 is stored),
  user_id → users, expires_at INTEGER, last_seen_at INTEGER

friendships                         -- undirected; store with user_low_id < user_high_id
  user_low_id → users, user_high_id → users, UNIQUE(user_low_id, user_high_id)

groups
  id, name TEXT NOT NULL, simplify_debts INTEGER NOT NULL DEFAULT 1,
  created_by_user_id → users, archived_at INTEGER NULL

group_members
  group_id → groups, user_id → users, joined_at, left_at NULL,
  UNIQUE(group_id, user_id)

expenses
  id, group_id → groups NULL      -- NULL ⇒ non-group expense between friends
  description TEXT NOT NULL (1..100 chars),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  paid_by_user_id → users NOT NULL,
  split_type TEXT NOT NULL CHECK (split_type IN ('equal','exact','percent')),
  expense_date TEXT NOT NULL (YYYY-MM-DD),
  notes TEXT NULL,
  created_by_user_id → users, updated_by_user_id → users NULL, updated_at INTEGER NULL,
  deleted_at INTEGER NULL, deleted_by_user_id → users NULL,
  version INTEGER NOT NULL DEFAULT 1     -- optimistic concurrency

expense_shares
  expense_id → expenses ON DELETE CASCADE, user_id → users,
  owed_paise INTEGER NOT NULL CHECK (owed_paise >= 0),
  input_value INTEGER NULL         -- exact: paise; percent: basis points; equal: NULL
  UNIQUE(expense_id, user_id)

settlements                         -- "A paid B ₹X"
  id, group_id → groups NULL,
  from_user_id → users, to_user_id → users CHECK (from_user_id <> to_user_id),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  method TEXT NOT NULL CHECK (method IN ('upi','cash','other')),
  note TEXT NULL, settled_on TEXT (YYYY-MM-DD),
  created_by_user_id → users, deleted_at NULL, deleted_by_user_id NULL

activities
  id, actor_user_id → users,
  type TEXT  -- expense_created | expense_updated | expense_deleted | expense_restored
             -- settlement_created | settlement_deleted | group_created | member_added
             -- member_left | friend_added | group_settings_changed
  group_id → groups NULL, expense_id NULL, settlement_id NULL,
  payload TEXT (JSON)  -- snapshot: for updates {before, after}; for deletes {before}
  created_at

activity_recipients                 -- who sees this item in their feed
  activity_id → activities, user_id → users, read_at NULL,
  UNIQUE(activity_id, user_id)
```

### Indexes
`expenses(group_id, deleted_at)`, `expense_shares(user_id)`, `settlements(group_id)`, `settlements(from_user_id)`, `settlements(to_user_id)`, `activity_recipients(user_id, activity_id DESC)`, `group_members(user_id)`.

### Placeholder users (D2)
- Add a friend or member as **name + (email or phone)**. If a user (real or placeholder) already has that email or phone, **reuse that row**. Otherwise insert a placeholder.
- **Claiming**: when someone signs up with an email or phone that matches a placeholder, the placeholder row **becomes** their account: set `password_hash`, clear `is_placeholder`, set `claimed_at`. All existing expenses, groups and friendships come with it automatically because the id doesn't change.
- Placeholders cannot log in, and never appear in user search except to the people who created or share a group with them.
- ⚠️ **Known MVP risk**: without email verification, someone could sign up with another person's email and claim their placeholder, which would show them that person's balances. Mitigation in the MVP: claiming only exposes what the creator already entered (no sensitive data). The **post-MVP fix** is email OTP or verification before claiming. Track it in §13.

---

## 6. Balance Semantics

Sign convention: **positive = others owe you**.

For a user `u` within a scope (a group, the non-group friend scope, or everything):
```
net(u) =  Σ expense.amount_paise   where paid_by = u
        − Σ share.owed_paise       where share.user = u
        + Σ settlement.amount      where from = u
        − Σ settlement.amount      where to = u
(excluding soft-deleted rows)
```
Invariant: Σ net over all members of a scope = 0 (tested).

### Pairwise balance (A ↔ B), used on the friend screen and in non-simplified groups
With a single payer this is unambiguous:
```
owes(B→A) = Σ share(B).owed  on expenses paid by A
          − Σ share(A).owed  on expenses paid by B
          − Σ settlements B→A + Σ settlements A→B
```
- **Friend detail screen** shows the pairwise balance per group plus the non-group balance, and a total.
- **Friends list** shows each friend's total pairwise balance across all scopes.
- **Home dashboard**: "You owe ₹X · You are owed ₹Y" (the sum of negative and positive pairwise totals).

### Group balances
- `GET /groups/:id/balances` returns each member's `net` and a list of **suggested transfers**:
  - `simplify_debts = 1`: the output of the simplification algorithm (§7).
  - `simplify_debts = 0`: the raw pairwise debts within the group (netted per pair).
- A settlement recorded in a group always counts toward that group's nets, whether or not it follows a suggested transfer.

---

## 7. Simplify Debts (`shared/src/lib/money/simplify.ts`)

Per group, only when `simplify_debts = 1`.

Algorithm (greedy, deterministic):
1. Compute `net(u)` for every member. Drop zeros.
2. Split into creditors (net > 0) and debtors (net < 0).
3. Repeat: take the largest creditor C and the largest debtor D (ties broken by user id ascending). Transfer `t = min(C.net, -D.net)` and record `D → C : t`. Adjust both and drop any that reach zero.
4. The result has at most `n − 1` transfers, and each one moves an integer number of paise.

Notes:
- This is not guaranteed to be the global minimum (that problem is NP-hard), but it is what Splitwise-style apps do. Document this in the UI tooltip: "Simplified so fewer payments are needed".
- It is a pure function with property-based tests (fast-check): the sum of transfers applied to the nets gives all zeros, there are at most n−1 transfers, and every amount is > 0.
- Turning simplification on or off changes only the suggestions, never the stored data. Log it as `group_settings_changed`.

---

## 8. Settle Up with UPI

### Flow
1. The user taps **Settle up** on a friend or group. The app proposes the amount (the pairwise owed amount, or the suggested transfer) and lets the user edit it, capped at the outstanding amount for convenience but not enforced.
2. If the **payee has a `upi_vpa`**:
   - On mobile: a **"Pay ₹X via UPI"** button opens
     `upi://pay?pa=<vpa>&pn=<payee name>&am=<rupees.paise>&cu=INR&tn=<note>`
     with every param `encodeURIComponent`-ed and `tn` like `Splitwise: Goa trip` (≤ 50 chars).
   - On desktop (detected by viewport or `pointer: fine`): show a **QR code** of the same URI and a "Copy UPI ID" button.
3. After coming back from the UPI app, the user is asked **"Did the payment go through?"** with *Yes, record it* or *Not now*. **Yes** creates a settlement with `method = 'upi'`.
4. If the payee has **no VPA**, show "Record a cash/other payment" and a hint: "Ask <name> to add their UPI ID".
5. Recording a payment manually (cash or other) is always possible without UPI.

### Constraints & caveats
- The app **cannot verify** a payment. Settlements are self-reported, can be deleted by either party, and appear in the activity feed.
- VPA validation: `^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,64}$`. Users edit their own VPA in Account settings. A placeholder's VPA can be set by its creator.
- ⚠️ Some UPI apps limit or warn on P2P intent links that carry a pre-filled amount. Always show the VPA with a copy button as a fallback, and test on GPay, PhonePe, Paytm and BHIM during M6.
- `upi://` links do nothing on desktop or iOS without a UPI app installed. Handle this gracefully and fall back to the QR code.

---

## 9. Activity Feed, Edit & Delete

### Permissions (D3)
- **Group expense**: any **current** group member may edit, delete or restore it.
- **Non-group expense**: the payer or any participant.
- **Settlement**: `from`, `to`, or (for group settlements) any group member may delete it.
- **Editing**: all fields can be changed, including payer, participants, amount and split. The server recomputes shares in a transaction.

### Concurrency
Edit requests include `version`. The server runs `UPDATE … WHERE id=? AND version=?`, and if no row changes it returns **409 CONFLICT**. The client then refetches and shows "This expense was changed by X, review and try again".

### Activity generation
Every mutating service call writes, **in the same DB transaction**:
- one `activities` row with a JSON snapshot (`before`/`after` for updates)
- `activity_recipients` rows for everyone affected: all group members for group items, or the payer, participants and settlement parties for non-group items. For updates this is the **union of before and after** participants, so someone removed from an expense still sees that it changed.

### Feed UI
- A reverse-chronological list with cursor pagination (`?before=<activity_id>&limit=30`).
- Each item has a human sentence ("**Asha** updated *Dinner* in **Goa Trip**: amount ₹1,200 → ₹1,500") and the viewer's impact ("you owe ₹375" / "you get back ₹200"), shown in red or green.
- Deleted-expense items get a **Restore** button (if the viewer has permission). Restoring makes an `expense_restored` activity.
- An unread dot comes from `read_at`. Opening the feed marks all as read.

---

## 10. API (REST, JSON, `/api/v1`)

Conventions: cookie auth. Bodies are validated with shared Zod schemas. Errors use the shape `{ error: { code, message, details? } }` with codes such as `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `SPLIT_SUM_MISMATCH`. All amounts are in paise.

**Auth**
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/signup` | `{name, email, password}` → claims a matching placeholder or creates a user; sets cookie |
| POST | `/auth/login` | `{email, password}`; rate limit 5/min per IP+email |
| POST | `/auth/logout` | deletes session |
| GET | `/auth/me` | current user |

**Users / Account**
| PATCH | `/me` | `{name?, upi_vpa?, phone?}` |
| POST | `/me/password` | `{current, next}` |

**Friends**
| GET | `/friends` | list with total pairwise balance |
| POST | `/friends` | `{name, email?, phone?}` → existing user or new placeholder; creates friendship |
| GET | `/friends/:userId` | pairwise breakdown per group + non-group, plus shared expenses (paginated) |
| DELETE | `/friends/:userId` | only if the balance is 0 |

**Groups**
| GET | `/groups` | my groups with my net in each |
| POST | `/groups` | `{name, memberIds?: number[], newMembers?: {name,email?,phone?}[]}` |
| GET | `/groups/:id` | group detail + members |
| PATCH | `/groups/:id` | `{name?, simplify_debts?}` |
| POST | `/groups/:id/members` | add an existing friend or a new placeholder |
| DELETE | `/groups/:id/members/me` | leave; blocked if my group net ≠ 0 |
| GET | `/groups/:id/balances` | nets + suggested transfers |
| GET | `/groups/:id/expenses` | paginated, includes settlements interleaved by date |

**Expenses**
| POST | `/expenses` | `{group_id?, description, amount_paise, paid_by_user_id, split_type, participants:[{user_id, value?}], expense_date, notes?}` |
| GET | `/expenses/:id` | with shares and split input |
| PUT | `/expenses/:id` | full replace + `version` |
| DELETE | `/expenses/:id` | soft delete |
| POST | `/expenses/:id/restore` | |

**Settlements**
| POST | `/settlements` | `{group_id?, from_user_id, to_user_id, amount_paise, method, note?, settled_on}`. The current user must be `from` or `to` (or a group member for group settlements) |
| DELETE | `/settlements/:id` | soft delete |
| GET | `/settlements/upi-link?to=<userId>&amount_paise=&group_id=` | returns `{ uri, vpa, payee_name }` or 422 `NO_VPA` |

**Balances & Activity**
| GET | `/balances/summary` | `{ owe_paise, owed_paise, net_paise }` for the dashboard |
| GET | `/activity?before=&limit=` | feed for the current user |
| POST | `/activity/read` | mark all read |

Authorization rule (enforced in services, not routes): a user can read or modify a group's data only if they are a member, and a non-group expense only if they are its payer or a participant.

---

## 11. Frontend / UX (Mobile-first)

### Navigation
- A **bottom tab bar** (fixed, with safe-area padding): **Friends · Groups · Activity · Account**.
- A **floating "+ Add expense" button** on the Friends, Groups and group-detail screens, sitting above the tab bar.
- On ≥ 768px: the tab bar becomes a left sidebar and the content is capped at `max-w-2xl`.

### Screens
1. **Login / Signup**: one column, `autocomplete` attributes, show/hide password.
2. **Friends**: balance summary header (owe/owed), a list of friends with colored balance chips, and "Add friend" in a bottom sheet.
3. **Friend detail**: total balance, per-group breakdown, **Settle up** button, shared expenses list.
4. **Groups**: list showing my net per group. **Create group** as a full-screen sheet (name + pick friends + add new people inline).
5. **Group detail**: tabs for *Expenses* and *Balances*. The balances tab shows member nets and suggested transfers, each with a "Settle" button. The settings gear has rename, the simplify toggle, members and leave.
6. **Add/Edit expense** (a full-screen sheet):
   - Description, then a big amount field (`inputmode="decimal"`), then "Paid by [you ▾]" and "Split [equally ▾]".
   - The participants list has checkboxes for equal splits, and a per-row input for exact (₹) or percent (%) splits, with a live "₹X left" or "Y% left" footer. **Save is disabled until it balances.**
   - Date (defaults to today), optional notes.
   - Choose a group or friends at the top (pre-filled from context).
7. **Settle up** (bottom sheet): payer → payee, amount, a UPI button / QR, and a "Record cash payment" link.
8. **Expense detail**: who paid, each person's share, an edit/delete menu, and this expense's history (from activities).
9. **Activity**: the feed described in §9.
10. **Account**: name, email, phone, **UPI ID**, change password, logout.

### Mobile requirements
- Tap targets ≥ 44×44px. Body text ≥ 16px, so iOS doesn't zoom into inputs.
- `viewport-fit=cover` + `env(safe-area-inset-*)`.
- Bottom sheets for short forms, and full-screen sheets for add/edit expense.
- Optimistic UI only for marking activity as read. Money mutations wait for the server response and show a spinner on the button.
- Skeleton loaders. Empty states with a clear call to action ("No expenses yet, add one").
- Lighthouse mobile: Performance ≥ 85, Accessibility ≥ 95.
- Colors: green = owed to you, orange/red = you owe, gray = settled. Don't rely on color alone; always include the text ("you owe" / "owes you").

---

## 12. Security & Non-Functional

- Passwords: argon2id (or bcrypt cost 12). Minimum 8 characters.
- Session cookie: `httpOnly`, `Secure` (prod), `SameSite=Lax`, 30-day sliding expiry. The session id is stored hashed.
- CSRF: SameSite=Lax plus a required `X-Requested-With: fetch` header on mutating requests (checked by middleware).
- Rate limits: auth endpoints 5/min, general API 120/min per session.
- `helmet` with a CSP that allows `self`. The QR code is generated client side (no external calls).
- Input: everything is validated with Zod. Text fields are trimmed and length-capped. React escapes output, so there is no `dangerouslySetInnerHTML`.
- Every multi-row write is wrapped in a better-sqlite3 transaction.
- SQLite: `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`. Back up the DB file daily (cron + `sqlite3 .backup`) in deploy.
- Logging: `pino` with a request id. Never log passwords or session ids.
- Scale target: about 1k users, ≤ 50 members per group, ≤ 5k expenses per group. Computing balances on read is fine at this size. Revisit with cached nets if p95 goes above 200ms.

---

## 13. Out of Scope / Future
Email/OTP verification (**required before a public launch**, see §5), invites by link, push/email notifications, multi-currency, multiple payers, shares and adjustment splits, receipts, recurring expenses, CSV export, charts, PWA offline mode, dark mode.

---

## 14. Testing Strategy

| Level | What | Tool |
|---|---|---|
| Unit | `money.ts` (parse/format edge cases: `"0.1"`, `"1,234.5"`, `"1e3"`, `"-5"`), `split.ts` (sum invariant, determinism, remainder rules), `simplify.ts` (property-based) | Vitest + fast-check |
| Service | balance computation against hand-computed fixtures, Σ net = 0, permissions, placeholder claim, version conflict, soft delete/restore effect on balances | Vitest + in-memory SQLite |
| API | auth flow, each endpoint's happy path + 401/403/404/409/422 | Supertest |
| E2E | at a 390×844 viewport: sign up → add friend → create group → add 3 kinds of expense → check balances → settle → edit → delete → restore → check the feed | Playwright |

CI (GitHub Actions): lint → typecheck → unit/service/API → build → E2E.

---

## 15. Milestone Build Plan

Each milestone ends with something that runs and has passing tests. "DoD" means Definition of Done.

### M0: Scaffold (½ day)
- npm workspaces, TS configs, ESLint/Prettier, Vite + Tailwind client, Express server, `shared` package wired into both.
- Drizzle setup, first empty migration, `npm run dev` runs client and server concurrently with the Vite proxy to `/api`.
- **DoD**: `GET /api/v1/health` shows in the client, and CI runs lint and typecheck.

### M1: Money core + Auth (1–1.5 days)
- `shared/src/lib/money/money.ts` and `shared/src/lib/money/split.ts` with full unit tests (built first, because everything later depends on them).
- `users` and `sessions` tables. Signup, login, logout and me. Auth middleware. Rate limits.
- Client: login/signup screens, protected routes, the app shell with the bottom tab bar, the Account screen (name and UPI ID).
- **DoD**: a user can sign up, log in, refresh and stay logged in, log out, and save a UPI ID. Money/split tests are green.

### M2: Friends, Groups & Placeholders (1.5 days)
- `friendships`, `groups` and `group_members` tables. Placeholder creation and dedup by email/phone. Claiming on signup.
- Friends list and add friend; groups list, create group (with new people inline), group detail shell, add member, rename.
- `group_created`, `member_added` and `friend_added` activities (the table is created here, the feed UI comes in M5).
- **DoD**: A creates a group with B (registered) and C (placeholder by email). C signs up with that email and immediately sees the group.

### M3: Expenses (2 days)
- `expenses` and `expense_shares` tables. Create and get endpoints using `split.ts` on the server, with re-validation (never trust shares computed by the client).
- Add-expense full-screen sheet supporting equal, exact and percent splits, with live remaining-amount feedback. Expense lists in groups and friend detail. Expense detail screen.
- Non-group (friend-to-friend) expenses.
- **DoD**: all 3 split types create correct shares (including remainder cases). Exact/percent mismatches are rejected on both client and server.

### M4: Balances (1 day)
- Balance service: nets, pairwise, dashboard summary. Group balances endpoint (no simplification yet, raw pairwise).
- UI: friends list chips, friend detail breakdown, group balances tab, home summary header.
- **DoD**: fixture tests match hand calculations, Σ net = 0 holds, and the UI numbers match the API.

### M5: Edit/Delete + Activity Feed (1.5 days)
- PUT with `version` (409 on conflict), soft delete, restore. Permission checks (D3).
- Writes to `activities` and `activity_recipients` inside the same transactions for every mutation from M2 onward.
- Activity tab with pagination, human-readable sentences, "your impact", unread dot, and Restore.
- **DoD**: editing an amount updates balances everywhere and shows a before→after item to every affected user, including removed participants. Deleting and then restoring returns balances to where they were.

### M6: Settle Up + UPI (1 day)
- `settlements` table and endpoints. Settlements are included in balances. UPI URI builder (from integer paise). `upi-link` endpoint.
- Settle-up sheet: proposed amount, UPI button on mobile, QR + copy VPA on desktop, a "Did it go through?" confirmation, and cash recording.
- Settlements appear in expense lists and the activity feed and can be deleted.
- **DoD**: on a real Android phone the link opens a UPI app with the payee and amount pre-filled (GPay/PhonePe/Paytm/BHIM results recorded in the PR). Recording the payment brings the pair balance to 0.

### M7: Simplify Debts (½ day)
- `shared/src/lib/money/simplify.ts` with property-based tests. Group setting toggle (on by default) and its activity.
- The group balances tab shows simplified transfers, each with a Settle button that pre-fills the settle-up sheet.
- **DoD**: in a 4-person group with a circular debt (A→B→C→D→A), simplified mode gives ≤ 3 transfers and settling them all brings every net to 0.

### M8: Polish, Hardening & Deploy (1–1.5 days)
- Empty states, skeletons, error toasts, 404 page, accessibility pass, Lighthouse targets.
- Playwright E2E happy path at a mobile viewport in CI.
- Production build: Express serves `client/dist`. Dockerfile. Persistent volume for the SQLite file. Daily backup script. Env config (`SESSION_SECRET`, `DATABASE_PATH`, `NODE_ENV`).
- Stretch: PWA manifest + icons (installable, no offline mode).
- **DoD**: deployed to a single VPS or Fly.io/Railway with a volume, the E2E suite is green, and a backup/restore has been tried once.

**Estimated total: about 10–11 focused dev days.**

---

## 16. Open Questions (non-blocking)
1. Hosting target: a VPS (Docker + Caddy) or Fly.io/Railway with a volume? This only affects M8.
2. Should leaving a group with a non-zero balance be **blocked** (current spec) or allowed with a warning?
3. Should the activity feed show the before/after diff inline or only in expense detail? The spec says inline for amount/description, detail for everything else.
4. Is a "remind" button (copy a pre-written WhatsApp message with the amount and UPI link) worth adding in M6? It's cheap and helpful in India.
