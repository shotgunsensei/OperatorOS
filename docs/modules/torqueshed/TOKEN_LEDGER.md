# Torque Assist token ledger

Assessment date: 2026-07-18
Authority: OperatorOS billing and audit; TorqueShed diagnostic usage

## Accounting model

`torqueshed_token_ledger_entries` is the only authoritative balance source.
There is no mutable balance column or cached value used for authorization.
Balance is calculated from append-only entries:

`credits + debit reversals + credit adjustments - debits - credit reversals - debit adjustments`

Every entry is bound to the trusted tenant, user, and TorqueShed module. Usage
debits also reference the diagnostic and assist request. Purchase credits and
refund reversals reference the OperatorOS purchase intent. Composite indexes,
idempotency keys, unique external event references, and one-debit-per-request
constraints make replays duplicate-safe.

An installed database trigger rejects `UPDATE` and `DELETE`. Corrections must
be represented by a new reversal or adjustment entry with an explicit reason
and audit trail.

## Entry kinds

| Entry kind | Sign | Purpose |
| --- | ---: | --- |
| `credit` | + | Verified paid OperatorOS token package |
| `debit` | - | Accepted Torque Assist provider usage |
| `credit_reversal` | - | Full or partial cumulative payment refund |
| `debit_reversal` | + | Explicit correction of a prior debit |
| `adjustment_credit` | + | Audited administrative correction |
| `adjustment_debit` | - | Audited administrative correction |

The Phase 8 API creates purchase credits, assist debits, and payment refund
reversals. No browser or module-local endpoint can directly create arbitrary
adjustments.

## Purchase and credit flow

1. The authenticated user chooses a server-defined package key. Current
   packages are 25,000 units for USD 5.00, 100,000 for USD 15.00, and 500,000
   for USD 50.00.
2. OperatorOS snapshots package key, units, amount, currency, tenant, user,
   and module in `operatoros_token_purchase_intents` under an idempotency key.
3. Production creates one Stripe Checkout payment using server-owned
   `price_data` and canonical TorqueShed success/cancel URLs. Test mode creates
   a pending deterministic intent but does not credit it.
4. Only a signed raw-body webhook may mark the purchase credited. The event's
   test/live mode, purchase ID, tenant, user, module, package, amount, currency,
   and paid state must match the stored intent.
5. Replaying the checkout request or payment event does not create another
   credit. Browser success navigation is informational only.
6. Failed, expired, or asynchronously failed payments create no credit.
7. Signed refund events create cumulative full or partial
   `credit_reversal` entries. They never edit the original credit.

OperatorOS owns package pricing, Stripe credentials, checkout, webhook
verification, refunds, and platform audit. These token packages are separate
from TorqueShed marketplace/business payments and from platform subscription
or add-on entitlements.

## Assist debit flow

The server estimates usage before provider execution and rejects a request
whose computed balance cannot cover the estimate. After an accepted response,
the server recalculates exact provider units and locks the tenant/user/module
accounting scope. If the balance changed and no longer covers the exact debit,
the result is rejected without a ledger write. Otherwise, the accepted assist
request and exactly one debit commit atomically with shared usage and audit.

Idempotent replay returns the original completed result and does not charge
again. Provider failure, invalid JSON, unsafe output, insufficient evidence
that yields a structured follow-up response, or an open circuit follows the
documented service outcome; only an accepted persisted result can be debited.

## Reconciliation

The manager-only reconciliation view checks:

- computed negative balances;
- credited purchases whose ledger sum does not match the intent;
- refunded purchases whose cumulative reversals do not match state; and
- completed assist requests whose exact debit is missing or mismatched.

A refund can make the mathematical balance negative after credits have
already been consumed. The ledger preserves that truth, flags it for
reconciliation, and denies later usage; it does not rewrite history.

## Operational safety

- Review the read-only release plan with `pnpm db:plan`.
- Apply only through the root release contract to an approved database.
- Back up before any approved persistent migration and follow
  `docs/DATABASE_BACKUP_RESTORE.md`.
- Never run child migrations or repair ledger rows with direct update/delete.
- Use an isolated disposable PostgreSQL database for workflow tests.
- Treat test and live Stripe events as different accounting domains.
- Do not claim credits, refunds, concurrency safety, or append-only behavior
  from static tests; those require the database-backed Phase 8 workflow.

That database workflow is implemented but remains unrun on this workstation
because the Docker daemon is unavailable.
