# Phase 44 TorqueShed settlement and reconciliation

Status: **source/local accepted; real Stripe test settlement remains provider-gated**

Assessment date: 2026-08-15 (America/New_York)

## Outcome

The canonical raw-body `POST /v1/billing/webhook` route is the only external
TorqueShed settlement entry. It rejects a missing/invalid Stripe signature or
missing unmodified request bytes before classification. The verified event is
bound to one provider event receipt, purchase, tenant, user, module,
diagnostic, package, units, catalog, account/mode, Session, PaymentIntent,
Product, Price, amount, and currency.

For v50+ catalog purchases, OperatorOS retrieves the actual Stripe Checkout
Session line items before grant. A valid credit requires exactly one line item
with quantity one and the snapshotted durable Product/Price. Standard-account
identity is retrieved from Stripe; Connect event account identity is checked
where present. Deterministic provider tests must supply the same explicit
evidence shape and are never presented as Stripe evidence.

Supported event families are:

- `checkout.session.completed`;
- `checkout.session.async_payment_succeeded`;
- `checkout.session.async_payment_failed`;
- `checkout.session.expired`;
- `payment_intent.payment_failed`;
- `charge.refunded`;
- `charge.dispute.created`;
- `charge.dispute.closed`.

Events whose object does not carry purchase metadata are resolved through the
verified PaymentIntent/Charge relationship. Unpaid completion advances only
to `payment_pending`; it grants zero.

## Atomic exactly-once settlement

Cumulative additive database release v51 adds PaymentIntent/Charge/provider
event snapshots, explicit settlement policy state, and
`torqueshed_credit_policy_holds`.

The settlement transaction:

1. locks the exclusively leased, signature-verified provider receipt;
2. locks the tenant/module purchase intent;
3. acquires the same tenant/user balance advisory and user-row lock used by
   consumption;
4. validates the legal state transition and the complete safe provider
   evidence again;
5. appends one immutable `credit` with purchase and external-source unique
   constraints;
6. changes the purchase to `credited` and stores provider references;
7. writes the audit event;
8. changes the receipt to `processed`;
9. commits all changes atomically.

Any thrown validation or persistence error rolls all of those mutations back
and leaves the receipt retry/dead-letter mechanism in control. Duplicate event
IDs are claimed once. A completed event followed by async success finds the
existing purchase credit and performs no second grant. Delayed failure or
expiration cannot downgrade an already credited/refunded/disputed purchase.

Uniqueness covers provider event ID, provider/mode Checkout Session,
provider/mode PaymentIntent, tenant purchase credit source, external event
reference, and tenant/module/entry-kind ledger idempotency.

## Refund and dispute policy

Refund amount is cumulative provider truth. Partial refunds reverse
`floor(package units × cumulative refunded amount / purchase amount)`; a full
refund targets the complete grant. Existing reversals are subtracted, making
delivery idempotent.

Refund/dispute processing holds the tenant/user balance lock and reverses only
units currently available. If purchased units were already consumed, the
ledger stops at zero and records the remainder as an owner-visible
`refund_debt` or `dispute_freeze` policy hold with reason and provider event.
The purchase carries `refund_review`, `dispute_frozen`, or `dispute_lost` plus
the review units. This is explicit debt/freeze state; it is not a hidden
negative balance and is not silently forgiven. A won dispute restores only
the dispute-specific reversal and resolves its hold. Every reversal references
the original grant and verified provider event.

No goodwill credit was elected or issued. The reported $5 attempt remains
unverified and received no purchase grant. Without exact same-account/mode
provider evidence, it must remain failed, cancelled, test-only, wrong-account,
abandoned, or unclassified—not paid.

## Dry-run and repair reconciliation

```powershell
# Read-only; default mode is dry-run.
$env:STRIPE_MODE='test'
$env:STRIPE_SECRET_KEY='<operator-supplied Stripe test secret>'
$env:DATABASE_URL='<approved OperatorOS test database URL>'
corepack pnpm billing:reconcile:torque -- --payment-intent pi_... --dry-run

# Separately authorized repair. This can only reprocess an existing
# signature-verified receipt when every finding is repairable.
$env:BILLING_RECONCILIATION_APPLY_CONFIRM='REPAIR:pi_...:REPROCESS_VERIFIED_RECEIPT'
corepack pnpm billing:reconcile:torque -- --payment-intent pi_... --apply --repair REPROCESS_VERIFIED_RECEIPT

# HUMAN GATE: live mode additionally requires exact PaymentIntent confirmation.
$env:STRIPE_MODE='live'
$env:BILLING_RECONCILIATION_LIVE_APPLY='pi_...'
```

The v2 report compares Stripe account/mode, PaymentIntent, Charge, Checkout
Session, line-item Product/Price, events, purchase intent, verified webhook
receipts, billing dispatch, ledger, policy holds, audits, and computed balance.
It detects paid/no-credit, credit/no-paid-session, duplicate or wrong-unit
credit, amount/currency/Product/Price/metadata/account/mode drift, stuck
pending, missing refund/dispute policy, orphan Session, unprocessed paid event,
and negative balance.

Repair never inserts a receipt, directly writes a credit, or repairs ambiguous
evidence. It can only requeue and reprocess an existing signature-verified
receipt. A repeated repair on an already green purchase is a no-op. See the
[redacted report fixture](fixtures/torqueshed-reconciliation-report.redacted.json)
and [incident runbook](TORQUESHED-SETTLEMENT-INCIDENT-RUNBOOK.md).

## Stripe test webhook forwarding

Use a Stripe CLI authenticated to the same intended test account. Do not paste
the returned signing secret into logs or documentation.

```powershell
stripe listen `
  --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,payment_intent.payment_failed,charge.refunded,charge.dispute.created,charge.dispute.closed `
  --forward-to https://<candidate-host>/v1/billing/webhook

# In another terminal, run the real browser Checkout journey. Then inspect the
# event delivery rather than using a browser success query as settlement.
stripe events list --limit 20
stripe events resend evt_... --webhook-endpoint we_...
```

The forwarding secret must be configured only in the candidate server secret
store. `stripe trigger` fixtures may test handler plumbing, but they do not
replace the Phase 52 real Checkout/PaymentIntent journey.

## Executed evidence

| Command | Result |
| --- | --- |
| focused raw-body/evidence/settlement/refund/reconciliation/release tests | PASS: 22/22, zero skips |
| database-backed end-to-end settlement workflow | PASS, including signature, mode, tenant, Product, Price, account, amount, currency, replay, async success, expiration, refund review, and zero negative balance |
| seeded reconciliation dry-run/repair/repeat/drift suite | PASS: safe repair once, repeat no-op, Price drift blocks repair |
| clean cumulative v51 apply / immediate reapply | PASS on disposable PostgreSQL 16: 51/51 in 24.642s; reapply in 2.329s |
| `corepack pnpm typecheck` | PASS across API, web, runner gateway, and native TorqueShed app |
| `corepack pnpm build:production` | PASS, including production Next.js artifact |
| `corepack pnpm test:hotfix:torque-exact-host` | PASS: 1/1 compiled production-host browser journey |

## Acceptance and external gates

| Criterion | Result |
| --- | --- |
| Verified provider event is sole external trigger | PASS in source/local contract |
| One valid paid deterministic Session produces one receipt/grant/balance | PASS locally |
| Duplicate/malicious events cannot add credit | PASS locally |
| Refund/dispute policy is explicit and non-negative | PASS locally |
| Reconciliation detects seeded inconsistencies and safe repair is idempotent | PASS locally |
| Real Stripe test Checkout, signed delivery, refund/dispute, and green reconciliation | BLOCKED: no Stripe test credentials/catalog apply were available |
| Production/live settlement or repair | NOT ATTEMPTED; explicit owner gate |

The purchase kill switch remains closed outside disposable deterministic tests.
No Stripe object, payment, production database, deployment, tag, push, merge,
or live repair was mutated by this phase.
