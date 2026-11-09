# TradeFlow revenue record retrieval repair

Date: 2026-11-09. Isolated branch: `codex/tradeflow-records-nov09`.
Base: `b79961f8e2bfe6d3ad277388d212de3c7d07f1d2`.
Worktree: `operatoros-tradeflow-records-nov09`, beside the unchanged dependency
candidate. This is local source evidence, not deployed or PostgreSQL acceptance.

## Verified defect and bounded repair

The legacy `/v1/modules/tradeflowkit/revenue` response returns the newest 100
active customers, jobs, quotes and invoices. `TradeFlowKitRevenueFlow.tsx`
previously searched only those arrays for deep links and creation/edit choices.
Valid older records disappeared; a recent-list default could replace a routed
customer; quote-to-invoice state also depended on the truncated invoice array.

The legacy route remains unchanged for other callers. The new read registrar
is added next to it in `apps/api/src/routes/module-shell-routes.ts`:

- `GET /v1/modules/tradeflowkit/revenue/:kind`: fixed-size searchable page,
  default 25, maximum 50, with a `nextCursor`. Kinds are customers, jobs,
  quotes and invoices. Customer filters apply only to the last three.
- `GET /v1/modules/tradeflowkit/revenue/:kind/:id`: exact active record,
  independently of list position. Missing, foreign and archived IDs have the
  same 404 response. Malformed IDs, queries and cursors have a generic 400.
- Both use the existing tenant-member and TradeFlow module-access guard chain.
  Tenant authority comes only from `request.tenantContext`, not input.
  Tenant-shared records are not incorrectly restricted to their creator.
  All responses, including authorization errors, use `Cache-Control: no-store`.
- Search strings are bounded to 160 characters, trimmed and validated.
  Wildcard characters are escaped and SQL values remain parameters. Unknown
  fields, duplicate query values and filter-mismatched cursors are rejected.
- Related customer/job labels and linked-invoice existence are fetched only
  for the bounded page or exact record, with tenant predicates and explicit
  limits. Related customers expose only id/name/deletedAt; related jobs expose
  only id/customerId/title/deletedAt, enforced in SQL and response mapping. Archived
  labels remain readable as history without exposing notes, addresses, token
  hashes or internal job fields, and do not become active choices. Active linked
  invoices are detected independently of their age. No bulk history download or
  enlarged legacy cap is introduced.

The web client uses exact reads for customer/quote/invoice deep links and
25-record search/previous/next controls for its lists and customer/job pickers.
An off-page selected record is pinned individually, never silently replaced by
the first recent row. A routed customer is seeded once; later deliberate
choices survive reloads. Selecting another customer clears its linked job.
Counts explicitly describe records on the current page, not company totals;
the unused jobs snapshot count/request is removed. Lookup loading, failure,
retry and unavailable states are accessible; known unavailable choices cannot
be saved, and archived relationship names remain
visible in disabled selected options until deliberately replaced or removed.

Record, view, tenant and account changes reset the workspace. Abort signals,
current-identity checks and request generations suppress obsolete reads.
Batch invoice selections clear when pages change. Existing write endpoints,
expected versions, permission controls, user confirmations and payment amounts
are retained. Late payment/provider-link responses cannot redirect after the
originating account/workspace has changed. The WorkManagement recurring-customer
selector now uses the same bounded searchable picker and active-record validation,
without changing recurring payloads, defaults, date conversion or schedule
controls. Tests of these links use synthetic responses only; no provider or
payment service was contacted.

## Pagination and timestamp proof

`apps/api/src/lib/tradeflowkit-revenue-reads.ts` sorts by immutable
`created_at DESC, id DESC` and uses the matching tuple comparison. It fetches
only `limit + 1` records. Pages replace prior pages; the client does not append
unbounded result arrays. Cursors bind kind, search and customer filter.
Tenant switching discards client cursor state, while every server query still
enforces the current trusted tenant. This is live keyset pagination, not a
snapshot: concurrent new/deleted records can change later refreshed pages.

All four schema columns are `timestamp('created_at').defaultNow().notNull()`:
`apps/api/src/schema.ts` lines 2651, 2733, 2847 and 2919. Their concrete DDL is
`created_at TIMESTAMP DEFAULT NOW() NOT NULL` in
`apps/api/src/lib/saas-db-init.ts` lines 1601, 1616, 1638 and 1659. These are
PostgreSQL timestamps **without time zone**, not timestamptz. Thus the cursor
selects `to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US')` directly and passes
its six fractional digits back as `::timestamp`. The ID tie-breaker and exact
microseconds are preserved even for a bulk insert sharing one timestamp.

Raw Drizzle `execute` bypasses selected-column decoding. The repository
explicitly applies each column's `mapFromDriverValue` to normal record fields
and hydrated references, preserving the legacy UTC ISO date contract, nulls
and JSON values. The separate cursor timestamp never makes a JavaScript Date
round trip. No database schema, migration or index definition changed.

## Executed verification

Environment: Windows/PowerShell on Xodus-John, Node 24.16.0. Existing canonical
dependencies at sibling `operatoros-dependency-nov09` were resolved through
explicit task-local harness paths. No package install, acquisition, dependency
link or frozen-install proof was performed in this worktree. Test credentials
were synthetic or absent. Node network/listening sockets were blocked. The
Chromium fixture intercepted every browser request; no API server, database,
Docker, provider or production service ran.

Actual commands from this worktree (harnesses and logs remain in ignored
`build/tradeflow-check`; API preparation is in `build/tradeflow-api-check`):

```powershell
node --require ./build/tradeflow-check/offline.cjs build/tradeflow-check/regressions.mjs
node --require ./build/tradeflow-check/offline.cjs build/tradeflow-check/types.mjs api
node --require ./build/tradeflow-check/offline.cjs build/tradeflow-check/types.mjs web
node --require ./build/tradeflow-check/offline.cjs build/tradeflow-check/lint.mjs
node --require ./build/tradeflow-check/offline.cjs build/tradeflow-check/browser-build.mjs
node build/tradeflow-check/browser-run.mjs
git diff --check
```

- **57/57 DB-free regressions**, zero failed/skipped, across 17 TradeFlow test
  files. Includes seven new validation, parameterized-SQL, real Fastify-handler
  with injected guards/repository, 125-record pagination, raw-driver date and
  private-field serialization tests. Existing transition atomicity, versions, imports, retention, viewer,
  bulk-control and source contracts also pass. These are not real-DB/auth proofs.
- **34/34 Chromium component tests**, zero failed/skipped/retries. Actual React
  components and HTTP client, synthetic AuthProvider and intercepted API.
  Covers three older deep-link kinds, pending exact lookup, searchable and
  paged selectors beyond 100, editor/version preservation, load errors/retry,
  missing records, stale searches, account/logout/tenant/view/record changes,
  archived labels and invalid choices, changed-customer/job reset, viewer
  downgrade, batch selection reset, and both late redirect paths. Eight recurring
  picker cases also cover older-customer search/paging, refresh retention, unchanged schedule payloads,
  pending/archived selections, retry, identity changes and read-only access.
- **API source plus changed API tests:** 367 roots, zero TypeScript diagnostics,
  including runner/SDK source and prepared PostgreSQL tests.
- **Web source plus changed browser tests:** 327 roots, zero diagnostics.
  Harness paths are normalized to forward slashes before TypeScript resolution.
- **Scoped ESLint:** eleven changed source/test files, zero errors or warnings,
  using the existing canonical ESLint/config. **Git whitespace check passed.**
- Independent reviews identified raw timestamp decoding, missing historical
  editor labels and excessive archived-reference fields; all were repaired and
  regression-tested, including negative private-field sentinels. Final source
  reread reported no remaining concrete blocker.

Logs: `regressions.log`, `api-types.log`, `web-types.log`, `lint.log`,
`browser.log`; generated browser fixture and artifacts are in the same ignored
harness directory. Earlier fixture bundling/type errors and incomplete loading
states were corrected before these final passing runs.

## Prepared, not executed; remaining scope

`apps/api/test/tradeflowkit-revenue-reads-postgres.test.ts` contains two
typechecked-only regressions: real PostgreSQL microsecond pagination/search/
history/isolation, and real cookie/auth/tenant/module middleware including
same-tenant viewer access, outsiders, foreign IDs and revoked grants.
No PostgreSQL connection or execution occurred. These tests require a separately
approved isolated disposable database through the repository's guarded fixture.

The repair covers `TradeFlowKitRevenueFlow`, its create/edit selectors, and the
`TradeFlowKitWorkManagement` recurring-customer selector. The legacy dashboard
summary remains a bounded recent collection. WorkManagement operations/workflow
job cards remain limited to the recent 100 jobs, team tasks to 100 and activity
to 50; these are not complete historical collections. Those adjacent surfaces
are not claimed fully paginated here. Production publication, full frozen-graph
installation/build, real PostgreSQL acceptance, large-tenant query-plan measurement and
authenticated deployed/provider workflows remain separate gates. No module
parity state or live readiness claim is promoted.
