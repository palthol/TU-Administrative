# Admin API reference (as consumed by the front-ends)

This is the contract the admin front-ends call. It documents the **real, deployed** API in
the `temple underground signup` repo (`services/api`). The canonical, fuller server-side
reference lives there at `docs/admin-api.md`; this file is the front-end-facing subset plus
the exact shapes the UIs depend on.

- **Base URL:** `http://localhost:3001` locally; the deployed host in production.
- **Admin auth:** header `x-admin-key: <ADMIN_API_KEY>` on every `/api/admin/*` call.
- **Viewer auth:** Cloudflare Access (no admin key) on `/api/viewer/*`.
- **Envelope:** `200 { ok:true, ... }` on success; non-2xx `{ ok:false, error }` on failure.
- **Money:** integer cents.

> Status codes are `200` for success (including creates), **not** `201`. Clients key off
> `res.ok`.

---

## Billing — personal finance entries  ⚠️ requires migration `0017`

### `POST /api/admin/billing/personal-finance-entries`
Operator cash log / lightweight invoice. No account/charge UUIDs required.

Cash:
```json
{ "entry_kind":"cash_received", "member_display_name":"Alex", "amount_cents":15000,
  "method":"cash", "issued_by":"Jordan", "notes":"optional", "account_id":"uuid?" }
```
Invoice:
```json
{ "entry_kind":"invoice", "member_display_name":"Alex", "amount_cents":8900,
  "issued_by":"Jordan", "due_at":"2026-04-30", "invoice_status":"draft",
  "notes":"optional", "account_id":"uuid?" }
```
Success: `{ "ok":true, "id":"<uuid>" }`
Rules: `entry_kind ∈ {cash_received, invoice}`; `member_display_name`, `issued_by` required;
`amount_cents > 0`; cash requires a valid `method`; invoice defaults `due_at` to tomorrow
(UTC) and `invoice_status` to `draft` (`draft|sent|paid|void`).
Errors: `invalid_entry_kind`, `member_display_name_required`, `invalid_amount_cents`,
`issued_by_required`, `invalid_payment_method`, `invalid_invoice_status`.

### `GET /api/admin/billing/personal-finance-entries?limit=80&entry_kind=`
Success: `{ "ok":true, "rows": PersonalEntry[] }` (newest first; `limit` default 100, max 500;
optional `entry_kind` filter).
```ts
PersonalEntry = { id; entry_kind; member_display_name; amount_cents; method?; issued_by;
  notes?; due_at?; invoice_status?; account_id?; charge_id?; created_at? }
```

### `POST /api/admin/billing/personal-finance-entries/:id/invoice-status`
Body `{ "status":"sent"|"paid"|"void"|"draft" }` → `{ "ok":true, "id", "invoice_status" }`.
Only `entry_kind='invoice'` rows. Errors: `entry_not_found` (404),
`only_invoice_entries_support_status`, `invalid_status`.

---

## Billing — external counterparty

### `POST /api/admin/billing/external-counterparty-accounts`
Body `{ "display_name", "phone?", "email?", "notes?", "created_by?" }`
→ `{ "ok":true, "account_id":"<uuid>", "account": {...} }`.
Inserts an `accounts` row (no participant link); `display_name` → `primary_contact_name`.
Error: `display_name_required`.

---

## Billing — formal payment

### `POST /api/admin/billing/record-payment`
```json
{ "account_id":"uuid", "amount_cents":8900, "method":"cash", "issued_by":"Jordan",
  "allocations":[{ "charge_id":"uuid", "amount_cents":8900 }],
  "paid_at":"ISO?", "reference":"optional", "notes":"optional", "issue_receipt":true }
```
Success: `{ "ok":true, "payment_id":"<uuid>", "receipt_id":"<uuid>|null" }`.
Server validates: allocations sum to `amount_cents`; each charge belongs to `account_id`,
is not `void`, and the allocation ≤ remaining net due (`view_charge_net`). Marks a charge
`paid` once allocations cover net due. `method ∈ {cash,card,cashapp,venmo,paypal,zelle,other}`.
Errors: `account_and_positive_amount_required`, `invalid_payment_method`, `issued_by_required`,
`allocations_required`, `invalid_allocation_row`, `allocation_sum_must_equal_payment_amount`,
`charge_not_found`, `charge_account_mismatch`, `charge_is_void`, `allocation_exceeds_net_due`.

---

## Billing — charge discounts  ⚠️ requires migration `0019`

### `GET /api/admin/billing/charge-discounts?charge_id=<uuid>&limit=20`
Success: `{ "ok":true, "rows": ChargeDiscountRow[] }`. Error: `charge_id_required`.
```ts
ChargeDiscountRow = { id; charge_id; discount_type:'flat'|'percent';
  flat_amount_cents?; percent_basis_points?; applied_amount_cents; label; reason?;
  created_by?; created_at? }
```

### `POST /api/admin/billing/charge-discounts`
Flat: `{ charge_id, discount_type:'flat', flat_amount_cents, label, reason?, created_by? }`
Percent: `{ charge_id, discount_type:'percent', percent_basis_points, label, reason?, created_by? }`
Success: `{ "ok":true, "discount_id", "applied_amount_cents", "net_due_cents": number|null }`.
**`applied_amount_cents` is computed by a DB trigger** (flat = `min(gross, flat)`, percent =
`floor(gross*bps/10000)`); the client sends a placeholder and reads the computed value back.
`net_due_cents` comes from `view_charge_net`. `label` required; `percent_basis_points` in
`1..10000`. Errors: `charge_id_required`, `invalid_discount_type`, `label_required`,
`invalid_flat_amount_cents`, `invalid_percent_basis_points`.

---

## Billing — receipts void / refund

### `POST /api/admin/billing/receipts/:receiptId/void`
Body `{ "void_reason" }` → `{ "ok":true, "receipt_id" }`. Soft-void (`voided_at`,
`void_reason`). Errors: `receipt_id_and_void_reason_required`, `receipt_not_found` (404),
`receipt_already_voided`.

### `POST /api/admin/billing/receipts/issue-for-refund`
Body `{ "payment_refund_id", "issued_by", "notes?" }`
→ `{ "ok":true, "receipt_id", "voided_money_in_receipt_id": uuid|null }`.
Requires an existing `payment_refunds` row; voids the active `money_in` receipt and inserts
`money_out_refund`. Errors: `payment_refund_id_and_issued_by_required`,
`payment_refund_not_found` (404), `refund_receipt_already_exists`.

---

## Participants

### `GET /api/admin/participants/search?q=<text>&limit=8`
`q` length ≥ 2; `limit` 1..25 (default 8).
Success: `{ "ok":true, "rows": ParticipantSearchRow[] }`. Error: `query_min_length_2`.
```ts
ParticipantSearchRow = { participant_id; full_name; email?; cell_phone?; home_phone?;
  account_count; preferred_account_id?;
  accounts?: { account_id; role?; account_status?; account_primary_contact_name? }[] }
```
`preferred_account_id` favors an active `payer`/`guardian` membership.

### `POST /api/admin/participants/merge`
Body `{ "canonical_participant_id", "duplicate_participant_id" }` → `{ "ok":true }`.

---

## Reporting (read-only)

### `GET /api/admin/reporting/views/:slug`
Whitelisted views only. Query: `limit` (≤500), `offset` (≤100000), `sort` (per-view
allowlist), `order` (`asc|desc`), `start`/`end` (`YYYY-MM-DD` for views with a date column),
plus view-specific numeric filters (e.g. `revenue-waterfall-monthly`).
Success: `{ ok:true, slug, view, limit, offset, sort, order, start, end, filters, rowCount, rows[] }`.
Errors: `unknown_view` (+ `allowed[]`), `invalid_sort_column` (+ `allowedSort[]`),
`invalid_order`, `date_filter_not_supported_for_view`, `invalid_start_date_format`,
`invalid_end_date_format`, `invalid_date_range`, `invalid_filter_value`.

Slugs → views: `primary-kpis`, `payment-board`, `payment-reminders`, `orphan-waivers`,
`orphan-waiver-summary`, `charge-net`, `waiver-documents`, `participant-entitlements`,
`today-sessions`, `upcoming-access-issues`, `waiver-compliance-gaps`, `ar-aging`,
`payment-risk`, `revenue-waterfall-monthly`, `subscription-movement`,
`attendance-utilization-weekly`, `entitlement-burn`, `affiliate-performance`, `data-hygiene`.

`payment-board` columns (used by the receipts Lookup tab): `participant_id, account_id, name,
base_price, actual_price, paid, paid_date, next_due_date, days_late, charge_id,
expected_due_cents, allocated_cents`. Sortable: `name, days_late, next_due_date,
actual_price, base_price`.

### `GET /api/admin/reporting/summary/primary-kpis?month=YYYY-MM`
→ `{ ok:true, kpis: { month_start, month_end, expected_revenue_open_due_cents,
actual_revenue_net_cash_cents, total_visitors_present_checkins,
current_monthly_members_active_count } }`.

### `GET /api/admin/finance/monthly-summary?month=YYYY-MM`
→ `{ ok:true, summary: { month, month_start, month_end, revenue_cents, expenses_cents,
operating_delta_cents, deficit_to_cover_cents, owner_subsidy_cents } }`.

---

## Waivers / viewer

### `GET /api/admin/waivers?limit=50&offset=0`
→ `{ ok:true, limit, offset, rowCount, rows[] }` from `view_waiver_documents`.

### `GET /api/admin/waivers/:id`
→ `{ ok:true, waiverId, participantId, signatureUrl, documentPdfUrl, documentSha256,
locale, content_version, created_at, identity_snapshot }` (signed URLs, 5-min expiry).
Errors: `not_found` (404), `audit_not_found` (404).

### `GET /api/viewer/waiver-documents`  (Cloudflare Access, no admin key)
Same query options as `reporting/views/waiver-documents`; reads `view_waiver_documents`.
`503` if viewer access not configured; `401` if JWT invalid; `403` if email not allowlisted.

### Notifications (operator-triggered)
- `POST /api/admin/notifications/discord/payment-reminders` → `{ ok:true, posted:true, rowCount }`
- `POST /api/admin/notifications/discord/daily-digest` → `{ ok:true, posted:true, summary{...} }`
Errors: `discord_webhook_not_configured` (500), Discord HTTP failure (`502`).
