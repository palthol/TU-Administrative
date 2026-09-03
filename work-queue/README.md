# Admin work queue

`queue.json` is the machine-readable index. This document defines scope and acceptance
criteria. This repository never owns production database migrations or backend routes.

## Claim protocol

1. Confirm every dependency is `done`.
2. Atomically create `claims/<TASK-ID>.md` from `claims/TEMPLATE.md`; an existing file
   means another agent owns the task.
3. A coordinator alone updates shared queue status/owner fields.
4. Own only declared paths; tasks with overlapping files run serially.
5. Record commands/results in the claim without secrets or personal data.

## Queue

| ID | Lane | Status | Depends on | Summary |
| --- | --- | --- | --- | --- |
| ADM-DOC-001 | docs | done | — | Establish and reconcile admin documentation infrastructure |
| ADM-ARCH-001 | architecture | ready | ADM-DOC-001 | Decide and resolve duplicate dashboard implementations |
| ADM-TEST-001 | tests | ready | ADM-DOC-001 | Add dashboard test harness and smoke tests |
| ADM-TEST-002 | tests | ready | ADM-DOC-001 | Add waiver-viewer test harness and smoke tests |
| ADM-SEC-001 | security | ready | ADM-DOC-001 | Triage dependency findings and safe upgrades |
| ADM-OPS-001 | deployment | ready | ADM-DOC-001 | Inventory dashboard, receipts, viewer hosting and Access configuration |
| ADM-VAL-001 | validation | blocked | ADM-TEST-001, ADM-TEST-002, ADM-OPS-001 | Verify deployed read/auth/error paths without production writes |
| ADM-UI-001 | frontend | blocked | ADM-ARCH-001, ADM-VAL-001 | Build consolidated Today workflow |
| ADM-UI-002 | frontend | blocked | ADM-ARCH-001, ADM-VAL-001 | Replace raw UUID finance inputs with guided selection |
| ADM-WAIVER-001 | frontend | blocked | ADM-TEST-002, ADM-VAL-001 | Add safe waiver document download affordance |
| ADM-AUTH-001 | security | blocked | ADM-ARCH-001, ADM-OPS-001 | Integrate individual staff auth/RBAC API contract |
| ADM-PAY-001 | integrations | blocked | ADM-AUTH-001 | Add payment-link/provider UI after API contract exists |
| ADM-MSG-001 | integrations | blocked | ADM-AUTH-001 | Add email/SMS delivery UI after API contract exists |

Safe initial parallel batch: `ADM-ARCH-001`, `ADM-TEST-001`, `ADM-TEST-002`,
`ADM-SEC-001`, and `ADM-OPS-001`, provided claims list non-overlapping files.

## Acceptance summaries

- **ADM-ARCH-001:** record the decision; exactly one dashboard is reachable/maintained;
  remove or integrate dead pages; justify any direct Supabase access.
- **ADM-TEST-001/002:** exercise render, loading, success, empty, unauthorized, and API
  error states using mocked network boundaries.
- **ADM-OPS-001:** record real hosts/platforms/owners, health checks, non-secret env names,
  CORS assumptions, and Cloudflare Access behavior.
- **ADM-VAL-001:** deployed smoke evidence is read-only; no production fixture creation.
