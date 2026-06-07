# Temple Underground — Admin

Front-ends and design docs for Temple Underground's internal admin tools. **This repo has no
backend** — the deployed API and Supabase schema live in the `temple underground signup` repo
(`services/api`).

| Workspace | What it is | Dev port |
| --- | --- | --- |
| `apps/dashboard` | Analysis views + admin API consoles (merge, billing, waivers, reporting) | 5174 |
| `apps/receipts` | Operator finance tool: cash log, invoices, formal billing, share text | 5176 |
| `apps/waiver-viewer` | Mobile waiver review app (Cloudflare Access protected) | 5177 |

```
Browser (receipts / waiver-viewer, Vite)
  -> API in the `temple underground signup` repo (services/api, :3001 locally)
       - /api/admin/*   guarded by x-admin-key
       - /api/viewer/*  guarded by Cloudflare Access
  -> Supabase (Postgres) via the service-role key (server-only, NOT in this repo)
```

## Getting started

```bash
npm install
npm run dev            # dashboard + receipts + waiver-viewer in parallel
# or individually:
npm run dev:dashboard
npm run dev:receipts
npm run dev:waiver-viewer
```

Set `VITE_API_BASE_URL` if the API is not on `http://localhost:3001`. Start the API itself
from the signup repo: `npm run dev:api`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | All front-ends in parallel |
| `npm run build` | Build all front-ends |
| `npm run dev:dashboard` | Dashboard only (port 5174) |
| `npm run test:receipts` | Receipts unit tests |

## Design docs (the point of this repo)

`docs/frontend-design/` maps every admin screen/button to the exact API endpoint, request
body, and response shape so future UI work is mechanical:

- `docs/frontend-design/README.md` — conventions, auth, envelope, how to use these docs.
- `docs/frontend-design/api-reference.md` — the real endpoint contract.
- `docs/frontend-design/receipts-app.md` — receipts tab-by-tab → endpoint map.
- `docs/frontend-design/waiver-viewer.md` — viewer surface → endpoint map.

For the backend, schema, and the live-DB audit, see the `temple underground signup` repo
(`docs/admin-api.md`, `docs/api-schema-audit.md`).
