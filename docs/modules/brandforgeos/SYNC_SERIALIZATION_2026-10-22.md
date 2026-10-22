# BrandForge sync execution serialization - October 22, 2026

An overlapping retry could enter the awaited sync adapter twice for one persisted
business run. The unchanged frozen runtime reproduced two adapter entries with
the same `syncId`; 17 existing model cases passed and the two new regression
cases failed. This change prevents simultaneous adapter entry while preserving
the run's original external-effect idempotency identity and current authority
checks. No live adapter, destination, credential or new schema is introduced.

## Execution and retry boundaries

`executeBrandForgeSync` first validates the trusted `DATABASE_POOL_MAX` setting
(default ten) and requires actual configured pool capacity of at least three. The
captured database pool and the setting must describe the same runtime; the
production registration uses the existing singleton database and process
configuration. No pool default or host configuration was changed.

A non-waiting local admission guard allows at most one active fenced execution
per actual database object in a process. The production database is a singleton.
Same-run and different-run contenders receive `BRANDFORGE_SYNC_IN_PROGRESS`
before borrowing a database client or changing a business row. A pool configured
below three receives `BRANDFORGE_SYNC_DATABASE_CAPACITY_UNAVAILABLE` before any
business mutation. Both errors remain retryable through the existing job policy;
they do not poison the active business run or create another effect identity.
This deliberately limits BrandForge execution throughput to one per process.

The admitted execution acquires a PostgreSQL transaction advisory lock bound to
the tenant and persisted shared-job identity. A different process that already
owns that fence excludes adapter entry; contenders do not wait on the lock.
The fence-only transaction remains open while the adapter awaits. Initial and
final authorization/row mutations use separate, short transactions, allowing
connection revocation, feature withdrawal and cancellation to commit during the
await. Current membership, tenant, module, feature and connection checks remain.

Completion and replay retain the original `syncId` idempotency key. PostgreSQL
releases the advisory lock when its transaction/connection ends; an abandoned
`processing` row can then retry with that same identity. Completed replay skips
the adapter. No generic worker, lease, database schema, dispatch or provider
configuration was changed.

## Verification actually completed

The focused canonical test command is:

```powershell
node --import tsx --test --test-concurrency=1 test/brandforgeos-sync.test.ts test/brandforgeos-connector-policy.test.ts test/brandforge-snapproof-product-value-static.test.ts
```

It ran from `apps/api` with existing installed dependencies, a sterile test
environment and external sockets blocked: **37/37 pass**, zero failures/skips.
The sync-only model suite passes **19/19**. These SQL models do not establish
PostgreSQL locking or provider acceptance.

Separate actual PostgreSQL **16.14**, pg **8.23.0**, Drizzle **0.45.2** and Node
**24.16.0** source execution passed **14/14** cases at `DATABASE_POOL_MAX=3`.
It used actual canonical access and entitlement resolvers, with only the awaited
adapter synthetic and non-delivering. Cases cover same/different local
contenders, an actual separate Node process denied by the database fence,
abandoned processing retry after fence release, stable effect identity,
completed replay, concurrent allocation/rollback, foreign tenant/requester
denial, current-authority revocation and revoke/cancel/feature loss during await.
Actual one-connection and two-connection pools each passed their capacity-only
case: no adapter entry or business state change, followed by the same persisted
run completing in a separate actual three-client process without changing its
idempotency identity. Cleanup succeeded.

The task target was only `127.0.0.1:55514/operatoros_brandforge_serialization_test`
in a new cached PostgreSQL container, tmpfs data, no host mounts/image downloads.
The full source release was applied only to that empty disposable fixture.
All owned rows and test trigger/function objects were removed, the canonical
module row stayed unchanged and all application pools closed. Final container
removal is recorded in the external candidate evidence before handoff.

Exact commands, source bindings, red/green results and cleanup receipts are in
`evidence/resume-oct22/brandforge-serialization/` in the release workspace.
API source types, strict changed-test types and scoped zero-warning lint are
recorded there. Existing cache reuse is not a canonical frozen installation.

## Remaining gates and rollback

This does not prove an arbitrary external action happens exactly once. A future
live adapter still needs a bounded timeout, provider-supported idempotency bound
to this stable operation, uncertain-outcome reconciliation, lease/authority and
approved destination/secret handling. A disconnected fence holder may still be
awaiting an external provider; the database cannot retract that provider's action.
No automatic resend may be inferred from a released lock.

All executors must run the compatible source before enabling a future adapter;
an older process does not participate in the new advisory fence. Drain existing
executions for a mixed-version change. Rollback is a scoped source revert while
live connectors remain unavailable; no database downgrade or automatic replay is
needed. The owner-selected provider/event/receiver, live delivery, HTTP/session,
production release and final combined CI gates remain open.

The published Lunch Break deployment, original component branches, existing
commercial terms and held SSO test were preserved. No publication, merge,
deployment, production database operation or real provider call occurred.
