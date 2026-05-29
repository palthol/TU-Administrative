# Temple Underground — Admin repo (agent guide)

This repo is the **front-end + design home** for Temple Underground's admin-facing apps.
There is **no backend here.** The one true API and the Supabase schema live in the
**`temple underground signup`** repo (`services/api`), which is already deployed.

npm-workspaces monorepo. Node >= 22, npm >= 10.

```
apps/receipts/        Operator finance tool (cash log, invoices, formal billing). UI built.
apps/waiver-viewer/   Mobile waiver review app (Cloudflare Access protected).
docs/frontend-design/ Design home: per-screen → API function maps for the admin apps.
```

## What this repo is for

- Holding the admin **front-ends** (source of truth for request/response shapes).
- Writing **design docs** so that, when there's time to build/finish a UI, wiring it to the
  deployed API is mechanical: every button maps to a documented endpoint.
- Being friendly to **Cursor Cloud agents** doing infrastructure/scaffolding/doc work — not
  UI polish unless asked.

**Do not** add a backend/service to this repo, call a database directly, or hold the
Supabase service-role key here. All server work belongs in the signup/API repo.

## Where things are

- **API contract & per-screen maps:** `docs/frontend-design/` (start at `README.md`).
- **The real API** + schema + the live-DB audit: the `temple underground signup` repo
  (`services/api`, `supabase/migrations/`, `docs/admin-api.md`, `docs/api-schema-audit.md`).

## Commands

```bash
npm install
npm run dev              # receipts + waiver-viewer in parallel
npm run dev:receipts     # receipts UI (default :5176)
npm run dev:waiver-viewer
npm run build
npm run test:receipts
```

The front-ends call the API at `VITE_API_BASE_URL` (default `http://localhost:3001`). Run
the API from the signup repo (`npm run dev:api` there) when you need live data.

## Conventions

- Admin calls send `x-admin-key`; viewer calls use Cloudflare Access (no admin key). See
  `docs/frontend-design/README.md`.
- Money is integer cents; success is `200 { ok:true, ... }`, failure is `{ ok:false, error }`.
- Reuse `apps/receipts/src/lib/admin-api.ts` (`adminFetch`) for new admin calls.
- When the API contract changes (in the signup repo), update `docs/frontend-design/` to match.

## Migration dependency (heads-up for billing UI)

The personal-finance and charge-discount screens depend on Supabase migrations `0017`/`0019`,
which may be unapplied in production. See `docs/api-schema-audit.md` in the signup repo.
