# Waiver viewer

Phone-first waiver review for operators. One surface: a list, then one expanded record.

The app opens on a blocking unlock page. Enter the API base and a staff key. The key is checked with `GET /api/admin/auth/me`, kept in memory, and sent as `x-admin-key`. Lock or reload clears it. Roles that can unlock: `owner`, `finance`, `front_desk`.

## Data source

```text
GET /api/admin/reporting/views/waiver-documents
```

The API checks `x-admin-key`, then reads `view_waiver_documents`. Object paths in that view are not signed URLs. Signed PDFs open from dashboard People.

## Run locally

```bash
# from repo root, with the API running in the signup repo
npm run dev:api
npm run dev:waiver-viewer
```

Open the Vite URL:

```text
http://localhost:5177
```

The unlock page prefills `VITE_API_BASE_URL`, or `http://localhost:3001` when that variable is unset. Vite still proxies `/api` to `http://localhost:3001` if the API base is this dev origin.

## Deploy

Build with `npm run build:waiver-viewer` and set `VITE_API_BASE_URL` to the API origin so the unlock page prefills it. Operators enter the staff key in the browser. It is not a build variable. Cloudflare Access is not required for this app.

## What the screen does

- Loads the latest page on open. Refresh retries that read.
- Sorts by recent signature time or by name. Each change starts again at the first page.
- Filters with `start` / `end` when those dates are set.
- Pages 50 rows at a time.
- Searches the loaded page by name, email, or phone. The API has no search query.
- Expands one record: contact, emergency contact, acknowledgements, and a note that this app cannot open the PDF.
- Keeps medical answers behind “Medical answers (sensitive)”.
