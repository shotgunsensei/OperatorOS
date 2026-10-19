# Stack checkout generation and terminal eligibility integration

This source integration preserves the independently reviewed generation-fence
component `77e6cebe95b71ec799909d5abb94f9725316ea2d` and separate terminal guard
`aa3f9ee1331cc30f5a20d2c0e0b8edda518cb3b2`. It builds on the PR132 account and
invoice tree `cf9d1cc23df7e51e2ff1e060b8f9a0c38531a775`. The latest five guard
blobs supersede three original component blobs; seven other original blobs
remain identical. PR132 merged source-only as
`b9e5e155b9959a314f57604d16ac60c3369a49b7` after all 14 release scopes and
vector32 passed. Its actual checkout and merged tree equal the reviewed tree;
52 unit,1938 API,108 integration,109 browser (no retry observed) and4 visual
cases passed. Its original failed run remains disclosed.

Twelve component paths and four status/review documents form
the final integration scope. Original branches and component commits remain.

## Demonstrated source defects and bounded repairs

An old pending checkout can await a provider response while the actual owner
checkout service replaces the same Stack row with a new attempt and Session.
The former ID/status-only write can then mutate the replacement generation.
The fix copies the validated snapshot before awaiting provider/catalog work,
locks the exact tenant/row, and verifies the complete generation before local
mutation. Entitlement and seat projections use the same executor and lock order
(Stack, entitlements, tenant seats). Binding conflicts return the existing
checkout-in-progress policy error. Initial paid activation and lifecycle,
pending/quarantine, expiry, cancellation, reactivation, companion and checkout
claim/response paths retain exact generation ownership.

The signed `checkout.session.async_payment_failed` handler selects an intent
using its ID and verified metadata tenant, then verifies Session, attempt,
customer, user, cart, items, seats, price and stored subscription binding. It
reconciles only an owned current Stack attempt. A provider reporting active
after delayed payment failure is not evidence of a paid initial Checkout;
terminal owned failure observations do not revive access. Invalid, foreign or
unowned financial events retain failure/retry instead of generic success.

A second actual-source constructor drifts a synthetic configured Price during
pending reconciliation, producing `checkout_failed` quarantine with the exact
subscription bound. Restoring configuration and observing unpaid then active
could previously normalize that initial failure to recovery-eligible past_due
and grant access without a paid Checkout. The final locked guard now prevents
nonterminal provider states from promoting a non-recovery-eligible row. Genuine
mapped canceled/expired reporting and already activated quarantine/recovery
remain compatible, including the existing paused-to-canceled mapping.

These are conditional source findings. No real account occurrence, catalog
drift, failed customer payment or live exploit is established. Historical rows
already normalized to past_due are not reclassified or repaired.

## Actual checks and limits

Owner and independent generation tests each passed 79 new native cases.
Owner and independent terminal runs each passed the 29 new cases plus those
79 prior cases (108 total). The unchanged terminal runtime baseline produced
13 expected desired-state failures and 16 positive controls using the same
actual configuration helpers and test snapshots. Independent review verified
all frozen source/test/document identities and surrounding authority paths.

The combined integration passed **363 selected native tests, zero failures or
skips**, including the existing invoice/number/receipt diagnostics and commerce
contracts. Zero-warning root lint, all four workspace typechecks and API/SDK
compilation pass on the combined runtime/test checkout. This incorporates the separate PR132 diagnostic VM binding repair;
the original component baseline's known diagnostic failure is not suppressed.
The observation fixture also binds the actual async-failure handler and checks
its business error, preventing a ReferenceError from accidentally satisfying
the expected 503 assertion.

Ten guarded real Fastify/SDK/disposable-PostgreSQL cases are authored and strictly
typed: seven generation/transaction/async cases and three terminal/recovery
cases. They are **NOT_RUN locally** because no permitted existing disposable
PostgreSQL target is confirmed. The complete new-head hosted release contract,
including all ten SQL cases, existing API/integration/browser/build/visual
scopes and vector checks, is required before source merge. Local native mocks
do not prove PostgreSQL locking or actual provider acceptance. Existing task
dependencies are reused without acquisition or release-gate changes.

## Preserved boundaries and remaining launch gates

The database transaction cannot undo an already completed external provider
request. Stale external responses cannot write or return a new local generation;
no new provider compensation, refund, retry or support policy is invented.
Exact tenant/session/provider binding, signature, immutable receipt, duplicate,
lease and item/catalog checks remain. Default entitlement callers still own
their transaction; shared-executor callers do not start an independent one.

No schema, migration, dependency, price, provider destination, secret, module
launch state or financial policy changes occur. There is no provider activation,
payment, customer creation, event replay, recipient contact, historical data
repair or production publication. Source merge does not establish intended
Stripe account/mode, actual delivery, authenticated two-tenant acceptance,
current database backup/restore, operational support or rollback readiness.
The selected destination remains disabled pending those separate decisions.

See [generation and transaction review](STACK_CHECKOUT_GENERATION_FENCE.md),
[terminal eligibility review](STACK_TERMINAL_RECOVERY_ELIGIBILITY.md), and the
task's exact component, independent-review, local execution and hosted-CI
receipts. Earlier failed runs and unrun acceptance gates remain disclosed.
