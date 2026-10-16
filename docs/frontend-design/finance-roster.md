# Finance roster — accounts, subscription, schedule

Status: **proposed.** No screen and no new endpoint exist yet. [`api-reference.md`](./api-reference.md) stays the live contract until `TU-api` `develop` ships the reads and the safe enroll flag below.

This is the next finance-workspace slice on `develop`. It replaces the unrun production script `scripts/production/backfill-subscriptions-2026-09.sql` on `TU-api` branch `chore/subscription-backfill-2026-09` as the way an operator records who is subscribed.

## Why this is the workhorse gap

`apps/receipts` already logs cash, drafts invoices, and records a formal payment against an existing charge. Formal’s payment board only lists charges that already exist. Those charges are produced from subscriptions. Production subscriptions were never backfilled, so the board has nothing to collect for the current members.

The September script inserts three active subscriptions and leaves `automatic_billing_starts_at` null. It also moves one household member onto a shared account. It has not been executed. The roster replaces that script: from an account, pick a plan, set the expected pay date, and later issue one charge by hand when that date is near. Formal already records the payment that satisfies the charge.

## What “schedule” means here

A subscription on `develop` points at a `plan_definitions` row. That row is the schedule the operator picks:

| Plan | Cadence | Catalog price |
| --- | --- | --- |
| Basic Group Plan | monthly | $100.00 |
| Core Group Plan | monthly | $150.00 |
| Unlimited Group Plan | monthly | $200.00 |
| Private Basic Plan | monthly | $150.00 |
| Private Core Plan | monthly | $200.00 |
| Jennifer Hill Unlimited Plan | contract | $135.00 |

Catalog rows come from `TU-api` `supabase/seed.sql`. The screen loads whatever is active in the database. It does not hardcode these six names.

Class `schedule_templates` (Monday 7:00, and so on) stay on the scheduling API. Assigning a class night does not create a subscription or a charge.

The date you set on the roster is `expected_pay_on`. It is the day you want to be reminded to issue a charge. It is not `automatic_billing_starts_at`, and it does not by itself create money owed. A negotiated amount for one period is typed in when you issue the charge. Automatic recurring agreements remain the unmerged obligation design on `cursor/custom-household-billing`.

## Charges and the billing day

Two dates do different jobs.

| Date | Where it lives | What it does |
| --- | --- | --- |
| Expected pay date | Subscription field `expected_pay_on`, set and changed on the roster | “Remind me to issue a charge around this day.” |
| Charge due date | `charges.due_at` | “This amount is owed on this day.” Formal and the existing Discord due-soon list read this. |

On `develop` today, subscriptions have no expected-pay field. `view_member_payment_board.next_due_date` is the latest non-void charge’s `due_at`. `view_member_payment_reminders` keeps rows only when that date is today, overdue, or inside the next 3 days. A person with a plan and no charge has a null due date and is left out of the reminder. That is why opening the finance workspace cannot yet tell you a cycle is coming.

`automatic_billing_starts_at` is a third, different field. It means “the monthly generator may create charges on its own from this date.” Null means the generator skips the subscription. The generator then uses a calendar month and the catalog price. The roster leaves it null. Issuing a charge by hand does not set it.

The enroll save records the person, the plan, and `expected_pay_on`. It does not insert a charge. The charge is a second button, **Issue charge**, used when the date is near. That split is what “the roster save does not emit the charge” means: one save would both enroll them and invent money, and the only enroll route that invents money today also arms the calendar-month generator. Issue charge is the GUI action that creates the one charge you then collect.

## Why the current create call is the wrong button

`POST /api/admin/billing/subscriptions` already exists. `front_desk` receives `403`. Owner and finance may call it. The finance workspace must not use it as the roster save until the API can enroll without arming billing.

On current `develop`:

- There is no list of accounts and no list of plans. Participant search needs a query of at least two characters and returns at most 25 people.
- Omitting `create_initial_charge` resolves to **true** for a paid monthly plan (`resolveInitialChargePreference` in `services/api`).
- For every paid monthly plan, `create_subscription` sets `automatic_billing_starts_at` to the day after the current calendar month, even when the initial charge is suppressed.
- `POST /api/admin/billing/generate-monthly-charges` then bills **catalog** `price_cents` on calendar-month coverage. The daily worker is intentionally not deployed because that coverage drops a 26th or 29th anchor. A null automation date is the fail-safe that keeps a subscription out of the generator.
- The September household is two Core plans at $300.00 catalog and $249.75 agreed. The generator cannot store that difference. Charge discounts exist per charge and are not attached to future generated periods.
- `create_subscription` on `develop` does not reject a second overlapping active subscription for the same person.

Saving “yes, Core” through today’s route would open a catalog charge for the rest of this calendar month and arm next month’s generator. The unrun script exists specifically to avoid that.

## Operator flow

New hash destination `#roster`. Desktop rail includes it. Phone reaches it from More. Cash stays the register path (`Cash · Recent · More`).

1. Unlock as today (`GET /api/admin/auth/me`). Owner and finance can enroll. `front_desk` may open the workspace; a `403` on the roster reads as “Subscriptions are limited to owner and finance.”
2. Load a page of accounts. Each account shows its contact name, status, and members.
3. For each member, the row shows whether an active subscription exists.
4. When it does, the row shows plan name, catalog price, and the expected pay date, plus any open charge and its due date.
5. When it does not, the operator turns on **Has a subscription**, picks a plan, sets the expected pay date, and saves that one person. Membership start defaults to today and stays editable.
6. The plan picker ends with **More options**. That opens More, on the add-plan panel. After a plan is saved, the roster picker includes it.
7. The enroll confirmation is: “{name} is on {plan}. Expected pay date {date}. No charge is issued yet.”
8. **Coming due** lists subscriptions whose expected pay date is within 7 days, or already past, and that do not yet have an open charge for that date. The same rows are added to the Discord payment-reminder post, labeled as “issue a charge,” separate from charges that are already due.
9. **Issue charge** asks for the amount (catalog price filled in, editable) and the due date (expected pay date filled in). The operator confirms the next expected pay date, defaulting to the same day next month. The save inserts one charge and stores that next date. Automatic billing stays off.
10. Formal’s payment board then shows the charge, because `next_due_date` is `charges.due_at`. Record payment works as it does today.

Changing the expected pay date is a separate save on the row. It updates `expected_pay_on` only. A charge already issued keeps its due date.

One account can hold several members. Each member gets their own subscription on that account. The household case is two saves on one account, not one account-level switch.

An existing active subscription stays on its plan. The operator can change the expected pay date and issue the next charge. Plan changes, pauses, cancels, and prorated upgrades stay out of this screen. `POST /api/admin/billing/subscription-upgrade` writes a prorated catalog charge, which is the wrong tool for a baseline correction.

## Proposed API (TU-api `develop` first)

This repo does not add the routes. Ship and document them in `TU-api` before the receipts screen calls them. After they exist, copy the shapes into [`api-reference.md`](./api-reference.md) and the action table in [`receipts-app.md`](./receipts-app.md).

Auth remains `x-admin-key`. Success is `200 { ok:true, ... }`. Money is integer cents. `front_desk` is `403 forbidden` on these routes, matching today’s subscription write rule.

### `GET /api/admin/billing/account-roster`

Query: `limit` (default 50, max 200), `offset` (default 0), `status` (`active` default, or `inactive`, or `all`), optional `q` (min 2 characters; matches account contact name or member full name).

```ts
{
  ok: true,
  limit, offset, rowCount,
  rows: [{
    account_id: string,
    status: 'active' | 'inactive',
    primary_contact_name: string | null,
    members: [{
      participant_id: string,
      full_name: string,
      role: 'member' | 'payer' | 'guardian',
      subscription: null | {
        subscription_id: string,
        status: string,
        plan_definition_id: string,
        plan_name: string,
        billing_cadence: string,
        price_cents: number,
        starts_at: string,          // YYYY-MM-DD
        ends_at: string | null,
        expected_pay_on: string | null, // YYYY-MM-DD
        automatic_billing_starts_at: string | null,
        open_charge: null | {
          charge_id: string,
          amount_cents: number,
          due_at: string,
          status: string
        }
      }
    }]
  }]
}
```

`subscription` is the current active row for that participant on that account, or `null`. A null subscription means “no active subscription was returned,” and the UI says that. Sort accounts by contact name, members by name. When `rowCount` equals `limit`, the screen says the page is partial.

### `GET /api/admin/billing/plans`

Query: `active=true` (default). Returns the catalog the picker uses.

```ts
{
  ok: true,
  rows: [{
    plan_definition_id: string,
    name: string,
    plan_category: string,
    billing_cadence: string,
    price_cents: number,
    currency: 'USD',
    is_active: boolean
  }]
}
```

### Enroll on the existing subscription route

Keep `POST /api/admin/billing/subscriptions`. Add one field and one guard. Current callers that omit the new field keep today’s behavior.

```json
{
  "participant_id": "uuid",
  "plan_definition_id": "uuid",
  "account_id": "uuid",
  "starts_at": "YYYY-MM-DD",
  "expected_pay_on": "YYYY-MM-DD",
  "create_initial_charge": false,
  "arm_automatic_billing": false,
  "notes": "optional"
}
```

Roster rules the API enforces:

- `account_id` is required for this save. The route must not fall through to “first `account_members` row.”
- The participant is a member of that account, and the account is active.
- `create_initial_charge: false` inserts no `charges` row.
- `arm_automatic_billing: false` persists `automatic_billing_starts_at` as null. The generator ignores that subscription.
- A second active subscription whose dates overlap this participant is rejected (`overlapping_active_subscription`). A double-click or a stale page cannot insert two actives.
- Response stays the current envelope, with `initial_charge_id: null` and `automatic_billing_starts_at: null`.

`arm_automatic_billing` omitted means the current paid-monthly behavior: set the automation date to the day after calendar-month end. The roster always sends `false`. The roster always sends `expected_pay_on`. Callers that omit it keep today’s behavior and store null.

### `PATCH /api/admin/billing/subscriptions/:subscriptionId`

Changes the expected pay date.

```json
{ "expected_pay_on": "YYYY-MM-DD" }
```

Response: `{ "ok": true, "subscription_id", "expected_pay_on" }`.

The update writes that column only. Existing charges keep `due_at`. `automatic_billing_starts_at` stays whatever it was; the roster never sends a value that sets it. Errors: `subscription_not_found`, `invalid_expected_pay_on`. `front_desk` is `403`.

### `POST /api/admin/billing/charges`

Issues one charge by hand for one subscription. This is the GUI action that was missing. It does not call `generate_monthly_charges` and does not set `automatic_billing_starts_at`.

```json
{
  "account_id": "uuid",
  "subscription_id": "uuid",
  "amount_cents": 15000,
  "due_at": "YYYY-MM-DD",
  "coverage_start": "YYYY-MM-DD",
  "coverage_end": "YYYY-MM-DD",
  "next_expected_pay_on": "YYYY-MM-DD"
}
```

The charge’s account must match the subscription’s account. `amount_cents` is a positive integer the operator confirmed (the screen prefills the catalog price). `due_at` is the date they are collecting for. `coverage_start` defaults to `due_at` when omitted. `coverage_end` defaults to the day before `next_expected_pay_on`. `next_expected_pay_on` is stored on the subscription after the charge insert succeeds, in the same transaction.

```ts
{
  ok: true,
  charge_id: string,
  account_id: string,
  subscription_id: string,
  amount_cents: number,
  due_at: string,
  expected_pay_on: string
}
```

Errors: `subscription_not_found`, `charge_account_mismatch`, `invalid_amount_cents`, `invalid_due_at`, `invalid_expected_pay_on`, `coverage_end_before_start`. `front_desk` is `403`.

### Coming due, including Discord

`POST /api/admin/notifications/discord/payment-reminders` keeps its current charge section (unpaid charges due within 3 days or overdue). It adds a second section, `issue_charge`, for active subscriptions whose `expected_pay_on` is on or before today+7 and that have no open charge with that `due_at`. Response adds `issueChargeCount` beside the existing `rowCount`. The daily digest includes the same section. The roster **Coming due** list is that same set, loaded from the roster payload in the browser, so the workspace shows it even when Discord is unconfigured.

### `POST /api/admin/billing/plans`

Creates one catalog plan. Used from More. Does not enroll a person and does not insert a charge.

Attendance reads `plan_entitlements`, joined to the plan. A plan row with no entitlement grants no class access. The create copies entitlement rows from a plan the operator already trusts (the Jennifer Hill contract is this shape: its own price and cadence, unlimited group access copied from the pattern of Unlimited Group).

```json
{
  "name": "Weekday plus open mat — negotiated",
  "description": "optional",
  "plan_category": "group",
  "billing_cadence": "monthly",
  "price_cents": 13500,
  "copy_access_from_plan_id": "uuid"
}
```

`plan_category` is `group`, `private`, or `hybrid`. `billing_cadence` is `per_session`, `monthly`, `contract`, or `custom`. `price_cents` is an integer ≥ 0. Currency is USD. `is_active` is true.

```ts
{
  ok: true,
  plan: {
    plan_definition_id: string,
    name: string,
    plan_category: string,
    billing_cadence: string,
    price_cents: number,
    currency: 'USD',
    is_active: true,
    access_copied_from_plan_id: string,
    entitlement_count: number
  }
}
```

Errors: `name_required`, `plan_name_taken` (same name already active), `invalid_plan_category`, `invalid_billing_cadence`, `invalid_price_cents`, `copy_access_from_plan_id_required`, `source_plan_not_found`. `front_desk` is `403`.

Deactivating or editing a plan is a later route. This post only adds one.

## Add a plan on More

More already holds the rare tools (share samples, void, refund). Add a plan is the same kind of action. Peak-hour cash stays on Cash.

The panel fields are name, price in dollars (sent as cents), category, cadence, and **Same access as** (a required select of active plans from `GET /api/admin/billing/plans`). The confirmation line is: “Add {name} at {price}, {cadence}, with the same class access as {source plan}. Nobody is enrolled.”

The roster picker does not contain a second form. **More options** at the bottom of the picker navigates to `#more` and focuses this panel. Saving there returns the new plan id; when the operator goes back to the roster, the picker reloads and can select it.

Owner and finance see the form. Front desk sees “Adding a plan is limited to owner and finance.” and no save control.

## Household cleanup on the roster

The September script’s household step is an operator action on the finance roster, on the account being billed. It is how Natalie is added to William’s account and her empty personal account is deactivated, and the same action works for any later household.

On an account, **Add to this account** searches participants (the existing search, `q` at least 2 characters). The operator picks a person and a role (`member`, `payer`, or `guardian`). If that person already belongs to another account, each other account is listed with its contact name and whether it is financially empty.

**Financially empty** means zero rows in `subscriptions`, `charges`, `payments`, `receipts`, and `personal_finance_entries` for that account. An empty account can be deactivated as part of the same save. An account that has any of those rows stays active; the person can still be added to the household account, and the other account remains the one that holds its money.

The confirmation line is: “Add {person} to {destination} as {role}. Deactivate empty account {source}.” When no source is deactivated: “Add {person} to {destination} as {role}. {source} stays active because it has financial history.”

This does not enroll them and does not create a charge. After the move, the roster row can record a subscription on the destination account with the enroll save.

### `POST /api/admin/billing/household-moves`

```json
{
  "participant_id": "uuid",
  "destination_account_id": "uuid",
  "role": "member",
  "deactivate_source_account_id": "uuid optional"
}
```

In one transaction:

- The destination account is active.
- Insert `account_members` when that pair is missing. An existing pair keeps its role.
- When `deactivate_source_account_id` is set, it is a different account, the person is a member of it, and the five financial counts are zero. Delete that membership, set the account `inactive`, and append a note that names the destination account.
- When any financial count is non-zero, the whole request fails with `source_account_has_financial_history` and nothing is written.

```ts
{
  ok: true,
  participant_id: string,
  destination_account_id: string,
  role: string,
  membership: 'created' | 'already_present',
  deactivated_account_id: string | null
}
```

Errors: `participant_id_required`, `destination_account_id_required`, `invalid_role`, `destination_account_not_active`, `source_account_required_member`, `source_account_has_financial_history`. `front_desk` is `403`.

The roster member includes `other_accounts: [{ account_id, primary_contact_name, status, financially_empty }]`, so the deactivate choice is visible without a second lookup.

## Screen → request map (once the API exists)

| Control | Method · endpoint | Body / query | Reads |
| --- | --- | --- | --- |
| Load roster | `GET /api/admin/billing/account-roster` | `limit=50&offset=0&status=active` | `rows[]` |
| Search | same | `q` when length ≥ 2 | replaces the page |
| Load plans | `GET /api/admin/billing/plans?active=true` | — | picker options, and the “Same access as” select |
| More options | — | navigates to `#more` | focuses the add-plan panel |
| Add plan | `POST /api/admin/billing/plans` | name, category, cadence, `price_cents`, `copy_access_from_plan_id` | new plan in the catalog |
| Save enrollment | `POST /api/admin/billing/subscriptions` | fields above, both flags `false`, plus `expected_pay_on` | person, plan, and expected pay date. No charge. |
| Change expected pay date | `PATCH /api/admin/billing/subscriptions/:id` | `{ expected_pay_on }` | the date on the row. Existing charges keep `due_at`. |
| Issue charge | `POST /api/admin/billing/charges` | `account_id`, `subscription_id`, `amount_cents`, `due_at`, `next_expected_pay_on` | `charge_id`. Formal’s board can select it. |
| Add to this account | `POST /api/admin/billing/household-moves` | `participant_id`, `destination_account_id`, `role`, optional `deactivate_source_account_id` | membership on the destination; empty source deactivated when requested |

Failed saves keep the form. `401` locks the workspace, same as the other finance panels.

## What this screen leaves alone

- No call to `POST /api/admin/billing/generate-monthly-charges`. Enrollment and issue-charge both leave `automatic_billing_starts_at` null.
- The enroll save inserts no charge. **Issue charge** is the only roster action that inserts one, for the amount and due date the operator confirmed.
- No class-template assignment.
- Plan changes, pauses, cancels, and prorated upgrades stay off this screen. The expected pay date on an active subscription can be changed.
- Household cleanup adds a person to an account and can deactivate a different account only when that account has no subscriptions, charges, payments, receipts, or personal-finance rows. It does not move those rows, and it does not merge two participant records into one.
- Personal cash and invoice behavior stays as documented in [`receipts-app.md`](./receipts-app.md).

Formal still collects a charge that already exists. After **Issue charge**, that charge is on the payment board and Record payment works unchanged. The amount is whatever was confirmed, so a period can differ from the catalog price. The unmerged obligation model remains the design for automatic recurring amounts. This loop does not depend on it.

## Build order

1. **TU-api `develop`.** Roster read including `expected_pay_on` and `open_charge`, plan read, plan create, household move, enroll with `expected_pay_on` and both flags false, patch expected pay date, manual charge issue, and the Discord `issue_charge` section. Tests: enroll writes no charge and leaves `automatic_billing_starts_at` null. Patching the date leaves existing `charges.due_at` unchanged. Issue charge inserts one charge, stores `next_expected_pay_on`, and still leaves automatic billing null. A person with only an expected pay date is absent from the old 3-day charge reminder and present in `issue_charge` inside the 7-day window.
2. **This repo.** Add the shapes to `api-reference.md` and `receipts-app.md` only after that API is on `develop`. Build `#roster` with Coming due, change date, and Issue charge, plus household cleanup and the More add-plan panel. Owner/finance can save. Front desk sees the role limit.
3. **Operator pass.** Set each member’s plan and expected pay date. Issue a charge when Coming due says so, then record the formal payment. Leave `chore/subscription-backfill-2026-09` unrun.

## Acceptance for the UI PR

- `#roster` loads accounts and members without pasting UUIDs.
- The plan picker is the active catalog from the API, with cadence and catalog price visible.
- **More options** on the picker opens the add-plan panel on More.
- Add plan sends `copy_access_from_plan_id` and shows the confirmation that nobody is enrolled.
- Enrollment save sends `expected_pay_on`, `create_initial_charge: false`, and `arm_automatic_billing: false`. The confirmation says no charge is issued yet.
- Changing the expected pay date sends only `expected_pay_on`.
- Issue charge sends the confirmed amount, due date, and next expected pay date, and the new charge can be selected on Formal.
- Coming due lists an expected pay date inside 7 days when no open charge exists for it.
- Household cleanup can deactivate a source account only when the roster marks it financially empty, and the confirmation names the person and both accounts.
- A member who already has an active subscription cannot be enrolled again from this screen.
- `front_desk` sees the role limit and no save control.
- `npm run test:receipts` covers the request body and the confirmation copy. `npm run build:receipts` passes.
- Cash, Invoice, Recent, Formal, and More keep their current endpoints.
