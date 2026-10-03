# Responsive operator dashboard

Review date: 2026-10-03. Product brief: attached Temple Underground Admin Dashboard design v1.0, sections 1–10. This is the permitted read-only Phase 1 interim release, not the complete billing release.

## Baseline and inventory (recorded before implementation)

- Frontend base: `origin/main`, `0caf14c5d931c081b9bc77908f443d1bfc628caf`; clean fresh clone. Work branch: `codex/responsive-dashboard-redesign`.
- Active entry: `src/main.tsx` → `App.tsx`. Browser inspection confirmed the analysis-first rail, key/base inputs, KPI console, and admin/operations navigation.
- Preserve HTTP participant lookup, stored waiver retrieval, reports, expense/lead reads, and configured receipts link. Replace developer consoles with operator navigation.
- `src/pages/*`, `contexts/AuthContext.tsx`, and `lib/supabase.ts` form an unmounted, internally referenced alternative. No imports enter them from the active tree. Retire them; they directly query tables and expose a generation RPC.
- Legacy active billing forms lack safe statement/history reconciliation. Retire merge, enrollment, upgrade, per-class charge, refund and write-off entry points. Discord posting is excluded from this task. Scheduling becomes a local-day read flow.
- API reviewed: `main` at `e947bcc027a8ca4cb62bb40fa053f115253bf400`, `develop` at `153abe93977139769ae384e34012c1a7aa0d8d4a`. Their `services/api/src` implementations match. Newer develop status documents the September 24 migration audit; no live release verification was performed.
- `origin/cursor/custom-household-billing` is now remote at `0c97a4cce45cb69bf2c86d690f5152ef1b3a0708`, with obligation/covered-entitlement routes and two additive payer reporting views. It is not merged into main/develop; its status still gates migration/deployment and integration validation. No recurring controls or new payer views are enabled.

## Release dependencies

G1 participant/payer detail and named rosters; G2 canonical plan/current enrollment reads; G3 complete payer statement/allocatable charge balances; G4 payment/refund/receipt history; G5 recurring integration/release; G7 correction previews and reconciliation; G8 generation preview and secure durable sessions; G9 manual charge/void contract; G10 full-refund and discount reporting validation.

Attendance remains read-only because arbitrary roster names cannot be hydrated through released ID reads. No UUID input or entitlement bypass is provided. Payment, enrollment, recurring agreements, generation and corrections remain unavailable with explicit reasons. Existing receipts and Access waiver viewer apps remain independent tools with their existing limitations.

## Screen/action → HTTP endpoint map

Every request uses the configured `VITE_API_BASE_URL`/operator-entered base and runtime `x-admin-key`. Shared `adminFetch` is retained with optional `AbortSignal`; `readAdmin` requires HTTP success and `ok:true`, validates list/summary/attendance envelopes, aborts superseded reads, and applies a 15-second read timeout. Responses are never retried automatically. Network failures remain unavailable, with manual read-only retry. Each source has its own refresh timestamp and error state; previous verified values are explicitly stale after a failed refresh. No mutation is sent by this dashboard.

| Screen/action             | Exact GET request                                                                                                    | Fields and scope                                                                                                                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unlock                    | `/api/admin/auth/me`                                                                                                 | `{staff:{display_name,role,auth_method}}`; supported role required; this is key verification, not a server session                                                                                                          |
| Global participant lookup | `/api/admin/participants/search?q=<trimmed encoded query>&limit=25`                                                  | `rows[].participant_id,full_name,email,cell_phone,home_phone,account_count,preferred_account_id,accounts[]`; minimum 2 chars, 250ms debounce; stale results hidden immediately; no DOB/medical fields                       |
| People waivers            | `/api/admin/waivers?limit=50&offset=<page*50>`                                                                       | `rows[].waiver_id,participant_id,participant_full_name,signed_at_utc`; descending recent list; selected-person filtering is only against the loaded page                                                                    |
| Open/refresh PDF          | `/api/admin/waivers/<encoded waiver_id>`                                                                             | `documentPdfUrl,content_version,locale`; never display identity snapshot/medical fields; signed URL clears after five minutes; explicit Refresh retrieves a fresh link                                                      |
| Today waiver follow-up    | `/api/admin/reporting/views/waiver-compliance-gaps?limit=25&offset=0&order=asc`                                      | `participant_name,latest_waiver_at,missing_waiver,missing_emergency_contact,missing_medical_history`; only incomplete-record flags, never clinical details; active-enrollment population                                    |
| Today access follow-up    | `/api/admin/reporting/views/upcoming-access-issues?limit=25&offset=0&order=asc`                                      | `participant_name,next_session_starts_at`; recorded upcoming attendance only, not all prospective attendees                                                                                                                 |
| Today/Classes agenda      | `/api/admin/scheduling/sessions?start=<local-day>&end=<next-day>&include_cancelled=true&limit=200&offset=<page*200>` | `rows[].id,starts_at,ends_at,session_label,cancelled_at`; API filters UTC days; load both intersecting days and filter instants to New York date, sort by instant; stop at short page or 2,000 rows and label partial scope |
| View attendance           | `/api/admin/scheduling/sessions/<encoded session_id>`                                                                | `session,attendance[].status`; present/no-show/cancelled saved counts; no guessed names or ID typing; no check-in POST, override or charge generation                                                                       |
| Monthly context           | `/api/admin/reporting/summary/primary-kpis?month=YYYY-MM`                                                            | `kpis.expected_revenue_open_due_cents,total_visitors_present_checkins,current_monthly_members_active_count`; outstanding due, check-ins, and current enrollment count; cash field deliberately ignored                      |
| Billing receivables       | `/api/admin/reporting/views/ar-aging?limit=500&offset=0&order=desc`                                                  | `scope,account_id,open_item_count,total_outstanding_cents,bucket_*_cents`; total only from `scope=total`; explicit payer match only against loaded account rows; missing row is unavailable, not zero debt                  |
| Billing allocation review | `/api/admin/reporting/views/payment-risk?limit=50&offset=0&order=desc`                                               | `risk_type,payment_id,charge_id,due_at,gap_cents,days_past_due`; payer match client-side within page; partial allocation is not necessarily an error; this is not history                                                   |
| More expenses             | `/api/admin/billing/operating-expenses?limit=100`                                                                    | `expense_date,category,amount_cents,vendor_name,notes`; bounded latest read, no pagination or all-time inference                                                                                                            |
| More trial inquiries      | `/api/admin/billing/marketing-leads?limit=100`                                                                       | returned name/contact/inquiry-time fields; bounded read; no pipeline/assignment mutation                                                                                                                                    |
| More reports              | `/api/admin/reporting/views/<slug>?limit=50&offset=<page*50>&order=desc[&start=YYYY-MM-DD][&end=YYYY-MM-DD]`         | Default server sort; date filters only when supported; curated field allowlists; desktop tables and phone cards; row count is page length                                                                                   |

### Reports retained

| Slug                            | Date column / default sort                                     | Interpretation                                                                                                      |
| ------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `attendance-utilization-weekly` | `week_start`                                                   | Recorded attendance by week                                                                                         |
| `subscription-movement`         | `month_start`                                                  | Enrollment status movement by plan                                                                                  |
| `data-hygiene`                  | `created_at` / `hygiene_issue_score`                           | Candidate data issues; no merge action                                                                              |
| `charge-net`                    | `due_at`                                                       | Net due is **before allocations**, not collectible balance; no guessed coverage                                     |
| `entitlement-burn`              | no dates / `usage_percent_of_limit`                            | Access usage, separate from payment                                                                                 |
| `participant-entitlements`      | no dates / `participant_id`                                    | Raw partial access context, no attendee picker by UUID                                                              |
| `affiliate-performance`         | `last_credit_earned_at` / `outstanding_credit_liability_cents` | Referrals and credit liability                                                                                      |
| `orphan-waivers`                | `latest_waiver_at`                                             | Unlinked-waiver participant rows                                                                                    |
| `orphan-waiver-summary`         | no dates or sort                                               | `orphan_waiver_participant_count`                                                                                   |
| `payment-board`                 | `next_due_date` / `days_late`                                  | Legacy latest subscription-linked charge; no paid badge or household debt inference; decimal-dollar prices not used |
| `payment-reminders`             | `next_due_date`                                                | Same legacy limitation; no outbound messaging                                                                       |

Report date filters preserve the implementation's raw inclusive date bounds. For timestamp columns, the end date is midnight UTC, not end-of-local-day. No undocumented q/account/status filters are sent. Primary/cash/waterfall/operating-delta consoles are replaced by the gated safe monthly summary; database-`current_date` today view is replaced by the local agenda. Waiver documents are handled through the minimized admin list, not the rich medical report.

### Errors and recovery

- All reads: `401 unauthorized` locks and clears the key/loaded workspace; `403 forbidden` displays the role restriction; connection/timeout errors display unavailable with read-only Retry.
- Search: `400 query_min_length_2` or DB/select failures; client enforces minimum/cap.
- Waiver detail: `404 not_found`, `404 audit_not_found`, `500 invalid_storage_path`, `500 signed_url_failed`, `server_error`; no fake document success. Refresh requires a successful fresh read before showing the link.
- Sessions list: `invalid_start`, `invalid_end`, DB errors. Detail: `invalid_session_id`, `session_not_found`, DB errors. Saved summary is distinct from unavailable check-in; no unsaved rows are advertised.
- Reporting: `unknown_view`, `invalid_sort_column`, `invalid_order`, `date_filter_not_supported_for_view`, `invalid_start_date_format`, `invalid_end_date_format`, `invalid_date_range`, `invalid_filter_value`, DB errors. Client filters use supported columns and real date validation.
- Monthly: `invalid_month_format` or DB errors; unavailable is never rendered as zero. A valid API zero remains zero.

## State, security and verification

The existing runtime key-entry pattern remains, now verified through `/auth/me`. Key and unsent input live in memory only; reload/lock unmounts loaded records and aborts reads. Staff identity is from the API. The shared key still identifies a compatibility actor, not an individual. UI roles do not enforce server read confidentiality.

Browser hashes address the five main destinations. Participant/payer context stays in memory; no unsupported durable record deep link is promised. Visited main panels remain mounted to preserve page/filter/detail state; focus moves to the destination heading, and scroll is restored on navigation. Search is always available with Ctrl/Cmd+K. Mobile has four labeled bottom destinations plus header More, with safe-area spacing. Report date filters use a native modal dialog with keyboard trapping/return focus. Tables reflow into labeled cards below 1024px. Controls target 44px; layouts are checked at 320px and 200% text zoom.

Local tests: `npm run test:dashboard`. Browser fixture flow: `npm --workspace apps/dashboard run test:browser`; use an existing Playwright installation and browser via `DASHBOARD_PLAYWRIGHT_MODULE` and `DASHBOARD_BROWSER_EXECUTABLE` if needed. Optional `DASHBOARD_SCREENSHOT_DIR` writes local screenshots. All fixtures are synthetic, all API traffic is intercepted, and any dashboard mutation fails the test. These tests do not certify a running backend/database or production release.

### Completed validation — 2026-10-03

- Node `v24.19.0`, npm `11.9.0`; `npm ci` succeeded without dependency/lockfile changes.
- `npm run build:dashboard` passed; final `npm run build` passed for dashboard, receipts and waiver viewer.
- `npm run test:receipts`: 7 passing. `npm run test:dashboard`: 8 passing. Final `npm test`: all 15 passing.
- Synthetic browser flow passed at 1440px, 390px and 320px, including 200% text zoom, stale search/cap/minimum, explicit multi-payer choice, failed monthly source/retry, signed-link failure/refresh, paginated waiver scope, UTC-adjacent local classes, saved attendance summary, filters, browser Back, empty storage and lock. Final run: 94 intercepted GETs, no runtime page errors, no production traffic or writes.
- Inspected actual original desktop UI and generated desktop/mobile screenshots. Fixed long contact text reflow discovered by the zoom check. The advertised agent-browser could not start/download its browser here; the same local dev server was verified using Playwright and a packaged Chromium runtime instead. Each browser and dev server was closed after the fixture run.
- Reviewed hooks, request cancellation, semantic navigation/headings/labels, combobox keyboard behavior, card/table field allowlists, focus handling and memory-only auth using the React best-practices checklist. `git diff --check` passed. No full assistive-technology audit or live API/database integration was performed.
- `TU-api` checkout remains unchanged. No charge generation, production data change, backend change, push, merge or deployment was performed.
