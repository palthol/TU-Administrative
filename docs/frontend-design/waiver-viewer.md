# Waiver viewer — screen → API map

Status: **implemented** in `apps/waiver-viewer`.

Phone-first list → expand. Auth is Cloudflare Access (`credentials: "same-origin"`). This app does not send `x-admin-key` and does not call `/api/admin/*`.

**Redesign note:** [`waiver-viewer-redesign.md`](./waiver-viewer-redesign.md).

See `apps/waiver-viewer/cloudflare/README.md` for `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, and the email allowlist. Locally, `WAIVER_VIEWER_DEV_BYPASS=true` on the API skips Access when Cloudflare is not configured. The Vite dev server is port **5177**.

## Surface → endpoint

| Screen / action | Method · Endpoint | Auth | Reads |
| --- | --- | --- | --- |
| **Waiver list** (mount and Refresh) | `GET /api/viewer/waiver-documents?sort=signed_at_utc&order=desc&limit=50&offset=` | Cloudflare Access | `rows[]` from `view_waiver_documents` |
| Sort A–Z | `sort=participant_full_name&order=asc` | " | Resets `offset` to 0 |
| Signed dates | `start=YYYY-MM-DD` and/or `end=YYYY-MM-DD`, only when set | " | Resets `offset` to 0 |
| Next / Previous | same path, `offset` steps by 50 | " | Next stays disabled when the page is shorter than 50 or the read failed |

Search is **not** a query parameter. The field labeled “Search this page” filters the loaded rows on name, email, cell, and home phone (250ms debounce). The API has no `q=`.

Sortable columns on the view include `participant_full_name`, `signed_at_utc`, and `audit_created_at`. This UI uses the first two only.

`200 { ok:true, rows[], ... }` is success. Failure is `{ ok:false, error }`. A refresh that fails keeps the last good page and marks it stale. It does not replace that page with a zero count.

## Operator error copy

| Condition | Copy |
| --- | --- |
| `401` | Sign in through Cloudflare Access, then reload. |
| `403` | This account is not on the waiver viewer allowlist. |
| `503` `viewer_access_not_configured` or `viewer_allowlist_not_configured` | Viewer access is not configured on the API. |
| Network, timeout (15s), or any other failure | Waivers unavailable. Retry. |

## What expand shows

Default: participant name and contact, address when one is stored, emergency contact, signed time, consent, review confirmation, and the four initials.

| Disclosure | Contents |
| --- | --- |
| Record ids | `waiver_id`, `participant_id` |
| Medical answers (sensitive) | Medical booleans and free text already on `view_waiver_documents`, as Yes / No / Not recorded |

The collapsed card shows name, signed time, email/phone when present, and three completeness flags (review, medical, emergency). It does not show date of birth, address, medical answers, ids, or document paths.

`document_pdf_url` and `signature_image_url` are storage paths. The viewer does not link them. Copy in the record: “Signed PDF opens from dashboard People. This viewer cannot request signed URLs.”

`identity_snapshot` and `signature_vector_json` are not rendered.

## Signed PDF (signup repo, not this app)

Dashboard People signs a PDF with `GET /api/admin/waivers/:id` and `x-admin-key`. This viewer cannot call that route.

Follow-up for the signup repo: `GET /api/viewer/waivers/:id` that returns short-lived signed URLs after the same Access checks as the list. Do not stub that with an admin key in this app.

| Action | Method · Endpoint | Auth | Returns |
| --- | --- | --- | --- |
| Open waiver detail (dashboard only) | `GET /api/admin/waivers/:id` | `x-admin-key` | `signatureUrl`, `documentPdfUrl` (5-min signed), `documentSha256`, `identity_snapshot`, `locale`, `content_version` |
| List (admin variant, dashboard only) | `GET /api/admin/waivers?limit=&offset=` | `x-admin-key` | `{ rows[], rowCount, limit, offset }` |
