# TorqueShed settlement incident runbook

This runbook covers **paid without credit** and **credit without verified
payment**. Start read-only. Never create a replacement Checkout Session to
investigate an existing attempt, never synthesize a signed receipt, and never
label an administrator adjustment as a Stripe payment.

## Establish scope

Record the candidate commit/build/database release, deployment environment,
Stripe account ID and test/live mode, catalog version, purchase ID, Checkout
Session ID, PaymentIntent ID, Charge ID, and provider event IDs. Redact user,
tenant, and payment data in copied reports. Confirm the OperatorOS database and
Stripe credentials point to the same intended environment before querying.

Keep `TORQUESHED_CREDIT_PURCHASES_ENABLED=0` if account, catalog, webhook, or
release identity is uncertain.

## Paid Session with no credit

1. Run the PaymentIntent reconciliation command in dry-run mode.
2. Require one OperatorOS purchase, the correct account/mode, one paid
   Checkout Session, one durable Price/Product line item, matching amount and
   currency, matching trusted metadata, and exactly one signature-verified
   webhook receipt.
3. If no verified receipt exists, use the Stripe Dashboard/CLI to resend the
   original event to the canonical signed webhook endpoint. Do not insert a
   receipt manually.
4. If exactly one verified receipt is pending/retry/dead-letter and the only
   findings are `PAID_SESSION_NO_CREDIT` and `PAID_EVENT_UNPROCESSED`, the
   separately confirmed `REPROCESS_VERIFIED_RECEIPT` repair may be used.
5. Re-run dry-run reconciliation. Require one processed receipt, one purchase
   credit, `credited`, and correct balance.
6. Replay the provider event and repair command. Require no second credit.

If amount, currency, Price, Product, account, mode, metadata, tenant, user,
module, diagnostic, or catalog differs, stop. The record is ambiguous and is
not repairable by auto-credit.

## Credit with no paid Session

1. Close purchases and preserve provider/database evidence.
2. Run dry-run reconciliation and confirm `CREDIT_WITHOUT_PAID_SESSION`.
3. Do not delete or edit the append-only credit.
4. Do not create a payment or mark the purchase paid.
5. Escalate for a reviewed compensating `credit_reversal` or an audited
   administrator policy decision. Every reversal must reference the original
   grant and incident.
6. Check for webhook-secret/account mismatch, deterministic-test leakage,
   forged metadata, legacy handler execution, or manual database mutation.
7. Validate all purchases for the tenant/user and run the broad ledger
   reconciliation before reopening.

## Refund or dispute after consumption

OperatorOS reverses only currently available units under the same tenant/user
balance lock. It records remaining spent units in
`torqueshed_credit_policy_holds` as `refund_debt` or `dispute_freeze`, exposes
the review state to the owner, and never silently drives the balance below
zero. Resolve the hold only through a reviewed additive policy action. A won
dispute restores only the dispute-specific reversal and resolves its freeze.

## Closure evidence

Retain the redacted dry-run report before and after action, original provider
event IDs, receipt states/attempts, purchase state, ledger entries, policy
holds, audit rows, balance, commands executed, operator identity, and whether
the purchase switch was reopened. A report is green only when it has zero
findings; a passing unit test does not substitute for provider evidence.
