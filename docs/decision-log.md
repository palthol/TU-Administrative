# Admin decision log

Entries are append-only. Supersede an earlier decision by referencing its ID.

| ID | Date | Decision | Status |
| --- | --- | --- | --- |
| ADM-ADR-001 | 2026-09-03 | This repository owns internal operator frontends and contains no backend. | accepted |
| ADM-ADR-002 | 2026-09-03 | No service-role key may be exposed to browser code. | accepted |
| ADM-ADR-003 | 2026-09-03 | Capability status uses verified, implemented, unwired, and missing. | accepted |
| ADM-ADR-004 | 2026-09-03 | Parallel work uses stable task IDs and exclusive claim files. | accepted |

## Open decisions

- Which of the two dashboard implementations becomes canonical.
- Interim shared-key versus immediate Supabase Auth/RBAC migration.
- Hosting and Cloudflare Access ownership for each application.
- Whether receipts remains separate or becomes a dashboard module.
