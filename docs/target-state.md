# Admin target state

The admin repository remains the home of internal operator interfaces and contains no
backend or privileged database credentials.

## Intended outcomes

- One maintained dashboard architecture with deliberate authentication and navigation.
- Individual staff identity and role-aware controls replace a shared browser admin key.
- Privileged business operations call documented API endpoints.
- A Today workflow combines sessions, roster/check-in, entitlements, waiver gaps, and
  walk-in billing.
- Finance distinguishes personal notes from formal charges, payments, refunds, receipts,
  and operating expenses using operator-friendly selection rather than raw UUIDs.
- Waiver review provides safe signed document access.
- Loading, empty, error, unauthorized, and confirmation states are consistent.
- Each application has automated smoke/interaction coverage and CI build gates.

## Milestones

1. Resolve duplicate dashboard implementation and add test infrastructure.
2. Inventory/verify deployments and safely validate current API integrations.
3. Build Today and improve participant/account/charge selection workflows.
4. Adopt API-backed staff RBAC when the backend contract is ready.
5. Add payment and delivery experiences after their API integrations exist.

Execution order is maintained in `../work-queue/README.md`.
