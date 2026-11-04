# Receipts (finance workspace)

Operator finance tool: cash log, invoices, and formal billing.

## Authentication

- When the SSO endpoints are deployed, receipts checks `GET /api/auth/me` (`fetch` uses
  `credentials: 'include'`). Apps never read the API cookie; signed-in state comes only from `/me`.
  If signed in, it unlocks automatically and reads staff identity from `GET /api/admin/auth/me`
  without sending `x-admin-key`. If not signed in, a `401` redirects to the dashboard login page
  (`VITE_LOGIN_URL`, default `https://admin.templeunderground.com/login`) with
  `?return_to=<current URL>`.
- If the SSO endpoints are not deployed yet (`GET /api/auth/me` returns `404`), receipts falls back to
  the existing in-browser staff key unlock page. The key is kept in memory and sent as `x-admin-key`.

## Run locally

```bash
# from admin repo root, with the API running in the signup repo
npm run dev:api
npm run dev:receipts
```

Open:

```text
http://localhost:5176
```

