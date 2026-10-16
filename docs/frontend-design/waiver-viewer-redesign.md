# Waiver viewer — operator UI

Status: **implemented** in `apps/waiver-viewer`.
Companion contract: [`waiver-viewer.md`](./waiver-viewer.md).

## Intent

`apps/waiver-viewer` is the phone-first waiver review tool. It stays a single list → expand surface. It is not part of the dashboard or receipts shells.

An operator unlocks with the same blocking page as those apps (API base + staff key), sees who signed and what is missing, and expands one record. The list is `GET /api/admin/reporting/views/waiver-documents` with `x-admin-key`.

## Shipped in this pass

- Temple operator tokens (warm `#f7f7f5` body, ink `#171c24`, deep red `hsl(0 70% 34%)`). No navy/indigo chrome, no API URL, no view name in the header.
- Auto-load plus Refresh. In-flight reads abort. 15s timeout. Failed refresh keeps the last page and marks it stale.
- Sort chips: Recent (`signed_at_utc desc`) and A–Z (`participant_full_name asc`). Date `start` / `end` when set. Both reset `offset` to 0.
- Pages of 50. Search filters the loaded page only.
- Default expand is contact, emergency contact, acknowledgements, and the PDF limitation. Medical answers sit behind “Medical answers (sensitive)”. Record ids sit behind a disclosure. Snapshot JSON and signature vectors are not rendered.
- Staff key is entered at runtime and kept in memory only. It is not written to `.env` or `localStorage`. Dev server port is 5177.

## Still blocked (signup repo)

Signed PDF / signature open stays on dashboard People (`GET /api/admin/waivers/:id`). This app does not request signed URLs.

## ObsidianUI

Not used. The surface is one column of vanilla React and CSS.

## Out of scope

- A five-destination operator shell, bottom nav, or hash routes.
- Clinical detail beyond the columns `view_waiver_documents` already returns, and never as the default expand.
- Discord, billing, participant search, or any mutation.
