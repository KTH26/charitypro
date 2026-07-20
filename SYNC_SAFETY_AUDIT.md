# CharityPro Synchronization Safety Audit

## Preservation rule

No record, file, table, route, migration, or historical synchronization component is removed merely because it appears old or duplicated. Removal requires a proven replacement, a verified backup, reference checks, multi-user tests, and a rollback path.

## Current sources of state

- Zustand application state persisted in IndexedDB under `charity-store`
- Legacy fallback state in `localStorage`
- Hardened synchronization recovery state in IndexedDB
- Cloudflare D1 `sync_records` current-record store
- Cloudflare D1 `sync_changes` change ledger
- Cloudflare D1 audit and processed-mutation records
- Device-local bank feeds, matching state, cached Sola data, and settings
- Historical local server, event stream, snapshot sync, migration scripts, and repair utilities

These sources must not be merged or discarded automatically during cleanup.

## Business relationships that must remain intact

- Donor -> transactions, pledges, recurring payments, tasks, sponsorship days
- Transaction -> donor, pledge, fundraiser, project, source account, offset account, bank transaction, Sola batch
- Bill -> vendor, employee, project, category, source account, offset account, credit account, bank transaction
- Payroll -> employee or fundraiser and generated payroll bills
- Account transfer -> source account, destination account, bank transaction
- Bank reconciliation -> feed item, transaction, bill, transfer, batch deposit
- Calculated balances -> transactions, pledges, recurring schedules, bills, transfers, starting balances, currency conversion

## Confirmed high-risk behavior

1. Synchronization previously invoked donor deduplication before every push. Deduplication can remove a donor by display ID without remapping every linked record. Automatic invocation has been removed; the explicit tool remains.
2. The prior backup exported only a subset of application data. It now exports every registered persisted field in a versioned envelope.
3. The hardened client infers deletion when a server-baseline record is absent locally. A missing record is not sufficient proof of user intent and must be replaced with explicit deletion intents.
4. The client advances its local server baseline before the server accepts queued operations. Recovery behavior must be separated into confirmed-server state and pending-local state.
5. Non-conflict operation failures can be removed from the pending mutation queue. Invalid, forbidden, and integrity failures must remain visible and recoverable.
6. Startup maintenance can change duplicate IDs and alter bill account links. These migrations require versioning, reference-safe remapping, and validation rather than running as general cleanup on every startup.
7. Several destructive or migration controls remain visible in Settings. They must require a fresh backup and stronger confirmation before production use.
8. Debug repair endpoints can rewrite synchronization history. They require removal from the production route surface or a separate, tightly controlled administrative mechanism after their historical purpose is confirmed.
9. Authentication currently auto-provisions users and effectively adds the administrator role. Access and data permissions require a separate security review.
10. Existing synchronization tests describe older queue keys and response shapes and do not currently prove the active engine's behavior.

## Required gates before synchronization cleanup

1. Produce local backups from both users and a D1 export.
2. Record counts and stable hashes per collection for all three sources.
3. Preserve conflicting versions instead of choosing a winner automatically.
4. Replace inferred deletion with explicit, auditable deletion commands.
5. Keep pending operations until the server confirms each operation.
6. Verify create, update, simultaneous update, offline retry, reconnect, explicit delete, restore, and failed authorization using two independent clients.
7. Compare donor totals, pledge balances, account balances, fundraiser balances, and payroll balances before and after migration.
8. Deploy to staging first and retain a tested rollback procedure.
