# Invoice events and account-response ownership integration

## Reviewed account-response and diagnostic follow-up (2026-10-19)

The source candidate now also includes the independently approved Auth/Tenant
component `0f2b845f845de5d150e9c72519422ee0cf1d3692` and diagnostic fixture
component `3458e5e284151420ec59fd7ec3e8f239fd18221c`. Their eight committed
blobs are preserved alongside the original nine invoice/number component blobs;
four root status/review documents describe the final 21-path scope.

A held authentication read can replace a newly signed-in account through the
actual Invite screen. Client transitions and reads now own their completion,
and tenant work is bound to the synchronous accepted identity lifetime, even
for a fresh login with the same user ID. Prior memberships are masked while
identity changes; normal successful tenant-switch reload and failed global
logout behavior remain intact. Server sessions, cookies and tenant/module
authorization are unchanged. Owner and independent suites each passed 44 actual
provider/UI browser cases; an independent 390px Invite control also passed.
The same durable Invite regression fails on the unchanged base, with 3 controls
passing. This is client state/header ownership, not a server authorization bypass.

Original PR132 head `acbeb7ddcef90f7587046aad244fa8c6522cd14f` had terminal
release run 39323364782 FAILURE: 13/14 scopes passed, API 1937/1938. Its one failure
was a real-route VM diagnostic fixture missing the actual observation-helper
binding: ReferenceError returned 503 before the intended database diagnostic 400.
The test-only correction compiles the actual helper declaration into that VM;
all original assertions remain. Owner and independent 49-case focused suites,
strict changed-test typing and lint pass. The old failed run remains failed.
Its two new disposable-SQL observation cases, unit 52, integration 108,
browser 65 first attempts, visual 4 and vector 32 passed; they do not waive failure.

Fresh combined local execution passes 232 selected native cases (228 prior
selected cases plus four diagnostic tests), zero failed/skipped. Root lint
passes with zero warnings and all four workspace typechecks pass. The changed
component blobs match their independently tested/reviewed commits. Existing
task dependency junctions and cached Chromium were reused; no acquisition.

Fresh combined exact-head full release/vector CI remains required before source
merge. Paid Stack asynchronous failure and its shared transaction-generation
fence are separate work, not part of this candidate. Pricing/catalog, schema67,
dependencies, provider configuration, module parity and launch states remain
unchanged. No real account, DB, provider, recipient, payment, replay or deployment
action occurred. Controlled deployed tenant/provider/recovery/support acceptance
remains separate. [Client evidence](AUTH_TENANT_ASYNC_OWNERSHIP.md)
and [fixture evidence](WEBHOOK_DIAGNOSTIC_FIXTURE_BINDING.md).

## Original invoice-only composition and retained evidence

Base: main `7c077cce8ba6c6471014ffe264b85ab95ddd3735`, tree
`4a9e4fb6f4770522c8c78d80d1ab490f0dee2a42`. Components are independently
reviewed commits `6ec8289b04ff39f028d2646a2d0b117c82362bfd` (managed-number)
and `41cc22f926d98b069542c4c9fd0173c9a563dd79` (invoice observation).
Their nine owned source/test/review blobs are preserved by the integration;
three status documents and this receipt record the combined scope.

## Behavior and boundaries

`billingObservationResult` recognizes only `invoice.created`. Live dispatch
uses it after raw-body signature verification, Torque exclusion and immutable
event claim. Saved-receipt retry uses it after the existing processed guard and
lease acquisition. The receipt is marked processed before success. There is no
invoice edit, entitlement/quantity/credit settlement or tenant propagation.
Other five unsupported selected plain financial families and actual paid/failed
handler errors retain receipt failure/retry. Signature/configuration rejection,
payload mismatch, duplicate and in-flight lease behavior remain unchanged.
The generic dispatch matrix changes from 9 acknowledged / 6 retryable shapes to
10 acknowledged / 5 retryable shapes in synthetic tests; this is not a delivery or
provider-configuration receipt. [Observation design and tests](VERIFIED_INVOICE_CREATION_OBSERVATION.md).

Managed-number invoice extraction passes once through the existing shared
normalizer, supporting string/expanded modern references while rejecting
conflicting valid IDs without a later fallback. Historical direct-details and
undiscriminated-parent inputs remain explicitly compatible. Subscription and
checkout extraction are unchanged, as are local binding, provider-current-paid
invoice, tenant/customer/feature, event order, pending-upgrade, quantity and
grace/channel rules. Lane metadata inputs are not broadened: its weaker
settlement branch needs separately proved authority repair before modern
parent metadata support. [Compatibility design and tests](CALLCOMMAND_NUMBER_INVOICE_COMPATIBILITY.md).

## Actual review and checks

Independent observation review repeated 166 selected cases (45 new + 121 prior),
API/strict types and diff checks at the six frozen committed blobs. Independent
managed-number review read all three paths and surrounding guards and repeated
183 selected cases (62 new + the same 121 prior). The immutable observation baseline
passes 20 / fails 7 of the original 27; those failures include six positive
observations and one persistence-error path, not seven independent defects.
The managed-number baseline passes 32 / fails 30 of the final 62; later provider
controls depend on expanded-reference extraction, so these are not 30 defects.

Fresh combined native execution passes **228 tests, zero failed/skipped**:
107 new cases plus 121 prior, without adding overlapping component counts. Root
lint passes with zero warnings and all four selected workspace typechecks
pass. Existing task-local dependencies are reused through eight junctions;
no package acquisition, credential or environment-contract change occurred.
API/SDK compilation also passes; its exact output is retained in the task receipt.

```powershell
node --import tsx --test --test-reporter=tap apps/api/test/billing-invoice-subscription.test.ts apps/api/test/billing-webhook-binding.test.ts apps/api/test/callcommand-number-invoice-subscription.test.ts apps/api/test/billing-invoice-observation.test.ts apps/api/test/billing-invoice-observation-retry.test.ts
pnpm lint
pnpm typecheck
pnpm --dir apps/api build
```

Two new real SDK/Fastify/disposable-SQL cases test observation persistence,
duplicate processing and recovery of a failed saved observation. They were
**not run locally** because no confirmed disposable PostgreSQL fixture exists.
The complete combined exact-head hosted release gate, including those cases,
existing guided-setup number SQL tests, production build, browser/accessibility
and vector checks, remains required before source merge.

Native tests use actual selected source declarations, real Fastify/HMAC and
Drizzle rendering as documented, with synthetic receipt/SQL/provider execution.
They do not establish actual SQL transaction behavior or real provider/account
and deployed purchase acceptance. Independent final integration review and
exact tested-tree proof are recorded with the task's PR/CI receipts.

## Existing release and remaining gates

PR131 merged source-only after terminal 14-scope release and vector 32 SUCCESS.
Its 64 browser passes plus one flaky recovered by the existing automatic retry
are disclosed; the first-attempt React418 occurs before user/history mutations.
Examined pricing/init/config/test blobs match its baseline, fast/slowed SSR and
original tests pass, and the cause remains unproven. No pre-existing or introduced
defect is asserted, no assertion waiver/retry-policy change occurred, and no
faithful captured replay was claimed when CI omitted JavaScript response bodies.

The original invoice-only component changes no UI/pricing/launch policy, database schema, dependency,
workflow, imported module source, signing configuration or provider destination.
Source merge is separate from controlled deployment, protected target/current
backup and isolated recovery evidence, authenticated two-tenant workflow,
provider lifecycle, policy/support/alert and rollback acceptance. No migration,
provider activation, payment, event replay, customer creation, number purchase/
release, recipient contact or production publication was performed.
