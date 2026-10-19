# Stack checkout generation fence and owned asynchronous failure

Base: `acbeb7ddcef90f7587046aad244fa8c6522cd14f`, tree
`ea2e5e1e5843636048fe45bb711ce999b006df0c`. This component is separate from
the frozen invoice-observation/managed-number follow-up. No schema, dependency,
release manifest, workflow, signing configuration or provider setting changes.

## Demonstrated problem

An incomplete Stack reconciliation could read an old intent, await Stripe or
catalog validation, and update the same row using only its ID and
`status=incomplete`. A legitimate owner can replace that same ID with a new
attempt after the old subscription is deleted. The old continuation could then
write its old subscription and terminal status into the replacement attempt.
Guarding only the earlier selection or final UPDATE is insufficient when grants,
deactivation, companion changes and seat projection use independent transactions.

The immutable source counterexample exercises actual reconciliation, deletion
and full checkout creator bodies. A complete/unpaid Session initially rejects
owner retry with `STACK_FLAGSHIP_LIMIT` and zero writes. While an old
reconciliation waits, the matching deleted handler terminalizes the old row;
the actual owner creator confirms the old provider subscription is terminal and
replaces the row with a fresh attempt and Session. Resuming the old continuation
overwrites the new incomplete intent. This does **not** assume a completed
Session becomes expired. The retained six-case baseline contains five observed
mutations, including this full-service chain at both provider and catalog waits.
It is a synthetic source proof, not an observed production delivery or SQL proof.

## Local atomic boundary

`stack-mutation-fence.ts` copies an immutable, canonical snapshot of the selected
row before provider awaits, including tenant/user, attempt, Session, customer,
subscription, cart/prices, lifecycle, periods, metadata and timestamps. It then
locks the exact tenant-owned row `FOR UPDATE` and compares the current snapshot
before any local effect. A changed/missing row fails with a retry/conflict and
cannot fall back to another tenant or legacy contract.

Every primary Stack writer now follows the same order: Stack row, entitlements,
tenant seat row. This covers initial paid activation, active/pending lifecycle
reconciliation, quarantine, deletion, cancel/reactivate, companion changes,
expired-Session claims, checkout replacement and provider-result persistence.
The locked current lifecycle determines pending/terminal/recovery eligibility.
Initial activation and its grants, seats, billing event and activation audit
share one transaction. Related helpers reuse the supplied executor for **all**
reads and writes; they do not open independent nested transactions.

Default helper calls still own one transaction and acquire the Stack lock first
when a Stack exists. Historical direct/manual grants without a Stack retain
their previous behavior; this does not claim new serialization of absent-row
manual operations. Supplied deactivation requires a trusted tenant and selects
and writes by tenant plus subscription. A historic/malformed foreign duplicate
grant cannot cause a second, foreign Stack lock or projection mutation. This is
a defensive negative control, not evidence of a production injection path.

Provider/catalog calls remain outside the short database transaction. The fence
makes local Stack/grant/seat/event/activation-audit effects atomic. Existing
Stripe cancel/reactivate, companion metadata and Checkout create operations
occur before the final lock and **cannot be rolled back by a database conflict**.
Their stale results are rejected locally for subsequent reconciliation; no
compensation/cancellation policy is added. An old Checkout Session is neither
persisted into a changed generation nor returned as a successful new redirect.
The tenant-owned route's separate checkout-request audit remains after success.

## Asynchronous failure authority

`checkout.session.async_payment_failed` is handled only for an exact owned
`core_product_stack` subscription-mode, complete/unpaid Session. It validates
intent, initiating user, tenant, customer, Session, current attempt, core,
companion, modules, seats, month interval and any stored subscription binding
before reconciliation or an owned-terminal observational acknowledgment. An
unknown/malformed/foreign object remains retryable, without provider reads or
local authority changes. Expanded subscription/customer IDs are accepted, with
propagation pinned to the exact bound tenant.

The failed event does not itself set a terminal state, revoke access or grant
access. Existing latest-provider item/price/binding validation remains authority
for lifecycle reconciliation. An incomplete intent remains incomplete when the
latest provider object is active/trialing/nonterminal, with **zero initial
grants**. Only paid/no-payment-required Checkout completion establishes initial
access. Owned local terminal rows remain terminal under this failure path;
newer attempts or lock-time changes receive no old-generation effects. A late
failure does not undo a separately validated paid activation merely because the
immutable failure was delivered later.

This is not complete delayed-payment recovery acceptance. Stripe documents that
[a delayed payment can leave a subscription active even after failure voids its invoice](https://docs.stripe.com/billing/subscriptions/overview#delayed-payment-confirmation).
Subscription `active` is therefore not initial-payment evidence. A complete/unpaid
Session with a still-active provider subscription can continue to block a new
owner checkout under the existing one-Stack policy. Customer retry/support,
alternative payment and cancellation policy for that state still need explicit
acceptance; this patch does not invent them. Provider snapshot ordering within
one unchanged attempt also remains the existing reconciliation policy.

Refund, dispute-open/close and uncorrelated PaymentIntent failure behavior is
unchanged. The separate Torque credit and TradeFlow Connect policies are not
repurposed as Stack subscription authority. No blanket financial acknowledgment
or new paid-feature launch claim is introduced.

## Verification and release gates

New native tests execute the actual service, fence and product-helper bodies
against synthetic provider/catalog and a rollback-capable in-memory query
adapter. They cover full owner replacement while the old continuation waits,
both pending and actual paid replacement projections, both lock winners,
invoice outer-provider awaits, quarantine/recovery/companion/cancel/reactivate,
expiry/Session-result races, write-site rollback, default/supplied/no-Stack
helpers, foreign duplicate grants, exact failure binding and active-after-failure
without initial grant. This models source/executor behavior; it does not prove
PostgreSQL scheduling or real Stripe lifecycle acceptance.

`stack-mutation-fence-db.test.ts` adds **seven guarded PostgreSQL cases** using
actual signed webhook and owner HTTP routes, a separately acquired observer,
real row-lock blocking in both orders, shared rollback, receipts/retry and a
foreign-Stack-lock negative control. The fixture has no receiver targets, blocks
fetch for its isolated process lifetime, and uses only a synthetic Stripe SDK
HMAC verifier and stub provider/catalog methods. No provider request is allowed.
These seven cases are **NOT_RUN locally**: no existing disposable PostgreSQL
fixture is confirmed. The shared setup refuses missing, remote or persistent
database targets before DDL. Existing hosted release CI provisions the required
disposable fixture and is an exact-head merge gate.

Existing extracted-function observation tests now include the actual new helper
and resource normalizer, and assert the real invalid-Stack error rather than
passing through a caught missing binding. The prior ID/status-only checkout
static assertion is updated to the snapshot fence; behavioral before/after
controls are retained. Source/test typechecking, root lint, focused existing
invoice/binding/observation/managed-number/diagnostic tests and API build receipts
are retained under `evidence/OperatorOS/launch-oct23/stack-fence-*` in the audit
workspace. The acbeb diagnostics fixture has its separately reviewed/root-owned
missing-helper correction; that correction must be included in integration.

Final source approval, combined exact-tree full API/PostgreSQL/browser release
CI, and provider destination/account/mode/lifecycle acceptance remain gates.
The selected Stripe destination was independently observed disabled; this work
does not enable it, replay an event, create a payment, alter credentials or
claim production checkout/payment collection works.
