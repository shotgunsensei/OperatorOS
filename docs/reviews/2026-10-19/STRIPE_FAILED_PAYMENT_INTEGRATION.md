# Bound Stack failed-payment integration checkpoint

This provisional local branch normally merges immutable independently reviewed
PI component `b05db31befebc83e9e09666d2b3d4467a5ca76cf` with corrected PR133
head `1eb0115b68c8ad99d66231db68f33148d459316d`. The merge commit is
`2e4f06caa0dc7dc24386e8776181f71b7f327372`, tree
`8121cacaf3607e506d72930732c5c15f30ae57ef`, with those exact two parents.
Original component worktrees/branches remain intact; no history was rewritten.
All ten component Git blobs and raw frozen SHA256s are unchanged. The checkout
restores the original frozen newline representation where Windows checkout had
converted it; this produces no Git content delta.

This is not approved main. Corrected PR133 full hosted CI is still pending at
this checkpoint. Root must normally merge the actual verified PR133 main commit
later, review any resulting delta, and run a fresh complete combined-head gate
before publication or source merge. Four checkpoint documents are the only new
authored paths beyond the ten PI component paths relative to corrected PR133.

## Scope and preserved authority

The component repairs the actual generic dispatcher's unhandled
`payment_intent.payment_failed` case only for an already-bound current canonical
Application Stack. The pure read-only resolver follows exact PI -> complete
bounded InvoicePayment allocation pages -> one distinct invoice -> current
Subscription. Central scope/mode/customer/tenant/Stack/generation validation and
the shared locked mutation fence remain mandatory. A new PI or invoice status,
amount, optional metadata or latest-invoice hint cannot establish payment or
entitlement authority. Ambiguous/incomplete, initial/unbound, legacy/feature,
Connect/context and customer-account cases retain failure/retry behavior.

Each new correlation read has its own completion timer (at most3 seconds,
clamped to the remaining10-second resolver budget), cleared in finally. Late
SDK outcomes are observed/discarded and cannot continue to DB/propagation; the
underlying read is not canceled. Existing Torque pre-classification and later
subscription/catalog requests keep their existing lifetime; this is not an
end-to-end webhook deadline or a claim of zero actual SDK edge retries.

Only a private validated subscription/tenant/nullable-actor subject reaches
post-processing, including saved receipt retry. No pi_ID or metadata/customer
fallback becomes tenant propagation authority. Torque stays first; raw HMAC,
immutable event receipt, lease/duplicate/retry and financial/grace policies stay
intact. There is no schema, dependency, provider configuration, credential,
historical data repair, module availability or new-grant change.

## Historical and new execution evidence

Component baseline actually exercised the unchanged7a dispatcher: one valid
invoice-failure control passed and the bound-PI desired reconciliation failed,
with zero skips. The durable Git-object replay retains that source gap.
Owner v2 passed418 selected native cases and strict changed-test checking,
zero-warning lint and full production build. Office independently passed78
focused cases, strict checking and exact ten-file identity review. Office
attested immutable commit/tree equality after commit. Root then actually ran
the component's three guarded SQL cases:3/3 pass, zero failures/skips,
6592.8753ms. The immutable component document's earlier NOT_RUN statement is
historical freeze evidence and is intentionally not rewritten.

On the new exact local merge2e4f06ca, this worker actually ran:

- **450/450 selected native tests**,0failed/skipped/cancelled/todo,
  28501.4433ms, in one17-file command. This is340 prior invoice/receipt/number/
  Stack cases +78 PI cases +9 corrected-adapter controls +23 static contracts.
  It is targeted coverage, not the complete API/release suite.
- Root `pnpm lint`: exit0, zero warnings.
- Strict NodeNext checking of nine affected test/helper files: exit0. Existing
  `database.mjs` is included with allowJs; TypeScript strict remains enabled.
- Full `pnpm build:production`: exit0, including all four workspace typechecks,
  API/runner compilation and Next's38 static pages. DATABASE_URL is absent;
  INTERNAL_API_URL is pinned to unused task loopback `http://127.0.0.1:56109`,
  and Next telemetry is disabled. No server/database was started by this worker.

Root separately ran both guarded SQL files against this exact2e4f06ca merge:
**13/13 pass**,0failed/skipped/cancelled,11931.1222ms. This includes the ten
Stack generation/terminal cases and three PI delivery/retry/tenant cases. The
22:50:09.203Z run receipt records a sterile child, validated pool-captured
`127.0.0.1:54796` disposable database, blocked nonselected networking, existing
cached PostgreSQL16, zero acquisitions and no production action. This worker
did not run SQL or infer its result from native mocks.

## Commands and receipts

Existing Node24.16.0, pinned pnpm10.34.5 and eight dependency junctions were
reused. No packages were downloaded/installed. Native commands run with
NODE_ENV=test, APP_ENV=test, DATABASE_URL absent:

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
pnpm lint
pnpm build:production
```

The exact strict arguments, all17 file paths, process exits/durations, before/
after ten-file hash map, merge parents/tree and logs are retained under task
`evidence/OperatorOS/next-pass/payment-intent-integration/`. Root SQL13 log and
receipt are `evidence/OperatorOS/launch-oct23/pi-integration-local-sql13.log`
and `pi-integration-local-sql13-receipt.json`; component SQL3 evidence is
`pi-v2-local-sql.log` and its receipt. Component v1/v2 freezes,418 execution and
Office78/strict/commit identity receipts remain separately preserved.

## Failed gate disclosure and acceptance still required

Original PR133 head7a full release run39332436621 failed13/14 scopes:
API2047/2056 passed, with nine new SQL HTTP cases failing because ordinary
test/test mode selected the deterministic adapter despite flag0, while the
fixture signed real SDK HMAC. Parent reproduced the nine failures against the
isolated cached database. The independently reviewed test-only correction
selects configured HMAC only after the captured disposable-target guard and
blocked egress; original ten SQL case bodies/assertions remain. Parent's
corrected ten cases pass. Corrected PR133 full hosted release is still pending;
its completed vector32 check does not replace that full gate.

That original browser phase had108 first-attempt passes and one automatically
recovered route-crawler flake. Retained trace evidence binds the exact unchanged
frontend/test chain and explicit speculative console RSC/chunk prefetch from an
intentionally unavailable OutCall card, immediately before scripted navigation
to PulseDesk. It does not prove real OutCall workflow acceptance or a baseline
runtime defect; precise cancellation time/passing retry trace are absent. No
assertion, retry policy or speculative runtime patch is changed here.

New-head source review, actual-main history integration and complete hosted
release/vector CI remain required. Real provider account/mode/API permissions,
real signed PI/invoice graphs, controlled deployed tenant/payment persistence,
protected production DB identity, current backup/restore, support/monitoring,
rollback acceptance and publication remain separate gates. Local synthetic SQL
does not establish any of them. The selected payment destination stays disabled.

Rollback is the ordinary reviewed source revert. There is no migration or
provider compensation to undo; a revert restores generic PI retry behavior.
Preserve immutable receipts for future controlled reconciliation. No provider
or customer request, real payment, replay, production DB query/apply, settings
change, push, PR or publication occurred in this local preparation.
