# Waiver viewer — operator redesign brief

Status: **implementation brief (not built)**. Paste-ready agent prompt:
[`waiver-viewer-rework-prompt.md`](./waiver-viewer-rework-prompt.md).
Endpoint contract: [`waiver-viewer.md`](./waiver-viewer.md).
Philosophy: [`dashboard-redesign.md`](./dashboard-redesign.md) and shipped
`apps/dashboard` / `apps/receipts`.

## Product intent

`apps/waiver-viewer` is the **Cloudflare Access–gated, mobile-first** waiver review
tool. It stays a separate app from the admin-key dashboard and the receipts write
tool. An operator adds it to a phone home screen, signs in through Access once, and
reviews who signed and what is missing.

It is already closer to an operator phone tool than receipts was. The rework is still
a real UI pass: the current screen reads as a developer list (API URL in chrome,
navy/indigo third brand, first-200 hard-code, full medical dump). Align it with the
Temple operator language **without** importing a five-destination shell.

## What to keep

- Access-only auth (`GET /api/viewer/waiver-documents`); no browser `x-admin-key`.
- Single scroll surface: list → expand one record.
- Large tap targets, sticky controls, narrow shell.
- `credentials: "same-origin"` so Access cookies reach the API on the shared host.
- Vanilla React + CSS (no new design-system dependency).

## UI kit decision

**Do not adopt ObsidianUI, Tailwind, or shadcn for this app.** The surface is too
small to justify a dashboard shell or a second component kit. Copy Temple tokens
into `apps/waiver-viewer/src/styles.css`.

| Temptation | Verdict |
| --- | --- |
| Dashboard rail / bottom nav | Wrong. One job, one surface. |
| Obsidian marketing / motion | Poor fit for a phone review tool. |
| Admin-key PDF open from People | Correct on dashboard; **forbidden** here. |
| Cherry-pick CSS tokens | Yes: `#f7f7f5` body, `#171c24` ink, deep red `0 70% 34%`. |

## Target information architecture

No hash destinations. No in-memory “selected person” from a search API. Context is
the loaded page plus one expanded `waiver_id`.

| Region | Job | Actions |
| --- | --- | --- |
| Header | Orient | Title **Waivers** + one sentence. No API URL / view name. |
| Sticky toolbar | Scope the list | Search this page; Recent / A–Z; start–end dates; Refresh. |
| List | Scan | Cards: name, signed at, contact line, completeness flags. |
| Expand | Inspect | Contact, emergency, acknowledgements; medical collapsed; no fake PDF. |
| Pager | Page the view | Previous / Next at `limit=50`. Honest partial-scope copy. |

### Completeness flags (card + expand)

Derived only from fields already on the row:

| Flag | On file | Missing |
| --- | --- | --- |
| Review | `review_confirm_accuracy === true` | otherwise |
| Medical | `medical_history_id` present | otherwise |
| Emergency | `emergency_contact_id` present | otherwise |

Do not infer “healthy” from medical booleans. Missing emergency/medical is a
follow-up hint, not a diagnosis.

### Search vs fetch

The viewer list API has **no** `q=`. Search filters the **current page** in memory
(name, email, cell, home). Label that limit. Changing sort or dates refetches and
resets `offset` to 0. Search does not.

## Visual system

Align with dashboard/receipts:

- Shell: warm flat body `#f7f7f5`, white panels, ink `#171c24`.
- Primary: deep red `hsl(0 70% 34%)`.
- Typography: tight heading (`clamp` near dashboard, not the current 3.4rem hero).
- No drop-shadow card theater, no KPI tiles (Loaded / Last 24h / Sort).
- 44px targets; 320px width and 200% text zoom; safe-area on the sticky bar.
- Operator copy. Errors lead with what to do, not `Error 401:`.

## Auth and session

- Production: Cloudflare Access JWT + API email allowlist. See
  `apps/waiver-viewer/cloudflare/README.md`.
- Local: `WAIVER_VIEWER_DEV_BYPASS=true` on the **API** (signup repo), not a Vite
  admin key.
- `401` → sign in through Access and reload (this app has no Lock/key field).
- `403` → not on the allowlist.
- `503` `viewer_access_not_configured` / `viewer_allowlist_not_configured` → API
  env missing.
- Never persist an admin key. Remove `VITE_ADMIN_API_KEY` from `.env.example`.

## Screen / action → HTTP map (target UI)

Same endpoint as today. This table is the **query remap**, not a new API.

| Action | Method · Endpoint | Notes |
| --- | --- | --- |
| Load / refresh | `GET /api/viewer/waiver-documents?sort=&order=&limit=50&offset=` | `credentials: "same-origin"`. Require `ok:true`. |
| Sort Recent | `sort=signed_at_utc&order=desc` | Default. |
| Sort A–Z | `sort=participant_full_name&order=asc` | |
| Date filter | add `start=YYYY-MM-DD` and/or `end=YYYY-MM-DD` | View date column is `signed_at_utc`. Inclusive raw bounds; timestamp end is midnight UTC, not end-of-local-day (same caveat as dashboard reports). |
| Next / previous | `offset` ± 50 | Short page or failed read → no Next. |

Success envelope (reporting-views shape): `{ ok:true, limit, offset, sort, order, start, end, rowCount, rows[] }`.

### Signed PDF (explicit gap)

List rows return **object paths**, not signed URLs. The only signer today is
admin-key `GET /api/admin/waivers/:id` (dashboard People). This viewer must not
call that route.

**UI copy, not a button that 404s:** “Signed PDF opens from dashboard People. This
viewer cannot request signed URLs.”

**Follow-up in the signup repo (out of scope here):** `GET /api/viewer/waivers/:id`
that signs after Access verification. Do not stub the admin-key workaround.

## Sensitive presentation

`view_waiver_documents` is rich. The UI is not allowed to dump it.

**Default expand**

- Participant: name, email, phones (address optional).
- Emergency contact.
- Waiver acknowledgements / initials / signed at.
- Completeness flags.
- Record ids (`waiver_id`, `participant_id`) behind a disclosure.
- Document limitation note (no path, no SHA-256 as the lead line).

**Collapsed by default**

- All medical booleans and free-text injury/clearance fields, behind
  **Medical answers (sensitive)**.

**Never render as primary content**

- `identity_snapshot`
- `signature_vector_json`
- Raw SHA-256 / storage paths as if they were links

## Fetch / stale rules

- Abort superseded reads; 15s timeout; no automatic retry.
- Failed refresh: keep last good rows, mark **stale**, show Retry.
- Unavailable is not zero. Do not invent a “last 24h” KPI.
- Page copy must say this list cannot prove a person has no waiver.

## Implementation sketch

1. Split `App.tsx` into shell, toolbar, list, card; add `src/lib/viewer-api.ts`.
2. Retoken `styles.css`; delete leftover admin-key CSS.
3. Date query + 50-row pagination + search-this-page.
4. Collapse medical; hide ids / JSON / fake PDF.
5. Clean `.env.example` + README (Vite port is **5177**, not 5176).
6. Add `test:waiver-viewer` (query builder, flags, error map) and include it in
   root `npm test`.
7. Mark this brief **implemented** only when the UI matches.

## Acceptance

- One-surface phone tool; Temple tokens; no third brand; no dashboard shell.
- Auto-load, Refresh, sort chips, dates, pagination, search-this-page.
- Default expand is not a medical dump; no fake signed-PDF control.
- No `VITE_ADMIN_API_KEY` in the viewer app.
- `npm run test:waiver-viewer` and `npm run build:waiver-viewer` pass.
- Docs in this folder match the shipped calls.

## Out of scope

- Replacing Access with admin-key auth.
- Building a five-destination operator shell.
- Signup-repo signed-URL endpoint.
- Expanding clinical presentation beyond the collapsed disclosure.
- Mutations, Discord, participant search API, billing.
