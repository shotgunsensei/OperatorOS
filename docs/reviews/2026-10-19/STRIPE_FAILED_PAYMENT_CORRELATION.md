# Bound Application Stack failed-payment correlation

Base: `7a92b10a76effb014804a5d8fcf440556475d790`, tree
`a9986c07021958cb21c11c6aeb883733f4a41c9f`. Isolated branch:
`codex/stripe-failed-payment-correlation-oct19`.

## Problem and resulting behavior

The canonical webhook selects `payment_intent.payment_failed`, but the generic
dispatcher had no handler. Non-Torque deliveries remained unhandled/retryable
even when the PI belonged to an already-bound Application Stack. PI metadata
does not reliably carry the subscription-mode Checkout metadata, and the
installed Stripe 20.4.1 PaymentIntent type has no direct invoice/subscription
field. No real-account failure or historical data repair is asserted.

The new DB-free resolver follows the exact PI -> InvoicePayment -> Invoice ->
current Subscription graph using read-only central-client methods already
available in Stripe 20.4.1. It accepts a complete mapping to one distinct invoice,
then validates the current canonical subscription's customer, tenant, Stack ID
and checkout generation. String/expanded references are supported. Deleted or
contradictory references, unsupported account/context/customer-account modes,
legacy/feature/Torque scope, no mapping, multiple invoices, partial or malformed
pagination, timeout and provider failures remain retryable. It does not assign
payment success/failure or entitlement authority from a PI/invoice status,
allocation amount, optional metadata, or `latest_invoice`.

`handleBoundStackPaymentIntentFailed` selects the already-bound row using
**ID + tenant + subscription + customer** predicates. Unbound and initial
incomplete intents have no fallback. It validates the exact current Stack
metadata/catalog/items, captures its snapshot/generation, and delegates to the
existing authoritative subscription reconciliation and transaction fence.
Existing activated recovery remains the existing contract; a failed PI cannot
establish an initial checkout grant or revive a terminal purchase. A changed
generation or concurrent local write prevents the stale continuation from
committing. No provider mutation, new schema or new financial/grace policy is
introduced.

The dispatcher carries a private validated subscription/tenant/nullable-actor
subject through its post-processing. This prevents the generic `obj.id` lookup
from treating a `pi_` ID as a subscription and prevents PI metadata/user/customer
fallback from selecting the propagation subject. The same actual dispatcher
runs on saved verified-receipt retry. The subject is not added to public result
fields or substituted into the immutable original event.

## Scope and compatibility

- Torque classification and its separate receipt stay first. Raw-byte HMAC,
  immutable event-ID/payload claims, processing leases, duplicate handling,
  failed receipts and saved retry behavior retain the existing route code.
- The first version supports already-bound canonical Stack subscriptions only.
  Legacy, feature, unbound and initial incomplete cases remain retryable rather
  than receiving a blanket acknowledgment. It never forwards arbitrary Connect
  or organization context into the central key's requests.
- Correlation has at most three 100-item allocation pages, a 10-second budget,
  and a completion timer for each read of at most 3 seconds, clamped to the
  remaining budget. Each timer is cleared in `finally`. A stalled or trickling
  SDK promise cannot keep this resolver waiting or resume its graph after the
  deadline. The underlying SDK GET may finish late; it is observed/discarded,
  not canceled, and has no provider/database mutation or propagation capability.
  SDK `timeout` and `maxNetworkRetries:0` are also requested; the installed SDK
  has an initial connection-closed retry exception, so zero actual SDK retries
  is not claimed.
  Repeated allocation IDs/cursors, missing `has_more`, empty incomplete pages
  or an exhausted page budget cannot silently establish uniqueness.
- That budget covers the **new correlation reads**. Existing Torque
  pre-classification and subscription/catalog reconciliation keep their existing
  request behavior. This patch does not claim an end-to-end webhook deadline.
- New correlation errors are fixed reasons; raw provider errors, PI client
  secrets, payment details and last-payment errors are not copied into them.
- Existing source-extraction fixtures bind the actual new handler/resolver.
  Their plain PI negative case asserts the exact invalid-event reason, so a
  caught missing-binding ReferenceError cannot falsely satisfy expected 503.

## Evidence actually executed

All local tests use existing Node 24/tsx and installed dependency junctions.
They import the real resolver and extract the actual billing/route/retry/fence
source bodies, substituting only provider, catalog and database boundaries.
No external provider/DB/customer request or live payment was used.

- **Baseline:** before runtime changes, the actual existing invoice-failure
  control passed and the new bound-PI reconciliation/propagation case failed:
  2 tests, 1 passed, 1 expected failure, 0 skipped. The dispatcher returned
  unhandled. A durable evidence-only replay of exact `git show 7a92b10a`
  fixture/runtime bodies independently preserves that control and gap.
- **Candidate v2:** 418 selected native tests passed, 0 failed/skipped, 21.990s.
  This includes 78 new resolver/dispatcher/signed-route/saved-retry cases and
  the existing invoice, signature/receipt, number, async, terminal, transaction
  and diagnostic controls. It is targeted coverage, not the complete release.
  Native mock timers exercise never-settling reads, late success and rejection,
  no downstream reads/DB/propagation after timeout, and remaining-budget limits.
- All four workspace source typechecks passed. Strict NodeNext checking of all
  changed/new test files, including the authored SQL file, passed. `--allowJs`
  includes the existing fixture's untyped `database.mjs` import without adding
  a fake declaration; strict checking remains enabled for the TypeScript files.
- Root `pnpm lint` passed with zero warnings. Final `pnpm build:production`
  passed, including all four workspace typechecks, API/runner builds and
  Next's 38 static pages. No server or database was started.
- Three guarded disposable-PostgreSQL tests are authored and strictly typed:
  durable signed processing/duplicates/original event, saved retry after a
  provider-correlation failure, and foreign tenant hint rejection with unchanged
  commercial projections. They are **NOT_RUN locally** because no disposable
  PostgreSQL target is confirmed. Setup validates the pool-captured target
  before DDL, and teardown makes no DB query if that guard fails. After that
  guard and process-lifetime egress blocking, the fixture selects development
  APP_ENV/NODE_ENV before dynamic billing import, matching the existing real
  HMAC fixture; ordinary `NODE_ENV=test` forces deterministic verification.
  An explicit adapter status assertion requires `payments/stripe/configured`.
  Credentials remain synthetic and every actual provider request is blocked.

Evidence is retained under
`evidence/OperatorOS/next-pass/payment-intent-implementation/`: baseline log and
Git-object replay receipt; `candidate-v2-native.log`; `strict-v2.log`;
`lint-v2.log`; `production-build-v2.log`; and the final file/hash receipt.
The file/hash receipt contains the exact commands and independent-review state.
The original ten-file freeze, 414-test result and all original byte hashes are
preserved separately as historical v1 evidence. V2 adds the completion deadline,
its four controls, and the authored SQL adapter-selection correction.

## Remaining acceptance and rollback

Independent frozen-source review and the complete combined-head hosted release
gate, including actual disposable SQL execution, are required before source
merge. Parent's PR133 base has a failed hosted API phase under separate fixture
triage; this component's local results do not establish that baseline's full
acceptance. Parent must resolve that failure, integrate with normal history and
run a fresh combined-head gate. This component has not been pushed, deployed,
replayed or published.
Actual provider account/mode/API permissions, selected signed event payloads,
real PI/invoice allocation graphs, controlled tenant/payment acceptance,
recoverable database backup and publication remain separate human gates.

Rollback is a source revert through the ordinary reviewed release path. No
schema migration, provider state change, credential, paid feature or historical
data repair is part of this component. Reverting retains the prior generic PI
retry behavior; preserve failed receipts for controlled future reconciliation.
