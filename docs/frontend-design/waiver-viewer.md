# Waiver viewer — screen → API map

`apps/waiver-viewer` is a mobile-first admin app for reviewing signed waivers. Unlike the
receipts app, it is **not** gated by the `x-admin-key` in the browser — it sits behind
**Cloudflare Access** (JWT + email allowlist), and the API enforces that on `/api/viewer/*`.

See `apps/waiver-viewer/cloudflare/README.md` for how to obtain `CF_ACCESS_TEAM_DOMAIN`,
`CF_ACCESS_AUD`, and the email allowlist. Locally, `WAIVER_VIEWER_DEV_BYPASS=true` skips
Access when CF is not configured.

## Surface → endpoint

| Screen / action | Method · Endpoint | Auth | Reads |
| --- | --- | --- | --- |
| **Waiver list** | `GET /api/viewer/waiver-documents?sort=signed_at_utc&order=desc&limit=&offset=` | Cloudflare Access | `data.rows[]` from `view_waiver_documents` |
| Sort by name | `GET /api/viewer/waiver-documents?sort=participant_full_name&order=asc` | " | " |
| Date filter | add `start=YYYY-MM-DD&end=YYYY-MM-DD` (view exposes `signed_at_utc`) | " | " |

`view_waiver_documents` rows are rich (participant identity, signature/PDF object paths,
medical history, emergency contact, audit metadata). Sortable columns:
`participant_full_name`, `signed_at_utc`, `audit_created_at`.

## Signed document access (admin-key surface)

The viewer list returns object **paths**, not signed URLs. To open a single waiver's PDF +
signature image with short-lived signed URLs, use the admin-key endpoint (operator/trusted
context only — this requires `x-admin-key`, so it is not part of the Cloudflare-Access-only
browser flow unless a trusted proxy adds the key):

| Action | Method · Endpoint | Auth | Returns |
| --- | --- | --- | --- |
| Open waiver detail | `GET /api/admin/waivers/:id` | `x-admin-key` | `signatureUrl`, `documentPdfUrl` (5-min signed), `documentSha256`, `identity_snapshot`, `locale`, `content_version` |
| List (admin variant) | `GET /api/admin/waivers?limit=&offset=` | `x-admin-key` | `{ rows[], rowCount, limit, offset }` |

**Design decision to make when building detail view:** the viewer is Access-gated and does
not hold the admin key in the browser. To show signed PDF/signature URLs there, either (a)
add a `/api/viewer/waivers/:id` endpoint that signs URLs after Access verification, or
(b) keep document opening in an admin-key context only. Today only the admin-key
`GET /api/admin/waivers/:id` signs URLs. Note this gap before wiring a viewer detail screen.

## Envelope & errors

- `200 { ok:true, ... }` on success.
- `503 viewer_access_not_configured` / `viewer_allowlist_not_configured` — env not set.
- `401 unauthorized` — missing/invalid Access JWT.
- `403 forbidden` — email not on the allowlist.
