# Admin reviewer guide

Review against the work-queue ID, acceptance criteria, and repository `AGENTS.md`.

## Blocking findings

- **P0:** service-role/admin secret committed or bundled; authorization bypass; exposure
  of sensitive waiver/medical data; financially destructive request sent incorrectly.
- **P1:** API contract mismatch; UI reports success before server confirmation; destructive
  action lacks appropriate confirmation; missing loading/error/unauthorized states; active
  workflow changes without focused tests and docs.
- **P2:** accessibility regression, stale configuration instructions, dead code added, or
  direct Supabase business writes without explicit architectural approval.

## Required checks

- No privileged secret appears in `VITE_*` values or frontend source.
- Request paths, methods, fields, and response/error handling match frontend API docs.
- Money converts to integer cents exactly once.
- Forms prevent duplicate submissions and preserve actionable errors.
- Links to waiver artifacts are time-limited/signed and sensitive fields are not logged.
- Keyboard navigation, labels, focus, and readable status messages remain intact.
- Relevant app build/tests pass and new behavior has meaningful coverage.
- `current-state.md`, frontend design docs, and queue evidence are updated.

A successful build does not prove an API-backed workflow works. State any unverified
backend, deployment, or production assumption in the review.
