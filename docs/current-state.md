# Admin current state

**Verified:** 2026-09-03  
**Repository:** `palthol/TU-Administrative`

This is the admin repository's status source of truth. The API repository independently
owns backend/schema status and contracts.

## Applications

| Application | Status | Connected behavior | Qualification |
| --- | --- | --- | --- |
| Dashboard | implemented | Reporting, participants, billing actions, waivers, expenses, leads, notifications, scheduling | Requires operator-entered shared admin key |
| Receipts | implemented | Personal finance, formal payment, discounts, receipt void/refund, sharing | Production finance tables contain no rows |
| Waiver viewer | implemented | Cloudflare-protected waiver-document list/details | Deployment and Access policy not verified |

All three production builds pass. Receipts has 7 passing share-format tests. Dashboard and
waiver viewer have no automated tests.

## Active versus unreachable dashboard code

`apps/dashboard/src/main.tsx` mounts `App.tsx`, an API-console dashboard. A separate
React Router/Supabase Auth implementation under `pages/`, `contexts/AuthContext.tsx`, and
`lib/supabase.ts` is not mounted. It is dead code today.

That unreachable implementation also conflicts with the current API-first direction by
reading tables and invoking `generate_monthly_charges()` directly. Production currently
has zero Supabase Auth users and zero `app_admin` rows.

## Connected but operationally unproven

- Subscription creation/upgrades and per-class billing.
- Session creation/edit/cancellation and attendance.
- Formal payments, refunds, discounts, and receipts.
- Personal finance entries and operating expenses.
- Marketing lead review and operational analytics.

The UI/API wiring exists, but relevant production tables contain no rows. Do not describe
these as production-verified until safe end-to-end validation is recorded.

## Unwired or missing

- Waiver viewer displays document/signature storage paths as text rather than signed
  downloads.
- No consolidated Today/front-desk workflow.
- No schedule-template UI or recurring-session generation.
- No provider-based email/SMS; share actions use device share sheet or clipboard.
- No member portal or payment links.
- No individual staff RBAC in the active application.
- No committed deployment configuration or verified production hostnames.

## Known risks

- Shared admin key is manually entered into trusted browser sessions.
- Duplicate dashboard architecture increases drift and can mislead documentation.
- Dashboard/viewer lack automated tests; receipts tests do not cover API workflows.
- Dependency audit reported 11 findings on 2026-09-03: 2 low, 1 moderate, 7 high, and 1
  critical. Triage before upgrading.

## Verification baseline

- `npm run build`: dashboard, receipts, and waiver viewer pass.
- `npm test`: receipts tests pass 7/7.
- No production writes or deployed-browser smoke tests were performed.
