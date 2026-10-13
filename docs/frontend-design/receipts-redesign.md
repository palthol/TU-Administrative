# Receipts / finance app — operator redesign brief

Status: **design only** (Option A). Implementation follows after this doc is accepted.
Companion contract (current built UI): [`receipts-app.md`](./receipts-app.md).
Philosophy source: [`dashboard-redesign.md`](./dashboard-redesign.md) and `apps/dashboard`.

## Product intent

`apps/receipts` is the operator **finance write tool**: log cash, draft invoices, update
invoice status, record formal payments, share SMS copy, and (carefully) void/refund
receipts. It stays a separate app from the read-only dashboard — same operator language,
different job (mutations allowed).

Today it reads as a developer harness: eight equal-weight tabs in one monolith
(`App.tsx`), default shadcn skin, UUID paste fields, success copy that surfaces raw IDs.
The redesign turns it into an **operator finance workspace** without changing the API
contract.

## UI kit decision — ObsidianUI ([obsidianui.dev](https://www.obsidianui.dev/))

### Verdict

**Do not adopt ObsidianUI as the receipts visual system.** Optionally cherry-pick a
small number of shadcn-registry primitives later; do **not** install marketing blocks or
the Analytics Dashboard demo as the app shell.

### Why

| Obsidian piece | Fit for receipts |
| --- | --- |
| **Dashboard Shell** | Closest useful piece (sidebar, mobile drawer, header, sliding tabs, toolbar). Still a third visual language that would diverge from the Temple dashboard operator shell we already shipped. Prefer porting dashboard IA/tokens over importing this block wholesale. |
| **Analytics Dashboard** | Wrong metaphor (engineering metrics, PR queue, demo data). Do not use. |
| **Motion / showcase blocks** (Flip Text, Marquee, Gallery, Hover Image, Text reel, WebGL, etc.) | Poor fit for a desk/phone cash tool. Adds Motion/GSAP/canvas weight and decorative noise; conflicts with “act with care” and our anti–AI-slop layout rules. |
| **Primitives** (button, input, card, dialog, table, sheet, tabs, form) | Fine as a *shadcn-compatible registry source* if we need a missing primitive. Receipts already has a minimal shadcn set; prefer extending that (or sharing with dashboard) over a second kit. |

### Constraints if anything is pulled from Obsidian later

- Install via registry copy (`npx shadcn@latest add "https://www.obsidianui.dev/r/<name>.json"`), not as a runtime dependency on their site.
- Receipts is **Vite + React**, not Next.js — strip Next-only `Link` / `app/` assumptions.
- Restyle to Temple operator tokens (deep red primary, warm `#f7f7f5` shell, dark rail) so
  it matches `apps/dashboard`, not Obsidian demos.
- No auto-including Motion/GSAP/WebGL unless a specific interaction needs it.
- MIT license: keep notices if required; replace demo media/data.

### Canonical UI direction for this redesign

Reuse the **dashboard operator philosophy** already in-repo:

1. Job-shaped destinations (not eight equal tabs).
2. Desktop rail + mobile bottom nav (+ More overflow).
3. One heading + one supporting sentence per surface.
4. Panels for work; no decorative card spam / KPI theater.
5. 44px targets; tables → labeled cards below ~1024px; 320px + 200% zoom.
6. Memory-only admin key; unlock via `/api/admin/auth/me` (align with dashboard).
7. Stale/unavailable labeling; never paint unknown money as `$0`.
8. Dangerous writes gated with plain-language scope notes (void/refund/formal).

## Target information architecture

Hash destinations only (context in memory). Visited panels stay mounted.

| Destination | Job | Primary actions | Notes |
| --- | --- | --- | --- |
| `#cash` | Log money that just came in | Save cash log; share/copy SMS | Default landing. Embeds participant lookup + external counterparty. |
| `#invoice` | Create a draft invoice | Save draft; share/copy | Same lookup pattern as cash. |
| `#recent` | Work the personal ledger | Refresh; mark sent/paid/void | Desktop table / phone cards. |
| `#formal` | Record a formal payment against a charge | Board pick → record payment; optional discount | Advanced; UUID entry is a fallback, not the happy path. |
| `#more` | Specialist / rare | Share preview samples; void receipt; refund receipt | Dangerous actions live here with confirmation + scope notes. |

Mobile bottom nav: **Cash · Invoice · Recent · Formal**; header **More**.
Desktop: sticky left rail with the same five destinations + unlock/lock.

### Flows that replace “copy UUID between tabs”

1. **Board → Formal:** From Formal (or a Formal sub-toolbar), load payment-board; choosing
   a row sets `account_id` + `charge_id` in memory (no clipboard round-trip).
2. **Lookup → Cash/Invoice:** Participant “Use” remains; preferred account id stays
   in-memory for the entry.
3. **Recent → Share:** After status changes, offer share/copy using existing
   `shareFormats` builders when enough fields are present.

## Visual system

Align with dashboard operator tokens rather than inventing a third brand:

- Shell: warm flat body `#f7f7f5`, dark rail `#171c24`, white work panels.
- Primary: deep red (~`0 70% 34%`) already used by dashboard.
- Typography: tight display headings, readable body, **tabular nums for money**.
- Success/error: operator language (“Cash logged — share when ready”), not
  `id=…` / `payment_id=…` as the primary message. Technical ids available behind a
  “Details” disclosure for support.
- Forms: one primary CTA per panel; secondary actions visually quieter.
- Void/refund: distinct destructive styling + typed or checkbox confirmation.

Do **not** require Obsidian, Inter-on-white marketing layouts, purple gradients, or
cream/serif tropes.

## Auth and session

- Unlock gate: API base + staff key → `GET /api/admin/auth/me`; require a supported
  staff role (same set as dashboard: `owner` | `finance` | `front_desk` unless product
  narrows finance further later).
- Key and unsent form state: **memory only**; Lock/reload clears key and aborts in-flight
  requests.
- `401` → lock and clear workspace; `403` → role message.
- Keep `adminFetch` in `apps/receipts/src/lib/admin-api.ts`; add abort/timeout parity with
  dashboard reads where practical. Mutations stay explicit user actions (no auto-retry).

## Screen / action → HTTP map (target UI)

Endpoints and bodies remain those in [`receipts-app.md`](./receipts-app.md) /
[`api-reference.md`](./api-reference.md). This table is the **destination remap**, not a
new API.

| Destination / action | Method · Endpoint | Notes |
| --- | --- | --- |
| Unlock | `GET /api/admin/auth/me` | New vs current receipts shell (dashboard parity). |
| Participant search | `GET /api/admin/participants/search?q=&limit=8` | Cash + Invoice. |
| External counterparty | `POST /api/admin/billing/external-counterparty-accounts` | Cash + Invoice fallback. |
| Save cash log | `POST /api/admin/billing/personal-finance-entries` | `entry_kind:"cash_received"`. Migration `0017`. |
| Save invoice draft | same POST | `entry_kind:"invoice"`, `invoice_status:"draft"`. |
| Recent load | `GET /api/admin/billing/personal-finance-entries?limit=80` | |
| Invoice status | `POST …/personal-finance-entries/:id/invoice-status` | sent / paid / void. |
| Board for Formal | `GET /api/admin/reporting/views/payment-board?…` | Select row → in-memory ids. |
| Record formal payment | `POST /api/admin/billing/record-payment` | Single-charge allocation remains v1. |
| Discount list / apply | `GET/POST /api/admin/billing/charge-discounts` | Migration `0019`. |
| Void receipt | `POST /api/admin/billing/receipts/:receiptId/void` | More → confirm. |
| Issue refund receipt | `POST /api/admin/billing/receipts/issue-for-refund` | More; still needs existing `payment_refund_id`. |
| Share / copy | — | Existing `shareFormats` helpers. |

### Explicitly out of scope for this redesign

- Creating `payment-refunds` (API exists; not in current UI) — candidate follow-up.
- Charge adjustments / write-offs, subscription upgrade, per-class charges, Discord.
- Embedding dashboard reporting or waiver PDF flows.
- Changing request/response shapes to “improve” the API.

### Mutation safety rules

- Every write shows a plain confirmation of **who / how much / method** before submit
  when amount ≥ a soft threshold or when action is void/refund (product can set
  threshold; default: always confirm void/refund; confirm formal always).
- Failed writes keep form state; show machine `error` key in operator language when mapped,
  raw key in Details.
- Do not disable the whole app on a single list refresh failure; mark that panel stale.
- Formal/discount panels show migration scope notes when the API returns unknown/relation
  errors consistent with unapplied `0017`/`0019`.

## Implementation sketch (post-doc)

Not part of Option A delivery; recorded so build work stays mechanical:

1. Split `App.tsx` into shell + destination modules under `components/finance/` (or similar).
2. Port operator shell patterns from dashboard (rail / bottom nav / page heading / panels)
   — copy/adapt CSS tokens; do not couple apps via a shared package unless a later option C.
3. Wire hash routing + unlock gate.
4. Replace Lookup clipboard handoff with in-memory Formal selection.
5. Keep unit tests for `shareFormats`; add shell/nav smoke tests analogous to dashboard’s
   lighter Node tests before any browser fixture suite.
6. Leave Obsidian out of the critical path unless a specific primitive gap appears.

## Acceptance criteria for a future implementation PR

- Five destinations reachable on desktop and phone; Cash is default.
- No persistent admin key storage.
- All endpoints currently used by receipts still reachable with the same bodies.
- Operator-facing success copy does not lead with raw UUIDs.
- Void/refund require confirmation and live under More.
- Visual language recognizably matches the dashboard operator workspace.
- `npm run test:receipts` and `npm run build:receipts` pass; no API/schema changes in the
  signup repo required for the UI-only pass.
