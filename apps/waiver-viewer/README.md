# Waiver viewer

Phone-first waiver review for operators. One surface: a list, then one expanded record.

Cloudflare Access is the only gate. The browser does not send an admin key and does not call `/api/admin/*`.

## Data source

```text
GET /api/viewer/waiver-documents
```

The API checks the Access JWT and the email allowlist, then reads `view_waiver_documents`. Object paths in that view are not signed URLs. Signed PDFs open from dashboard People.

## Run locally

```bash
# from repo root
# API: allow local dev without Cloudflare Access
# (set in the signup repo, not in this app)
WAIVER_VIEWER_DEV_BYPASS=true

npm run dev:api
npm run dev:waiver-viewer
```

Open the Vite URL:

```text
http://localhost:5177
```

Vite proxies `/api` to `http://localhost:3001`.

Optional: set `VITE_API_BASE_URL` when the API is on another origin.

## Deploy with Cloudflare Access

See [cloudflare/README.md](./cloudflare/README.md).

## What the screen does

- Loads the latest page on open. Refresh retries that read.
- Sorts by recent signature time or by name. Each change starts again at the first page.
- Filters with `start` / `end` when those dates are set.
- Pages 50 rows at a time.
- Searches the loaded page by name, email, or phone. The API has no search query.
- Expands one record: contact, emergency contact, acknowledgements, and a note that this app cannot open the PDF.
- Keeps medical answers behind “Medical answers (sensitive)”.
