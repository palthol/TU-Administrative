# Waiver viewer — operator UI

Status: **implemented** in `apps/waiver-viewer`.
Companion contract: [`waiver-viewer.md`](./waiver-viewer.md).

## Intent

`apps/waiver-viewer` is the Cloudflare Access–gated, phone-first waiver review tool. It stays a single list → expand surface. It is not part of the dashboard or receipts shells.

An operator opens the Access shortcut, sees who signed and what is missing, and expands one record. Same list endpoint. Same Access auth.

## Shipped in this pass

- Temple operator tokens (warm `#f7f7f5` body, ink `#171c24`, deep red `hsl(0 70% 34%)`). No navy/indigo chrome, no API URL, no view name in the header.
- Auto-load plus Refresh. In-flight reads abort. 15s timeout. Failed refresh keeps the last page and marks it stale.
- Sort chips: Recent (`signed_at_utc desc`) and A–Z (`participant_full_name asc`). Date `start` / `end` when set. Both reset `offset` to 0.
- Pages of 50. Search filters the loaded page only.
- Default expand is contact, emergency contact, acknowledgements, and the PDF limitation. Medical answers sit behind “Medical answers (sensitive)”. Record ids sit behind a disclosure. Snapshot JSON and signature vectors are not rendered.
- No browser admin key in `.env.example`. Dev server port is 5177.

## Still blocked (signup repo)

Signed PDF / signature open needs `GET /api/viewer/waivers/:id` (Access-signed URLs). Dashboard People already signs URLs with `GET /api/admin/waivers/:id`, which this app must not call. Do not put an admin key here to paper over that gap.

## ObsidianUI

Not used. The surface is one column of vanilla React and CSS.

## Out of scope

- Replacing Access with admin-key auth.
- A five-destination operator shell, bottom nav, or hash routes.
- Clinical detail beyond the columns `view_waiver_documents` already returns, and never as the default expand.
- Discord, billing, participant search, or any mutation.
