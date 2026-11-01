# Implementation prompt — finance roster

Paste the block below into an agent. The contract is [`finance-roster.md`](./finance-roster.md). Do not reopen the product decisions in that brief.

```text
Implement the Temple Underground finance roster described in
docs/frontend-design/finance-roster.md in TU-Administrative. That file is the
contract. Request and response shapes there win over anything you invent.

The operator loop, in order:

1. On an account, pick a plan and set an expected pay date. That save records
   the subscription and inserts no charge.
2. Coming due shows anyone whose expected pay date is within 7 days, or already
   past, and who has no open charge for that date. The same rows are added to
   the Discord payment-reminder post as an "issue a charge" section.
3. Issue charge confirms the amount and the due date, then stores the next
   expected pay date (default: the same day next month).
4. Formal’s existing payment board lists that charge, and Record payment
   collects it. After a successful issue, put the new charge in the in-memory
   Formal selection (account id, charge id, member name, amount) and offer a
   way to open #formal with that selection already filled.

There is no backend in TU-Administrative. The API and schema live in
github.com/palthol/TU-api on develop. Phase 1 is that repo. Phase 2 is
apps/receipts in TU-Administrative, and it starts only after those routes
exist on TU-api develop. If they do not, stop the UI work and say so. Do not
fake the routes, proxy them, or change a request body so a missing server
accepts it.

Do not run scripts/production/backfill-subscriptions-2026-09.sql. Do not merge
or port cursor/custom-household-billing. Do not call
POST /api/admin/billing/generate-monthly-charges from the UI. Do not set
automatic_billing_starts_at. That column arms calendar-month generation at the
catalog price. expected_pay_on is a different column: it is only the date the
operator wants to be reminded to issue a charge. Changing it must not rewrite
charges.due_at.

Auth stays x-admin-key. Success is HTTP 200 { ok:true, ... }. Money is integer
cents. front_desk is 403 on every new route. Owner and finance can save.

PHASE 1 — TU-api develop

Add a migration for subscriptions.expected_pay_on date, nullable. Null means
no reminder date. Do not backfill production rows.

Ship these routes, matching finance-roster.md exactly, including error keys:

- GET /api/admin/billing/account-roster
  Accounts, members, the active subscription on that account, expected_pay_on,
  open_charge, and other_accounts with financially_empty. financially_empty
  means zero rows in subscriptions, charges, payments, receipts, and
  personal_finance_entries. Sort accounts by contact name, members by name.
- GET /api/admin/billing/plans
- POST /api/admin/billing/plans
  Copy plan_entitlements from copy_access_from_plan_id in the same
  transaction. Enroll nobody. Insert no charge. Reject a duplicate active name.
- POST /api/admin/billing/subscriptions
  Keep current callers working. When arm_automatic_billing is omitted, paid
  monthly plans still set automatic_billing_starts_at as they do today. When
  the roster sends arm_automatic_billing false and create_initial_charge false,
  persist automatic_billing_starts_at null and insert no charge. Require
  account_id on this path (do not fall through to the first account_members
  row). Store expected_pay_on when sent; omitted stays null. Reject a second
  overlapping active subscription for that participant with
  overlapping_active_subscription.
- PATCH /api/admin/billing/subscriptions/:subscriptionId
  Body { expected_pay_on }. Write that column only.
- POST /api/admin/billing/charges
  One manual charge for one subscription. Same transaction stores
  next_expected_pay_on on the subscription. coverage_start defaults to due_at.
  coverage_end defaults to the day before next_expected_pay_on. Reject
  coverage_end before coverage_start. Do not set automatic_billing_starts_at.
  amount_cents is the operator’s confirmed integer, not a silent catalog
  lookup.
- POST /api/admin/billing/household-moves
  Add account_members on the active destination. Deactivate the source only
  when the five financial counts are zero; otherwise fail the whole
  transaction with source_account_has_financial_history. Do not move charges,
  payments, or subscriptions. Do not merge participant rows. An existing
  destination membership keeps its role.
- POST /api/admin/notifications/discord/payment-reminders and the daily digest
  Keep the current unpaid-charge section (due within 3 days or overdue). Add
  issue_charge for active subscriptions whose expected_pay_on is on or before
  today+7 and that have no open charge with that due_at. Add issueChargeCount
  to the response. A person with only an expected pay date must stay out of
  the old 3-day charge list.

Document the routes in TU-api docs/admin-api.md. Tests must prove: enroll with
both flags false writes a subscription, writes no charge, and leaves
automatic_billing_starts_at null; omitting the flag still sets the automation
date; patching expected_pay_on leaves charges.due_at unchanged; issue charge
inserts one charge and advances expected_pay_on only if the insert succeeds;
household deactivation rolls back when any financial row exists; plan create
copies entitlements and enrolls nobody.

PHASE 2 — TU-Administrative apps/receipts

Follow the operator shell already in apps/receipts (hash destinations, memory-
only staff key, adminFetch, cents). Read docs/frontend-design/receipts-app.md
and receipts-redesign.md. After Phase 1 is on develop, copy the live shapes
into docs/frontend-design/api-reference.md and the action table in
receipts-app.md. Until then, leave api-reference.md unchanged.

Add destination Roster, hash #roster. Desktop rail includes it. Phone reaches
it from More. Bottom nav stays Cash, Recent, More.

Roster screen:

- Load GET /api/admin/billing/account-roster. Say when the page is partial
  (rowCount equals limit). 401 locks the workspace. 403 says subscriptions
  are limited to owner and finance, with no save controls.
- Coming due at the top: expected_pay_on within 7 days or earlier, and no
  open charge for that date.
- Each account shows contact name, status, and members. A member with a
  subscription shows plan name, catalog price, expected pay date, and any
  open charge with its due date. They cannot be enrolled again. They can
  change expected pay date (PATCH, body only expected_pay_on) and issue a
  charge.
- A member without a subscription: Has a subscription, plan picker from
  GET /api/admin/billing/plans?active=true (name, cadence, catalog price),
  expected pay date, start date defaulting to today. The picker ends with
  More options, which opens #more and focuses Add a plan.
- Enroll confirmation, before the request: "{name} is on {plan}. Expected pay
  date {date}. No charge is issued yet." POST body includes account_id,
  participant_id, plan_definition_id, starts_at, expected_pay_on,
  create_initial_charge false, arm_automatic_billing false.
- Issue charge confirmation, before the request: amount (catalog price filled
  in, editable, sent as cents), due date (expected pay date filled in), next
  expected pay date (same day next month, editable). Say that automatic
  billing stays off. On success, refresh the row and offer Formal with the
  new charge selected in memory.
- Add to this account: existing participant search (q length at least 2),
  role member, payer, or guardian. List other_accounts. Deactivate is
  available only when financially_empty is true. Confirmation names the
  person and both accounts, and says the source stays active when it has
  financial history. This save does not enroll and does not create a charge.
- Add a plan on More: name, price in dollars, category (group, private,
  hybrid), cadence (per_session, monthly, contract, custom), and Same access
  as (required, active plans). Confirmation: "Add {name} at {price},
  {cadence}, with the same class access as {source plan}. Nobody is enrolled."
  front_desk sees "Adding a plan is limited to owner and finance." After
  save, the roster picker reloads and can select the new plan.
- Failed writes keep the form. Success copy names the person and the plan or
  the amount. Raw ids stay behind a Details disclosure.
- Do not add plan changes, pause, cancel, subscription-upgrade, per-class
  charges, or class-template assignment.

Tests in apps/receipts: enroll body has both flags false and expected_pay_on;
date change sends only expected_pay_on; issue-charge body has amount_cents,
due_at, and next_expected_pay_on; coming-due includes a date inside 7 days
with no open charge and excludes one that already has that charge; household
deactivate is omitted unless financially_empty. npm run test:receipts and
npm run build:receipts pass. Cash, Invoice, Recent, Formal, and More keep
their current endpoints.

Done when an owner can open #roster, set a plan and expected pay date without
a charge appearing, see that person under Coming due inside the 7-day window,
issue one charge for a confirmed amount, and record the formal payment against
that charge.
```
