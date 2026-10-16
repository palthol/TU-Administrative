# Admin dashboard (internal)

Responsive operator workspace using the existing React/Vite/Tailwind/Radix stack.

Current release: **read-only Phase 1 interim slice**. Today, People, Billing, Classes,
and More replace the analysis-first console navigation. Search participants and explicitly
select a linked payer; page through waivers and refresh signed PDF links; view a New York
local-day agenda and saved attendance summaries; review defined monthly metrics,
receivables, expenses, inquiries and curated reports.

Payment recording, enrollment, recurring agreements, charge generation and corrections
remain gated by the verified read/release gaps. Individual attendance updates await named
roster reads and a reviewed exception workflow. Cash/operating-delta totals are withheld
pending full-refund reporting validation. Separate receipts and waiver-viewer apps remain
available and retain their existing contracts and limitations. More → Reports and tools,
and Billing, open those deployed apps (`https://finance.templeunderground.com` and
`https://waiverviewer.templeunderground.com`) unless a public `VITE_*_APP_URL` overrides
them. Local `npm run dev` still uses ports 5176 and 5177. A loopback URL is never used
in a production build; a missing public destination is shown as unavailable.

See [dashboard-redesign.md](../../docs/frontend-design/dashboard-redesign.md) for the
reviewed frontend/API commits, exact endpoint map, scope definitions, release gates and
verification evidence. No browser database queries or RPCs are used.

**Authentication:** enter a staff/admin key at runtime and verify `/api/admin/auth/me`.
Keys and loaded records clear on Lock/Sign out or reload. No key is placed in `VITE_*`,
links or browser storage. Supabase Auth does not authorize admin API calls.

**Finance log endpoints** (personal finance entries, formal `record-payment`, charge discounts,
receipt void/refund) live in `apps/receipts` — linked from Billing and More.

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

## Verification

From the repository root: `npm run build:dashboard`, `npm run build`,
`npm run test:dashboard`, `npm run test:receipts`.

Synthetic browser flows: `npm --workspace apps/dashboard run test:browser` with an
available Playwright installation. `DASHBOARD_PLAYWRIGHT_MODULE` can point to its module;
`DASHBOARD_BROWSER_EXECUTABLE` can point to an installed Chromium binary. Browser tests
intercept every API request, reject mutations and block external traffic. They verify
desktop/390px/320px layouts, 200% text zoom, stale lookup, payer selection, document retry,
local-day agenda, filters, Back and lock. They are not live API/database validation.
