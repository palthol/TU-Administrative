# Finance roster — accounts, subscription, schedule

Status: **proposed.** No screen and no new endpoint exist yet. [`api-reference.md`](./api-reference.md) stays the live contract until `TU-api` `develop` ships the reads and the safe enroll flag below.

This is the next finance-workspace slice on `develop`. It replaces the unrun production script `scripts/production/backfill-subscriptions-2026-09.sql` on `TU-api` branch `chore/subscription-backfill-2026-09` as the way an operator records who is subscribed.

## Why this is the workhorse gap

`apps/receipts` already logs cash, drafts invoices, and records a formal payment against an existing charge. Formal’s payment board only lists charges that already exist. Those charges are produced from subscriptions. Production subscriptions were never backfilled, so the board has nothing to collect for the current members.

The September script inserts three active subscriptions and leaves `automatic_billing_starts_at` null. It also moves one household member onto a shared account. It has not been executed. A roster in the finance workspace records the same enrollment fact for every account, one person at a time, without a SQL review.

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

The billing **anchor day** (the 26th, the 29th) and a negotiated household amount are a later payer agreement. They are designed on `TU-api` branch `cursor/custom-household-billing` as `billing_obligations`, and that branch is not merged or deployed. This roster does not invent that agreement.

## Charges and the billing day

On `develop`, a charge is linked to an account and, for subscription billing, to a subscription (`charges.account_id`, `charges.subscription_id`). The period is `coverage_start`, `coverage_end`, and `due_at`. There is no anchor-day column on `subscriptions`.

`generate_monthly_charges` bills an active paid monthly subscription only when `automatic_billing_starts_at` is set. That column means “do not generate before this date.” Null means the generator skips the subscription. The coverage end is the last day of the calendar month that contains `coverage_start`, and `due_at` equals `coverage_start`. The amount is the plan’s catalog `price_cents`. The 26th and 29th in the September script are notes. The generator does not read them.

On the unmerged obligation branch, the anchor day lives on the payer agreement, and the charge points at `charges.billing_obligation_id`. Coverage then runs from one anchor day to the next. That link does not exist on `develop`, and this roster does not create it.

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
4. When it does, the row shows plan name, cadence, catalog price, start date, and whether automatic billing is off.
5. When it does not, the operator turns on **Has a subscription**, picks a plan, sets a start date (default today), and saves that one person.
6. The plan picker ends with **More options**. That opens More, on the add-plan panel. After a plan is saved, the roster picker includes it.
7. The confirmation line is: “This records {name} on {plan} starting {date}. No charge is created. Automatic billing stays off.”
8. Success copy names the person and the plan. The technical subscription id stays behind Details.

One account can hold several members. Each member gets their own subscription on that account. The household case is two saves on one account, not one account-level switch.

An existing active subscription is shown and left unchanged. Plan changes, pauses, cancels, and prorated upgrades stay out of this screen. `POST /api/admin/billing/subscription-upgrade` writes a prorated catalog charge, which is the wrong tool for a baseline correction.

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
        automatic_billing_starts_at: string | null
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

`arm_automatic_billing` omitted means the current paid-monthly behavior: set the automation date to the day after calendar-month end. The roster always sends `false`.

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
| Save enrollment | `POST /api/admin/billing/subscriptions` | fields above, both flags `false` | person + plan on the row |
| Add to this account | `POST /api/admin/billing/household-moves` | `participant_id`, `destination_account_id`, `role`, optional `deactivate_source_account_id` | membership on the destination; empty source deactivated when requested |

Failed saves keep the form. `401` locks the workspace, same as the other finance panels.

## What this screen leaves alone

- No call to `POST /api/admin/billing/generate-monthly-charges`.
- No initial charge, no catalog-price debt, no automatic billing date.
- No class-template assignment.
- No edit of an enrollment that is already active.
- Household cleanup adds a person to an account and can deactivate a different account only when that account has no subscriptions, charges, payments, receipts, or personal-finance rows. It does not move those rows, and it does not merge two participant records into one.
- Personal cash and invoice behavior stays as documented in [`receipts-app.md`](./receipts-app.md).

Formal still collects only charges that already exist. After this roster, those charges still have to be issued by a payer agreement that can store an anchor day and an agreed amount. That agreement is the obligation model on `cursor/custom-household-billing`. Merging and deploying it is a separate `TU-api` decision. Until then, the finance workspace can say who is on which plan, and it still must not pretend the catalog price is the amount due.

## Build order

1. **TU-api `develop`.** Roster read, plan read, plan create (with copied entitlements), household move, `arm_automatic_billing: false`, overlap rejection. Tests: paid monthly enroll with both flags false writes a subscription, writes no charge, leaves `automatic_billing_starts_at` null, and a second overlapping enroll fails. Plan create writes one `plan_definitions` row and the same entitlement rows as the source plan, and enrolls nobody. A household move onto an active account deactivates a source only when the five financial counts are zero, and leaves both accounts unchanged when they are not. Omitting the new enroll flag still sets the automation date, so existing callers stay stable.
2. **This repo.** Add the shapes to `api-reference.md` and `receipts-app.md` only after that API is on `develop`. Build `#roster`, household cleanup on the account, and the More add-plan panel, with **More options** on the picker opening that panel. Owner/finance can save. Front desk sees the role limit.
3. **Operator pass.** Mark each current member from the roster. Leave `chore/subscription-backfill-2026-09` unrun.
4. **Later.** Payer schedule (amount + anchor) from the obligation design, then an explicit activate step that issues the period charge Formal already knows how to collect.

## Acceptance for the UI PR

- `#roster` loads accounts and members without pasting UUIDs.
- The plan picker is the active catalog from the API, with cadence and catalog price visible.
- **More options** on the picker opens the add-plan panel on More.
- Add plan sends `copy_access_from_plan_id` and shows the confirmation that nobody is enrolled.
- Enrollment save sends `create_initial_charge: false` and `arm_automatic_billing: false` and shows the confirmation before the request.
- Household cleanup can deactivate a source account only when the roster marks it financially empty, and the confirmation names the person and both accounts.
- A member who already has an active subscription cannot be enrolled again from this screen.
- `front_desk` sees the role limit and no save control.
- `npm run test:receipts` covers the request body and the confirmation copy. `npm run build:receipts` passes.
- Cash, Invoice, Recent, Formal, and More keep their current endpoints.
