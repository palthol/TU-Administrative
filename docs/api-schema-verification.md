# API ↔ Supabase schema verification

**Date:** 2026-05-29
**Live project ref:** `jhxzecxkccqlgyazhsnb` (Temple Underground)
**API audited:** `temple underground signup/services/api` (the deployed JS API — the
designated API repository going forward).
**Method:** read-only inspection of the live `public` schema via the Supabase MCP
(`list_tables`, `pg_get_viewdef`, `pg_get_function_result`) cross-referenced against
every route, service, and lib file in the API.

> The TS scaffold that used to live in `admin/services/api` is **not** the deployed
> API and is being removed. This document audits the real, deployed JS API only.

---

## TL;DR

The reporting, payments, receipts, refunds, subscription, per-class, participant, and
waiver surfaces are **consistent with the live schema** — all views, columns, and RPC
signatures line up. There are **two runtime-breaking drifts** and **two correctness
gaps**, all in `routes/admin/billing.js`, caused by two tables that exist only as
**unapplied migrations** (and which carry an unresolved design decision).

| Sev | Area | Issue |
| --- | --- | --- |
| **P0** | `personal_finance_entries` | Table does **not exist** live; 3 routes 500 at runtime |
| **P0** | `charge_discounts` | Table does **not exist** live; 2 routes 500 at runtime |
| **P1** | `charge_discounts` POST | `applied_amount_cents` hardcoded to `1` (never computed) |
| **P1** | discount semantics | `view_charge_net` ignores discounts; they have no financial effect |
| P2 | `participants/search` | Does not exclude `merged_into_participant_id` rows |

---

## Live schema snapshot

33 base tables, 19 views, 18 functions, 0 enums (text + CHECK constraints throughout).

**Billing/identity core (consistent with API):** `participants`, `accounts`,
`account_members`, `charges`, `payments`, `payment_allocations`, `payment_refunds`,
`receipts`, `charge_adjustments`, `operating_expenses`, `marketing_leads`.

**Membership/ops model (used by reporting views):** `plan_definitions`,
`plan_entitlements`, `subscriptions`, `entitlement_credits`, `schedule_templates`,
`sessions`, `attendance_records`, `private_usage`, `class_charge_links`,
`access_overrides`, `participant_relationships`, `affiliate_*`, `event_ledger`.

**Missing tables referenced by the API:** `personal_finance_entries`, `charge_discounts`.

### RPCs — all signatures/returns match API usage ✓

| RPC | Result | API caller |
| --- | --- | --- |
| `record_payment_refund(p_payment_id, p_amount_cents, p_reason, p_created_by, p_idempotency_key)` | `uuid` | `POST /billing/payment-refunds` ✓ |
| `upgrade_subscription_prorated(p_subscription_id, p_new_plan_definition_id, p_effective_date)` | `uuid` | `POST /billing/subscription-upgrade` ✓ |
| `create_pay_per_class_charge(p_attendance_id, p_due_at, p_notes, p_created_by)` | `uuid` | `POST /billing/per-class/charge-from-attendance` ✓ |
| `upgrade_per_class_to_monthly(...)` | `TABLE(old_subscription_id, new_subscription_id, initial_charge_id)` | `POST /billing/per-class/upgrade-to-monthly` ✓ destructures all three |
| `merge_participants(p_canonical_participant_id, p_duplicate_participant_id)` | `void` | `POST /participants/merge` ✓ |

### Reporting views — all sortable/whitelist columns exist ✓

`reportingViews.js` whitelists 19 view slugs; every slug maps to a live view and every
`sortableColumns` / `dateColumn` / filter column exists in that view (spot-verified
`view_member_payment_board`, `view_member_payment_reminders`, `view_charge_net`,
`view_analytics_primary_kpis_monthly`, `participant_entitlement_status`). The
`finance/monthly-summary` route reads `view_analytics_revenue_waterfall_monthly`
(`net_cash_collected_cents`) + `operating_expenses` — both present. ✓

---

## Detailed findings

### P0-1 — `personal_finance_entries` is missing (3 broken routes)

`routes/admin/billing.js` reads/writes `public.personal_finance_entries` in:

- `POST   /api/admin/billing/personal-finance-entries`
- `GET    /api/admin/billing/personal-finance-entries`
- `POST   /api/admin/billing/personal-finance-entries/:entryId/invoice-status`

The table does not exist in the live DB, so PostgREST returns
`relation "public.personal_finance_entries" does not exist` and every call 500s. This
table backs the receipts app's **Cash log / Invoice / Recent** tabs, so that entire
operator-ledger feature is non-functional end-to-end.

The intended schema exists only as an **unapplied** migration (currently in the
soon-to-be-deleted scaffold): `20260529000001_personal_finance_entries.sql`. It is
self-contained (no dependency on the discount work) and safe to apply as-is.

### P0-2 — `charge_discounts` is missing (2 broken routes)

`routes/admin/billing.js` reads/writes `public.charge_discounts` in:

- `GET  /api/admin/billing/charge-discounts?charge_id=...`
- `POST /api/admin/billing/charge-discounts`

Table does not exist → both 500. Intended schema is the second unapplied migration:
`20260529000002_charge_discounts.sql`.

### P1-1 — `applied_amount_cents` hardcoded to `1`

Even once the table exists, the POST handler inserts a **placeholder**:

```12:13:temple underground signup/services/api/src/routes/admin/billing.js
        flat_amount_cents: discount_type === 'flat' ? flat_amount_cents : null,
        percent_basis_points: discount_type === 'percent' ? percent_basis_points : null,
```
```16:16:temple underground signup/services/api/src/routes/admin/billing.js
        applied_amount_cents: 1,
```

It never computes the resolved value. Per the contract it should be:
- `flat`: `applied_amount_cents = flat_amount_cents`
- `percent`: `applied_amount_cents = round(gross_cents * percent_basis_points / 10000)`
  (read `gross_cents` from `view_charge_net` for the charge).

### P1-2 — discounts have no financial effect (semantic gap)

Live `view_charge_net` is:

```sql
net_due_cents = gross_cents
              - COALESCE(affiliate_credit_applications.sum, 0)   -- credit_applied_cents
              - COALESCE(charge_adjustments where write_off, 0)  -- write_off_cents
```

It has **no discount term**. So even with the table created and
`applied_amount_cents` computed correctly, a `charge_discount` row will **not** reduce
`net_due_cents`, will **not** help mark a charge `paid`, and the value the POST returns
(`net_due_cents` read back from the view) will not reflect the discount just created.

This exposes an **overlapping-concept design decision**:

- **`charge_adjustments`** (live, in the view): `write_off` only, reduces collectible.
- **`charge_discounts`** (missing, not in the view): `flat` | `percent`, auditable line
  items, currently display-only.

Pick one before "fixing" the routes — see options below.

### P2 — `participants/search` includes merged duplicates

The search query selects from `participants` without filtering
`merged_into_participant_id is null`, so merged duplicate rows can appear in results.
Low risk today (the column is rarely set), but it can resurface a record an operator
just merged away. One-line `.is('merged_into_participant_id', null)` filter.

---

## Remediation options (decision required)

**A. Ship the personal ledger now (low risk).** Apply
`20260529000001_personal_finance_entries.sql` to the live project, regenerate types.
Fixes P0-1 with no semantic ambiguity. Recommended regardless of the discount decision.

**B. Resolve discounts vs. adjustments (P0-2 / P1-1 / P1-2 together).** Choose:
  - **B1 — Unify on `charge_adjustments`.** Treat discounts as adjustments; drop the
    `charge_discounts` table/routes or repoint them at `charge_adjustments`. Already
    reflected in `view_charge_net`. Least new surface area.
  - **B2 — Keep `charge_discounts` as a first-class concept.** Apply migration `0002`,
    compute `applied_amount_cents` in the route, **and** extend `view_charge_net` to
    subtract a `discount_applied_cents` term so discounts actually reduce net due.
    More work; richer reporting (separates promotional discounts from write-offs).

**C. Relocate the migrations.** Both migration files currently live only in the scaffold
being deleted, and the signup/API repo has **no** `supabase/migrations/` directory. The
migrations must be moved into the API repository before the scaffold is removed, or they
are lost. (Handled as part of the repo restructure.)

> No migrations were applied and no data was modified during this audit (read-only).
