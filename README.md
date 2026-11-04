# Temple Underground — Admin

Front-ends and design docs for Temple Underground's internal admin tools. **This repo has no
backend** — the deployed API and Supabase schema live in the `temple underground signup` repo
(`services/api`).

| Workspace | What it is | Dev port |
| --- | --- | --- |
| `apps/dashboard` | Analysis views + admin API consoles (merge, billing, waivers, reporting) | 5174 |
| `apps/receipts` | Operator finance tool: cash log, invoices, formal billing, share text | 5176 |
| `apps/waiver-viewer` | Mobile waiver review app (staff-key unlock) | 5177 |

```
Browser (dashboard / receipts / waiver-viewer, Vite)
  -> API in the `temple underground signup` repo (services/api, :3001 locally)
       - /api/auth/*    cookie-based session auth (SSO) when deployed
       - /api/admin/*   guarded by cookie session when signed in, otherwise (legacy) x-admin-key
       - /api/viewer/*  Cloudflare Access route; the waiver viewer does not call it
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

In dev, the apps default to calling the API at `http://localhost:3001`. In production
builds, they default to `https://api.templeunderground.com`. Set `VITE_API_BASE_URL` to
override either default.

SSO login lives at `/login` in the dashboard app and calls `POST /api/auth/login`.
All admin API calls use `fetch(..., { credentials: 'include' })`. The API sets a host-only
`__Host-tu_admin_session` cookie on `api.templeunderground.com` (`SameSite=Strict`, no `Domain`).
Apps never read that cookie; signed-in state comes only from `GET /api/auth/me`. When the SSO
endpoints are deployed, a `401` redirects to the dashboard login page. If the SSO endpoints are
not deployed yet (`GET /api/auth/me` returns `404`), the apps fall back to the existing
in-browser staff-key unlock page (the legacy `x-admin-key` gate). Set `VITE_LOGIN_URL` to
override where other tools redirect on sign-in / sign-out; defaults to the local dashboard
login in dev and `https://admin.templeunderground.com/login` in production builds.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | All front-ends in parallel |
| `npm run build` | Build all front-ends |
| `npm run dev:dashboard` | Dashboard only (port 5174) |
| `npm run test:receipts` | Receipts unit tests |
| `npm run test:waiver-viewer` | Waiver viewer unit tests |

## Design docs (the point of this repo)

`docs/frontend-design/` maps every admin screen/button to the exact API endpoint, request
body, and response shape so future UI work is mechanical:

- `docs/frontend-design/README.md` — conventions, auth, envelope, how to use these docs.
- `docs/frontend-design/api-reference.md` — the real endpoint contract.
- `docs/frontend-design/receipts-app.md` — receipts tab-by-tab → endpoint map.
- `docs/frontend-design/waiver-viewer.md` — viewer surface → endpoint map.

For the backend, schema, and the live-DB audit, see the `temple underground signup` repo
(`docs/admin-api.md`, `docs/api-schema-audit.md`).
