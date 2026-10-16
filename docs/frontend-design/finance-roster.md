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
6. The confirmation line is: “This records {name} on {plan} starting {date}. No charge is created. Automatic billing stays off.”
7. Success copy names the person and the plan. The technical subscription id stays behind Details.

One account can hold several members. Each member gets their own subscription on that account. The household case is two saves on one account, not one account-level switch.

An existing active subscription is shown and left unchanged. Plan changes, pauses, cancels, and prorated upgrades stay out of this screen. `POST /api/admin/billing/subscription-upgrade` writes a prorated catalog charge, which is the wrong tool for a baseline correction.

## Proposed API (TU-api `develop` first)

This repo does not add the routes. Ship and document them in `TU-api` before the receipts screen calls them. After they exist, copy the shapes into [`api-reference.md`](./api-reference.md) and the action table in [`receipts-app.md`](./receipts-app.md).

Auth remains `x-admin-key`. Success is `200 { ok:true, ... }`. Money is integer cents. `front_desk` is `403 forbidden` on all three routes, matching today’s subscription write rule.

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

## Screen → request map (once the API exists)

| Control | Method · endpoint | Body / query | Reads |
| --- | --- | --- | --- |
| Load roster | `GET /api/admin/billing/account-roster` | `limit=50&offset=0&status=active` | `rows[]` |
| Search | same | `q` when length ≥ 2 | replaces the page |
| Load plans | `GET /api/admin/billing/plans?active=true` | — | picker options |
| Save enrollment | `POST /api/admin/billing/subscriptions` | fields above, both flags `false` | person + plan on the row |

Failed saves keep the form. `401` locks the workspace, same as the other finance panels.

## What this screen leaves alone

- No call to `POST /api/admin/billing/generate-monthly-charges`.
- No initial charge, no catalog-price debt, no automatic billing date.
- No household account merge and no deactivation of a superseded account. That part of the September script stays a reviewed data fix if it is still needed.
- No class-template assignment.
- No edit of an enrollment that is already active.
- Personal cash and invoice behavior stays as documented in [`receipts-app.md`](./receipts-app.md).

Formal still collects only charges that already exist. After this roster, those charges still have to be issued by a payer agreement that can store an anchor day and an agreed amount. That agreement is the obligation model on `cursor/custom-household-billing`. Merging and deploying it is a separate `TU-api` decision. Until then, the finance workspace can say who is on which plan, and it still must not pretend the catalog price is the amount due.

## Build order

1. **TU-api `develop`.** Roster read, plan read, `arm_automatic_billing: false`, overlap rejection. Tests: paid monthly enroll with both flags false writes a subscription, writes no charge, leaves `automatic_billing_starts_at` null, and a second overlapping enroll fails. Omitting the new flag still sets the automation date, so existing callers stay stable.
2. **This repo.** Add the shapes to `api-reference.md` and `receipts-app.md` only after that API is on `develop`. Build `#roster` in `apps/receipts` with the confirmation line, owner/finance save, and `403` copy for front desk.
3. **Operator pass.** Mark each current member from the roster. Leave `chore/subscription-backfill-2026-09` unrun.
4. **Later.** Payer schedule (amount + anchor) from the obligation design, then an explicit activate step that issues the period charge Formal already knows how to collect.

## Acceptance for the UI PR

- `#roster` loads accounts and members without pasting UUIDs.
- The plan picker is the active catalog from the API, with cadence and catalog price visible.
- Save sends `create_initial_charge: false` and `arm_automatic_billing: false` and shows the confirmation before the request.
- A member who already has an active subscription cannot be enrolled again from this screen.
- `front_desk` sees the role limit and no save control.
- `npm run test:receipts` covers the request body and the confirmation copy. `npm run build:receipts` passes.
- Cash, Invoice, Recent, Formal, and More keep their current endpoints.
