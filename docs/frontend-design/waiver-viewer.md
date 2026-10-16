# Waiver viewer — screen → API map

Status: **implemented** in `apps/waiver-viewer`.

Phone-first list → expand. Cloudflare Access is not the gate. The app opens on the same blocking unlock page as the dashboard and receipts: API base plus staff key, checked with `GET /api/admin/auth/me`. The key stays in memory and is sent as `x-admin-key`. Lock or reload clears it.

**Redesign note:** [`waiver-viewer-redesign.md`](./waiver-viewer-redesign.md).

The Vite dev server is port **5177**. `VITE_API_BASE_URL` prefills the API base (default `http://localhost:3001`).

## Surface → endpoint

| Screen / action | Method · Endpoint | Auth | Reads |
| --- | --- | --- | --- |
| **Unlock** | `GET /api/admin/auth/me` | `x-admin-key` | `staff.display_name`, `staff.role` (`owner` \| `finance` \| `front_desk`), `staff.auth_method` |
| **Waiver list** (mount and Refresh) | `GET /api/admin/reporting/views/waiver-documents?sort=signed_at_utc&order=desc&limit=50&offset=` | `x-admin-key` | `rows[]` from `view_waiver_documents` |
| Sort A–Z | `sort=participant_full_name&order=asc` | " | Resets `offset` to 0 |
| Signed dates | `start=YYYY-MM-DD` and/or `end=YYYY-MM-DD`, only when set | " | Resets `offset` to 0 |
| Next / Previous | same path, `offset` steps by 50 | " | Next stays disabled when the page is shorter than 50 or the read failed |

Search is **not** a query parameter. The field labeled “Search this page” filters the loaded rows on name, email, cell, and home phone (250ms debounce). The API has no `q=`.

Sortable columns on the view include `participant_full_name`, `signed_at_utc`, and `audit_created_at`. This UI uses the first two only.

`200 { ok:true, rows[], ... }` is success. Failure is `{ ok:false, error }`. A refresh that fails keeps the last good page and marks it stale. It does not replace that page with a zero count.

## Operator error copy

| Condition | Copy |
| --- | --- |
| Unlock `401` | That key was not accepted. |
| Unlock `403`, or a role outside `owner` / `finance` / `front_desk` | Your staff role cannot access waivers. / The API did not return a supported staff identity. |
| List `401` | Session expired. Unlock to continue. The workspace locks. |
| List `403` | Your staff role cannot access waivers. |
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

Dashboard People prepares a reading copy with `GET /api/admin/waivers/:id` (`signatureUrl`) and `GET /api/admin/reporting/views/waiver-documents`. It does not open the stored `documentPdfUrl`. This viewer does not call the detail route. Signed PDFs stay on dashboard People.

| Action | Method · Endpoint | Auth | Returns |
| --- | --- | --- | --- |
| Open waiver detail (dashboard only) | `GET /api/admin/waivers/:id` | `x-admin-key` | `signatureUrl`, `documentPdfUrl` (5-min signed), `documentSha256`, `identity_snapshot`, `locale`, `content_version` |
| List (admin variant, dashboard only) | `GET /api/admin/waivers?limit=&offset=` | `x-admin-key` | `{ rows[], rowCount, limit, offset }` |
