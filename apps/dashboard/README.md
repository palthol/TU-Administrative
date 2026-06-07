# Admin dashboard (internal)

shadcn-style UI (Tailwind + Radix) for analysis and admin API testing.

**Analysis:** primary KPIs, finance monthly summary, and all whitelisted reporting views.

**Administration:** participant search, merge, create subscription, plan upgrade, pay-per-class,
write-off, refund, waiver list + signed URLs.

**Operations:** operating expenses, marketing leads, Discord notifications, scheduling.

**Finance log endpoints** (personal finance entries, formal `record-payment`, charge discounts,
receipt void/refund) live in `apps/receipts` — linked from the dashboard header.

API contract: `temple underground signup` repo → `docs/admin-api.md`.  
Design docs in this repo: `docs/frontend-design/api-reference.md`.

## Run

```bash
# from admin repo root
npm install
npm run dev:dashboard
```

Copy `apps/dashboard/.env.example` to `.env` and set values.  
Set `VITE_API_BASE_URL` if the API is not at `http://localhost:3001` (start API from signup repo: `npm run dev:api`).

Paste **`x-admin-key`** only in trusted environments; it is not persisted in localStorage.
