# Waiver viewer — light redesign note

Status: **design only** (lightweight). The viewer is already closer to an operator phone
tool than receipts; this is a polish / gap list, not a full IA rewrite.
Companion contract: [`waiver-viewer.md`](./waiver-viewer.md).

## Intent

Keep `apps/waiver-viewer` as the **Cloudflare Access–gated, mobile-first** waiver review
surface. Do not merge it into the admin-key dashboard or receipts apps.

## What to keep

- Access-only auth (`/api/viewer/*`); no browser `x-admin-key`.
- Single scroll surface: list → expand detail.
- Large tap targets, sticky sort/refresh controls, narrow shell.

## Gaps / polish (priority order)

1. **Signed PDF / signature open** — still blocked on the documented API decision:
   add `GET /api/viewer/waivers/:id` (Access-signed URLs) **or** keep opening admin-only.
   Do not put the admin key in this app.
2. **Date filter + pagination** — API already supports `start`/`end`, `limit`/`offset`;
   UI currently hard-codes first 200 rows and omits date filter (doc mentioned it; mark
   unimplemented until built).
3. **Retire leftovers** — `.env.example` still mentions `VITE_ADMIN_API_KEY`; remove.
   Drop unused admin-key CSS (e.g. `.configured-key-note`).
4. **Light visual align** — optional: warm body / deep-red accent tokens to rhyme with
   dashboard/receipts, without importing a dashboard shell or Obsidian blocks. Keep the
   one-surface phone model.
5. **Tests** — add a minimal smoke test script when touching the app; none today.

## ObsidianUI

**Not recommended** for this app. The surface is too small to justify a dashboard shell or
motion kit; polish CSS tokens and fix the product gaps above instead.

## Out of scope

- Replacing Access with admin-key auth.
- Building a five-destination operator shell here.
- Surfacing clinical detail beyond what `view_waiver_documents` already returns in the
  expand panel (minimize, don’t expand, sensitive presentation).
