# Admin front-end design docs

This folder is the **design home** for Temple Underground's admin-facing applications.
It exists so that, when there's time to build/finish a UI, wiring it up is mechanical:
every screen and button here is mapped to the exact backend endpoint, request body, and
response shape it should call.

## Ground rules for this repo

- **No backend lives here.** The one true API is the deployed service in the
  **`temple underground signup`** repo (`services/api`). This repo holds the admin
  **front-ends** (`apps/dashboard`, `apps/receipts`, `apps/waiver-viewer`) and these
  **design docs**.
- **The UI is the contract.** Where a screen already exists (dashboard, receipts),
  the UI's existing calls are the source of truth and are documented as-is. Do not change
  request/response shapes to "improve" them without also changing the API.
- **Docs describe the real API**, not an idealized one. See [`api-reference.md`](./api-reference.md).

## How to use these docs when building a screen

1. Prefer a **redesign brief** when one exists (target IA + gates). Use the per-app
   **endpoint map** for exact request/response wiring.
2. Find the screen/tab → it lists each action, the endpoint, the request body, the
   success shape, and the error keys.
3. Cross-check the endpoint in [`api-reference.md`](./api-reference.md) for full
   request/response detail and validation rules.
4. Build the component; assert the documented success/error fields.

## Contents

The current dashboard release is documented in [dashboard-redesign.md](./dashboard-redesign.md).
Its endpoint map and explicit gates supersede the old developer-console behavior.

| Doc | What it covers |
| --- | --- |
| [`api-reference.md`](./api-reference.md) | The real endpoint contract the admin front-ends call (base URL, auth, envelope, every endpoint). |
| [`dashboard-redesign.md`](./dashboard-redesign.md) | `apps/dashboard` — operator surface, endpoint map, and release gates. |
| [`receipts-app.md`](./receipts-app.md) | `apps/receipts` — current tab-by-tab → endpoint map (built UI). |
| [`receipts-redesign.md`](./receipts-redesign.md) | `apps/receipts` — operator finance workspace IA + ObsidianUI decision (implemented). |
| [`finance-roster.md`](./finance-roster.md) | `apps/receipts` — proposed roster: plan, expected pay date, manual charge, then Formal. |
| [`waiver-viewer.md`](./waiver-viewer.md) | `apps/waiver-viewer` — viewer surface → endpoint map (implemented). |
| [`waiver-viewer-redesign.md`](./waiver-viewer-redesign.md) | `apps/waiver-viewer` — phone-first operator UI (implemented). |

## Conventions (apply to every admin call)

- **Base URL:** the deployed API host. Locally `http://localhost:3001`
  (`VITE_API_BASE_URL` overrides; falls back to `http://localhost:3001`).
- **Auth (`/api/admin/*`):** send header `x-admin-key: <ADMIN_API_KEY>`. Missing/wrong key
  → `401 { ok:false, error:"unauthorized" }`. The key is operator-entered in the UI; never
  bake it into a build.
- **Waiver viewer:** same runtime staff key as the other admin apps (`x-admin-key`),
  checked with `GET /api/admin/auth/me`, then
  `GET /api/admin/reporting/views/waiver-documents`. `/api/viewer/*` remains a
  Cloudflare Access route on the API; this app does not call it.
- **Envelope:** success → HTTP `200` with `{ ok:true, ...fields }`. Failure → non-2xx with
  `{ ok:false, error:"<machine_key>" }`. Clients check `res.ok` then read `data.<field>` /
  `data.error`.
- **Money is integer cents** end to end. The UI converts dollars→cents before sending and
  formats cents→dollars on display (`parseDollarsToCents`, `formatUsdFromCents`).
- **The shared fetch helper** is `apps/receipts/src/lib/admin-api.ts` (`adminFetch`).
  Reuse this pattern in any new admin screen.

## Dependency note (read before building billing screens)

Two billing surfaces (personal finance entries; charge discounts) depend on Supabase
migrations `0017` and `0019`, which were **not yet applied to production** as of
2026-05-29. See the audit in the signup repo: `docs/api-schema-audit.md`. Apply those
migrations before relying on those endpoints.
