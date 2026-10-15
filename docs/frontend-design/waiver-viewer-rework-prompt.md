# Agent prompt — waiver viewer UI rework

Paste everything below the rule into a new agent on `develop` of
`palthol/TU-Administrative`. The durable IA lives in
[`waiver-viewer-redesign.md`](./waiver-viewer-redesign.md). Endpoint bodies stay in
[`waiver-viewer.md`](./waiver-viewer.md) and [`api-reference.md`](./api-reference.md).

---

You are implementing the **operator UI rework** for `apps/waiver-viewer` in the Temple
Underground **admin** repo (`palthol/TU-Administrative`). Dashboard and receipts already
shipped this language. The waiver viewer is the remaining surface: still a navy/indigo
developer phone list that dumps medical fields, hard-codes the first 200 rows, and
exposes API URLs.

Do **not** add a backend, call a database, or put `x-admin-key` / `VITE_ADMIN_API_KEY`
in this app. The API lives in the **`temple underground signup`** repo. This pass is
**UI + docs + tests in this repo only.**

## Mission

Turn `apps/waiver-viewer` into a phone-first **waiver review tool** that matches the
dashboard/receipts operator workspace, without turning it into a five-destination shell.

Job: an operator on a phone opens the Access-gated shortcut, sees who signed, what is
missing, and expands one record. Same API. Same Access auth. Better product.

## Read first (in this order)

1. `docs/frontend-design/waiver-viewer-redesign.md` — target IA (this work’s spec).
2. `docs/frontend-design/waiver-viewer.md` — screen → endpoint map.
3. `docs/frontend-design/api-reference.md` (Waivers / viewer + reporting query rules).
4. `apps/waiver-viewer/src/App.tsx` + `styles.css` — current monolith.
5. `apps/dashboard/src/index.css` and `apps/dashboard/src/components/operator/People.tsx`
   (`Waivers` + `WaiverDocument`) — visual tokens and the admin-key PDF flow you must
   **not** copy.
6. `docs/frontend-design/receipts-redesign.md` — operator language / anti-slop rules
   (ignore finance destinations).
7. `AGENTS.md` and `.cursor/rules/frontend-design.mdc`.

## Non-negotiable constraints

- Auth is **Cloudflare Access only** (`credentials: "same-origin"` on
  `GET /api/viewer/waiver-documents`). No browser admin key. No `/api/admin/*` calls.
- Keep the **one-surface** model: list → expand. No desktop rail, no bottom-nav
  destinations, no hash IA like `#cash` / `#people`.
- Do **not** install ObsidianUI, Motion, GSAP, Tailwind, shadcn, or a shared UI package.
  Stay vanilla React + CSS. Copy Temple tokens into `styles.css`.
- Do **not** change request/response shapes. Do not invent `GET /api/viewer/waivers/:id`
  in this repo (that belongs in the signup API later).
- Do **not** treat storage **paths** (`document_pdf_url`, `signature_image_url`) as
  clickable signed URLs. They are object paths. Dashboard People signs PDFs via
  `GET /api/admin/waivers/:id` (admin key). This app cannot.
- Medical / identity-snapshot / signature-vector data: **minimize**. Default expand is
  contact + emergency + acknowledgements + completeness. Full medical answers stay
  behind a collapsed “Medical answers (sensitive)” disclosure. Never render
  `identity_snapshot` or `signature_vector_json` as pretty-printed JSON.
- Money/API conventions still apply: `200 { ok:true, ... }`, `{ ok:false, error }`.
- Default scope here is scaffolding/docs unless this task asks for UI — **this task
  asks for the UI.**

## Current product problems (fix these)

`apps/waiver-viewer` today:

- Hero dumps “Supabase `view_waiver_documents`” and the raw API URL.
- Navy `#172554` / indigo chips / Inter-on-cool-gray — a third brand next to the
  shipped Temple shell (`#f7f7f5` body, `#171c24` ink, deep red `0 70% 34%`).
- KPI theater: Loaded / Last 24h / Sort.
- Auto-loads on mount **and** still leads with a full-width “Load waivers” CTA.
- Hard-codes `limit=200&offset=0`. No `start`/`end`. No pagination. Date filter is
  documented and unimplemented.
- Expand dumps every medical boolean, raw UUIDs, SHA-256, and storage paths.
- `.env.example` still documents `VITE_ADMIN_API_KEY`. Unused `.configured-key-note`
  CSS remains.
- No tests. Root `npm test` does not cover this app.
- README says Vite is `:5176`; `vite.config.ts` is **`:5177`**.

## Target UI

### Shell

Narrow phone-first column (max ~40rem). Safe-area padding. Sticky toolbar under a
short header — not a floating marketing hero.

- Heading: **Waivers**
- One sentence: **Review who signed and what’s missing.**
- No API URL, no view name, no “admin API” copy in the chrome.

Sticky toolbar (44px targets):

| Control | Behavior |
| --- | --- |
| Search | Client-side filter of the **loaded page** (name, email, cell, home). 250ms debounce. Label the scope: “Search this page”. API has no `q=`. |
| Sort | Chips: **Recent** (`signed_at_utc desc`) · **A–Z** (`participant_full_name asc`). Changing sort resets `offset` to 0 and refetches. |
| Dates | Native `start` / `end` (`YYYY-MM-DD`). Sent as query params only when set. Changing dates resets `offset` to 0 and refetches. |
| Refresh | Secondary. Auto-load on mount. Abort in-flight reads. 15s timeout. |

### List cards

Each card is one tap target (expand/collapse). Show only:

- Participant name (or “Name not recorded”)
- Signed {local datetime}
- Email / phone if present (one line)
- Completeness flags: **Review confirmed / not confirmed**, **Medical on file / missing**, **Emergency on file / missing**

Do not show DOB, address, medical answers, UUIDs, or document paths on the collapsed card.

### Expanded record (default)

1. **Participant** — name, email, phones. Address only if useful for door/staff; still no
   identity snapshot.
2. **Emergency contact** — name, relationship, phone, email.
3. **Waiver** — signed at, consent, review confirmed, four initials. Hide raw
   `waiver_id` / `participant_id` behind a “Record ids” disclosure.
4. **Documents** — operator limitation, not a fake Open button:
   “Signed PDF opens from dashboard People. This viewer cannot request signed URLs.”
5. **Medical answers (sensitive)** — collapsed `<details>`. Only then show the existing
   medical fields. Prefer Yes / No / Not recorded. Do not invent clinical interpretation.

### Pagination + honesty

- `limit=50` (dashboard People parity), `offset` pages.
- Previous / Next. Disable Next when the page is short or the read failed.
- Copy: **Page starting at record N. This list cannot prove a person has no waiver.**
- Empty: distinguish “no rows on this page” vs “search on this page matched nothing”
  vs “unavailable”.
- Failed refresh: keep last good rows and mark them **stale**. Never paint missing
  counts as 0 if the read failed.
- `401` → “Sign in through Cloudflare Access, then reload.”
- `403` → “This account is not on the waiver viewer allowlist.”
- `503` `viewer_access_not_configured` / `viewer_allowlist_not_configured` →
  “Viewer access is not configured on the API.”
- Network/timeout → “Waivers unavailable. Retry.” with a Retry control.

### Visual system (copy tokens, don’t import apps)

From dashboard/receipts:

- Body `#f7f7f5`, white work panels, ink `#171c24`
- Primary deep red `hsl(0 70% 34%)`
- Muted `hsl(215 18% 35%)`
- Tight display heading, no 3.4rem hero, no card-shadow theater, no purple/indigo
- Focus ring 3px on primary; 44px controls; check 320px width and 200% text zoom
- Completeness flags: quiet pills. Missing emergency/medical uses a warning treatment;
  do not use success-green for “on file” as a fake KPI.

### Fetch layer

Extract a small `viewerFetch` helper (`apps/waiver-viewer/src/lib/viewer-api.ts`):

- `credentials: "same-origin"`
- Optional `AbortSignal`
- 15s timeout
- Require HTTP success **and** `ok:true`
- Map machine `error` keys to the operator strings above
- Build the list query from `{ sort, order, limit, offset, start?, end? }` only

No auto-retry. Refresh is a user action (plus the initial mount load).

## Implementation sketch

1. Split `App.tsx` into shell / toolbar / list / card. Keep the app small.
2. Replace `styles.css` tokens and retire `.configured-key-note`, `.api-base-line`,
   `.stats-grid` KPI chrome, and the oversized hero.
3. Implement date query + 50-row pagination + client search-on-page.
4. Collapse medical; hide ids/paths/JSON as specified.
5. Delete `VITE_ADMIN_API_KEY` from `apps/waiver-viewer/.env.example` and any README
   implication that the browser holds an admin key. Fix the Vite port to **5177**.
6. Add a **minimal** Node test script (vitest like receipts, or `node --test` like
   dashboard) covering: query-string builder, completeness flags, error-key mapping.
   Wire `test:waiver-viewer` into the repo-root `package.json` `test` script.
7. Update `docs/frontend-design/waiver-viewer.md` + this redesign doc status to
   **implemented** only after the UI matches. Keep endpoint tables accurate.

## Explicitly out of scope

- Signup-repo work (`GET /api/viewer/waivers/:id`, Access-signed URLs).
- Calling `/api/admin/waivers/:id` or sending `x-admin-key` from this app.
- Merging this app into dashboard or receipts.
- Five-destination operator shell, Obsidian, Tailwind, shadcn.
- Surfacing clinical detail beyond what `view_waiver_documents` already returns,
  and never as the default expand.
- Discord, billing, participant search API, mutations of any kind.
- Changing Cloudflare Access / tunnel docs except to remove admin-key leftovers
  and fix the local port.

## Acceptance

- Phone-first one-surface viewer; Temple operator look; no third brand.
- Auto-load + Refresh; sort chips; date filter; 50-row pagination; search-this-page.
- Default expand has no medical dump, no JSON blobs, no fake PDF links.
- No `VITE_ADMIN_API_KEY` in the viewer app.
- `npm run test:waiver-viewer` and `npm run build:waiver-viewer` pass; root
  `npm test` includes the new script.
- `docs/frontend-design/` stays in sync with the shipped calls.
- Verify in a browser (or the closest substitute): load, sort, date filter, page,
  expand, stale/error, 320px and a ~390px phone width. Do not claim PDF open works.

If a follow-up API is required for signed PDFs, document it as a signup-repo task.
Do not stub an admin-key workaround.
