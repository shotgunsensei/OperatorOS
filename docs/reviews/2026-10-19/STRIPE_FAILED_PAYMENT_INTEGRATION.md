# Selected failed-payment and invoice transaction source integration

The final selected scope is eighteen paths: ten from independently approved PI
component `b05db31befebc83e9e09666d2b3d4467a5ca76cf`, four from approved
invoice component `884acffaba7e3a3b80aa9101897b2aab4e519354`, and these four
shared checkpoint documents. All fourteen component Git blobs and raw frozen
SHA256s remain exact. Original component worktrees/branches are preserved.

## History and verified baseline

The PI component's direct base was original PR133 head 7a. Local normal merge
`2e4f06caa0dc7dc24386e8776181f71b7f327372` joined immutable b05 with corrected
PR133 head `1eb0115b68c8ad99d66231db68f33148d459316d`. The four provisional
checkpoint documents were committed as c0fb6e76 after 450 local cases, strict
typing, lint, full build and parent 13 SQL passes; Office approved the exact
fourteen-path tree. These original receipts remain preserved.

After PR133 completed its release gates and merged, `origin/main` was guarded
against exact `e31805c10c2b394f437a03ae11fdaa4a74a9a933`, fetched, and normally
merged as `be1fadb6d70609bb2ba5e1bc6a0ebd257859011f`, parents c0fb6e76 and
e31805c1. The tree stayed exactly 5250c50d. The selected invoice component was
then guarded against its exact tree 77110ff4 and parent 1eb and cherry-picked as
`e1f2fada3c4ae25970c4f10427022ef0abdcfc49`, tree
`19ab66cdf92915b13dda95e334c4fad771a661e0`, direct parent be1fadb6.
All fourteen component identities were verified before combined checks. Only
the four shared documents change after that tested runtime checkpoint.

PR133's source-only merge has tree
`eab88cc20626467ba0be604cf96523aaa35a1e6b`, parents b9e5e155 and 1eb0115b,
equal to both reviewed and actual tested trees. Corrected full release
run 39337281819 passed all 14 scopes: 52 unit, 2065/2065 API with 0 skips,
108 integration, 109 browser first attempts/no observed retry, 4 visual and the
ten new SQL cases. Vector run 39337281781 passed 32. Actual checkout was
`e769fb407b6d6d43aca3d4aef933aedf174e5448`, build
`0ad0042a3d68e1902801078e`. Parent terminal/postmerge receipts bind those
results; none establishes production publication or this additional candidate's
complete hosted acceptance.

Original PR133 run 39332436621 remains failed 13/14, API 2047/2056. Its nine
new SQL HTTP failures selected the deterministic adapter in test/test mode
while signing SDK HMAC. Exactly one of the original ten
cases passed and nine failed; the independently reviewed test-only fixture
correction then passed all ten. It selects configured HMAC only after captured
disposable-target validation and blocked egress; original SQL bodies/assertions
remain. The original browser phase recorded108 first-attempt passes and one
automatic-retry success. Retained trace evidence strongly supports speculative
console-chunk cancellation while the crawler replaces an intentionally
unavailable OutCall card with PulseDesk; exact abort-event time/retry trace and
baseline runtime reproduction are absent. No assertions/retries were changed.

## Two bounded demonstrated problems

**Already-bound Stack failed PI.** The actual generic dispatcher selected
`payment_intent.payment_failed` but had no handler, so an already-bound canonical
Stack failure could remain unhandled/retryable. The actual unchanged7a baseline
passed its invoice-failure control and failed the desired bound-PI reconciliation
case. The resolver follows exact central PI -> complete bounded InvoicePayment
pages -> one distinct invoice -> current authoritative subscription. It retains
mode, scope, customer, tenant, Stack, generation, catalog/items and shared locked
mutation authority. No PI/invoice status, amount, optional metadata or
latest-invoice hint becomes financial or entitlement authority. Initial/unbound,
legacy/feature, Connect/context/customer-account and ambiguous/incomplete graphs
remain retryable. The private validated propagation subject prevents pi_ID and
metadata/customer hints from becoming tenant authority, including saved retry.
Torque stays first; raw HMAC, immutable receipts, lease/duplicate/retry and
financial/grace contracts remain. Each new read has a cleared completion timer
of at most 3 seconds, clamped to the remaining 10-second resolver budget. Late
SDK results cannot resume the graph; underlying reads are not canceled and no
end-to-end webhook deadline or zero actual SDK edge retries is claimed.

**Invoice status/activity partial commit.** An authorized invoice transition
updated its tenant/version/status/deleted-at conditional row outside the later
activity insert. An activity failure returned 500 while status/timestamp/version
remained changed; an identical retry returned 409. Actual-source native baseline
had 7 controls pass and one desired rollback failure. Parent ran the same frozen
SQL test against unchanged 1eb: 3 existing cases passed and the new rollback case
failed because the changed invoice persisted. The fix uses one existing
`db.transaction` executor for conditional update and scoped activity insertion;
empty updates add no activity, and an insertion failure rolls back before the
same request is retried. Quote/linked-job rollback, validation 400, foreign 404,
allowed status choices, stale/CAS 409, response shape and role/tenant guards
remain. Native fixtures explicitly model transaction state and synthetic
pre-authorized context; they do not independently prove authentication or real
PostgreSQL MVCC. Independent review verifies the runtime AST outside this one
handler and the three prior SQL bodies are unchanged. Parent's component SQL
candidate passed 4/4 on isolated PostgreSQL. No invoice is delivered and no
customer/platform payment occurs through this repair.

These modules keep separate platform subscription and business-invoice
authority. Neither repair creates a schema, financial/grace policy, provider
setting, credential, historical repair, module availability or new grant. No
real-account failure or live customer occurrence is established.

## Fresh combined checks and attribution

On exact cherry checkpoint e1f2fada/19ab66cd, this worker ran one native command:
**458/458 pass**, 0 failed/skipped/cancelled/todo, 46958.0039ms. That is the prior
450 selected cases (340 existing +78 PI +9 adapter +23 static) plus 8 actual
invoice-transition cases. Root lint exits 0 with zero warnings. Strict checking
of eleven affected test/helper files exits 0, including both invoice tests and
the Stack/PI SQL fixtures; existing Fastify WebSocket ambient types and allowJs
for database.mjs are included, without relaxing TypeScript strict.

Full `pnpm build:production` exits 0, including all four workspace typechecks,
API/runner compilation and Next's 38 static pages. DATABASE_URL is absent,
INTERNAL_API_URL is pinned to unused task loopback `http://127.0.0.1:56109`,
and Next telemetry is disabled. This worker started no server or database.

Root separately executed **17/17 combined SQL cases**, 0 failed/skipped/cancelled,
41405.9587ms, against exact e1f2fada/19ab66cd. The 23:18:16.995Z run receipt
binds ten Stack generation/terminal cases, three PI delivery/retry/tenant cases
and four document mutation cases. It uses only captured disposable loopback
PostgreSQL16, a sterile child and blocked nonselected network, with zero
acquisitions/production actions. This worker did not run SQL. Component PI 418,
independent 78, later parent SQL 3 and prior integration 450/parent SQL 13 remain
separate historical checks. The immutable PI component document's NOT_RUN
statement records its original freeze; later real synthetic SQL results are
recorded here instead of rewriting its reviewed blob.

## Exact local commands and evidence

Existing Node 24.16.0, pinned pnpm 10.34.5 and eight dependency junctions only;
no packages were downloaded or installed. NODE_ENV=test, APP_ENV=test and
DATABASE_URL absent for native execution. The single command is:

```text
node --import tsx --test --test-reporter=tap --test-concurrency=1
  apps/api/test/stack-async-payment-failed.test.ts
  apps/api/test/stack-mutation-fence.test.ts
  apps/api/test/stack-terminal-eligibility.test.ts
  apps/api/test/billing-invoice-observation.test.ts
  apps/api/test/billing-invoice-observation-retry.test.ts
  apps/api/test/billing-invoice-subscription.test.ts
  apps/api/test/billing-webhook-binding.test.ts
  apps/api/test/stripe-webhook-diagnostics.test.ts
  apps/api/test/callcommand-number-invoice-subscription.test.ts
  apps/api/test/stripe-failed-payment-correlation.test.ts
  apps/api/test/stripe-failed-payment-dispatch.test.ts
  apps/api/test/stripe-failed-payment-delivery.test.ts
  apps/api/test/stack-webhook-adapter.test.ts
  apps/api/test/application-stack-companion-tier-static.test.ts
  apps/api/test/commerce-forward-model-static.test.ts
  apps/api/test/forward-commerce-contract-static.test.ts
  apps/api/test/product-entitlement-contract.test.ts
  apps/api/test/tradeflowkit-transition-atomicity.test.ts
pnpm lint
pnpm build:production
```

The strict command uses node node_modules/typescript/bin/tsc with noEmit,
strict, target ES2022, module/moduleResolution NodeNext, esModuleInterop,
skipLibCheck, resolveJsonModule, allowJs and types node,@fastify/websocket.
All eleven exact paths and arguments are in the final local freeze. Commands,
exits, all 18 component/document hash maps, merge/cherry parents/trees and logs
are retained in task
`evidence/OperatorOS/next-pass/payment-intent-integration/final18/`.
Parent SQL 17 is `launch-oct23/final18-integration-sql17.log` and its receipt;
component invoice baseline/candidate SQL and PI earlier SQL retain their own
logs. PR133 terminal/postmerge proofs are `launch-oct23/pr133-revised-terminal-ci-receipt.json`
and `pr133-postmerge-receipt.json`. No scripts from downloaded artifacts were
executed; retained browser analysis is evidence-only.

## Remaining gate and rollback

Final immutable18-path integration review and fresh complete combined-head
hosted release/vector CI, including actual tested/prospective merge-tree
equality, are required before source merge. The previous components'/PR133's
gates cannot substitute for that combined run. Actual provider account/mode/API
permissions and real signed PI/invoice graphs, controlled deployed protected
tenant/payment persistence, production DB identity, current backup/restore,
monitoring/support, rollback acceptance and publication remain separate gates.
No parity state or module launch availability is promoted. The selected payment
destination remains disabled.

Rollback uses the ordinary reviewed source release/revert path. There is no new
migration or provider mutation to undo. A PI revert restores generic failed-PI
retry; preserve immutable receipts. The invoice repair neither repairs prior
missing activity nor claims every unacknowledged DB commit is retryable. No
production read/write, real customer/payment/provider request, replay, security/
billing setting, credential creation, push, PR or publication was performed by
this preparation worker. Parent owns subsequent source publication and gates.
