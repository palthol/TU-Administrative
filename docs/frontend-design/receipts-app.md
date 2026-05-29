# Receipts app — screen → API map

`apps/receipts` is a **built** single-page operator finance tool. This doc captures, tab by
tab, exactly which endpoint each control calls so the wiring stays correct as the UI evolves
(or is rebuilt elsewhere). Endpoint detail is in [`api-reference.md`](./api-reference.md).

## Shell

- **Header inputs:** `API base` (→ `apiBase`, default `http://localhost:3001`) and
  `Admin key` (→ `x-admin-key`). Every call below sends the key; if it's blank the UI blocks
  the call locally with "Enter your admin API key (x-admin-key)."
- **Fetch helper:** `adminFetch(apiBase, adminKey, path, { method, json })` →
  `{ ok, status, data }`. All handlers check `ok` then read `data.<field>` / `data.error`.
- **Tabs:** `quick` Cash log · `invoice` Invoice · `recent` Recent · `formal` Formal billing
  · `preview` Share preview · `lookup` Board lookup · `void` Void receipt · `refund` Refund
  receipt.
- **Shared sub-component:** `ParticipantLookupField` (used by Cash log + Invoice).

---

## Shared: Participant lookup field

| Control | Method · Endpoint | Request | Reads | Notes |
| --- | --- | --- | --- | --- |
| **Search** | `GET /api/admin/participants/search?q=<q>&limit=8` | `q` ≥ 2 chars | `data.rows[]` → list | On match, **Use** sets `member_display_name` = `full_name` and `account_id` = `preferred_account_id`. |
| **Use external counterparty** | `POST /api/admin/billing/external-counterparty-accounts` | `{ display_name, created_by?, notes }` | `data.account_id` | Fallback when no participant matches; sets `account_id` to the new account. |

---

## Tab: Cash log (`QuickCashTab`)

Form: member display name, amount (USD→cents), method (`cash|card|cashapp|venmo|paypal|zelle|other`),
issued by, notes. Embeds Participant lookup.

| Action | Method · Endpoint | Request body | Success | On success UI |
| --- | --- | --- | --- | --- |
| **Save cash log** | `POST /api/admin/billing/personal-finance-entries` | `{ entry_kind:"cash_received", member_display_name, amount_cents, method, issued_by, notes?, account_id? }` | `{ ok:true, id }` | Shows `id`, builds SMS share text (`buildQuickShareText`). |
| **Share or copy** | — (no API) | — | — | `navigator.share` / clipboard. |

⚠️ Requires migration `0017` (`personal_finance_entries`).

---

## Tab: Invoice (`InvoiceTab`)

Form: member name, amount, due date (default tomorrow), issued by, notes. Embeds Participant lookup.

| Action | Method · Endpoint | Request body | Success |
| --- | --- | --- | --- |
| **Save invoice draft** | `POST /api/admin/billing/personal-finance-entries` | `{ entry_kind:"invoice", member_display_name, amount_cents, issued_by, due_at, invoice_status:"draft", notes?, account_id? }` | `{ ok:true, id }` |
| **Device share / copy** | — | — | `buildInvoiceShareText` |

⚠️ Requires migration `0017`.

---

## Tab: Recent (`RecentTab`)

Loads on mount and on **Refresh**; renders a table of personal entries with inline status actions.

| Action | Method · Endpoint | Request | Reads |
| --- | --- | --- | --- |
| **Load / Refresh** | `GET /api/admin/billing/personal-finance-entries?limit=80` | — | `data.rows[]` (`PersonalEntry`) |
| **Mark sent** (draft only) | `POST /api/admin/billing/personal-finance-entries/:id/invoice-status` | `{ status:"sent" }` | reloads |
| **Mark paid** | same | `{ status:"paid" }` | reloads |
| **Void** | same | `{ status:"void" }` | reloads |

Status actions show only for `entry_kind==='invoice'` rows not already `paid`/`void`.
⚠️ Requires migration `0017`.

---

## Tab: Formal billing (`FormalBillingTab`)

Inputs: member name (display only), `account_id` (UUID), `charge_id` (UUID), amount, method,
issued by, reference, notes, "Issue money-in receipt" checkbox. Plus an embedded **discount**
sub-panel.

| Action | Method · Endpoint | Request body | Success |
| --- | --- | --- | --- |
| **Record formal payment** | `POST /api/admin/billing/record-payment` | `{ account_id, amount_cents, method, issued_by, allocations:[{ charge_id, amount_cents }], reference?, notes?, issue_receipt }` | `{ ok:true, payment_id, receipt_id\|null }` → `buildFormalShareText` |
| **Apply discount line** | `POST /api/admin/billing/charge-discounts` | flat: `{ charge_id, discount_type:"flat", flat_amount_cents, label, reason?, created_by? }` · percent: `{ charge_id, discount_type:"percent", percent_basis_points, label, reason?, created_by? }` | `{ ok:true, discount_id, applied_amount_cents, net_due_cents }` → reloads discount list |
| **Discount list (auto-load on charge_id change)** | `GET /api/admin/billing/charge-discounts?charge_id=<id>&limit=20` | — | `data.rows[]` (`ChargeDiscountRow`) |

Notes:
- The UI currently allocates the **full amount to a single `charge_id`**. Multi-allocation is
  supported by the endpoint (`allocations[]`) if a future UI needs split payments.
- Percent input is whole-percent in the UI; converted to basis points (`×100`) before sending.
- `applied_amount_cents` is computed by the DB; the UI displays the value returned.
- ⚠️ Discount actions require migration `0019` (`charge_discounts` + discount-aware `view_charge_net`).

---

## Tab: Share preview (`SharePreviewTab`)

No API. Renders sample SMS/card text for `quick` / `invoice` / `formal` scenarios.

---

## Tab: Board lookup (`LookupTab`)

| Action | Method · Endpoint | Reads | UI |
| --- | --- | --- | --- |
| **Refresh board** | `GET /api/admin/reporting/views/payment-board?limit=100&sort=next_due_date&order=asc` | `data.rows[]` | Renders all columns; clicking a row copies `account_id=…\ncharge_id=…` to clipboard for the Formal billing tab. |

---

## Tab: Void receipt (`VoidReceiptTab`)

| Action | Method · Endpoint | Request | Success |
| --- | --- | --- | --- |
| **Void receipt** | `POST /api/admin/billing/receipts/:receiptId/void` | `{ void_reason }` | `{ ok:true }` |

---

## Tab: Refund receipt (`RefundReceiptTab`)

| Action | Method · Endpoint | Request | Success |
| --- | --- | --- | --- |
| **Issue refund receipt** | `POST /api/admin/billing/receipts/issue-for-refund` | `{ payment_refund_id, issued_by, notes? }` | `{ ok:true, receipt_id }` |

Requires an existing `payment_refunds` row (created via `POST /api/admin/billing/payment-refunds`,
which the receipts UI does not currently expose — a candidate addition if refunds are issued here).

---

## Coverage vs. the API

Endpoints the receipts UI **already uses**: participant search, external counterparty,
personal-finance-entries (POST/GET/status), record-payment, charge-discounts (GET/POST),
reporting payment-board, receipts void, receipts issue-for-refund.

Endpoints available but **not yet surfaced** in receipts (candidates for future screens):
`payment-refunds`, `charge-adjustments` (write-off), `subscription-upgrade`, per-class
charge/upgrade, `operating-expenses`, `marketing-leads`, `finance/monthly-summary`,
`reporting/summary/primary-kpis`, other reporting view slugs, Discord notifications.
