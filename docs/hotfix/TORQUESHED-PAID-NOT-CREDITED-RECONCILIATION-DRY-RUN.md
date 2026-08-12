# Redacted reconciliation dry-run — `pi_3U3GHkLb6JkgBESX0ZlLb1DR`

Run from the isolated hotfix workspace on 2026-08-11:

```text
pnpm billing:reconcile:torque -- --payment-intent pi_3U3GHkLb6JkgBESX0ZlLb1DR --dry-run
```

Redacted result:

```json
{
  "schema": "operatoros.torque-payment-reconciliation.v1",
  "paymentIntentId": "pi_3U3GHkLb6JkgBESX0ZlLb1DR",
  "mode": "dry-run",
  "applied": false,
  "blocked": true,
  "code": "STRIPE_NOT_CONFIGURED"
}
```

Interpretation: this workstation does not have approved live Stripe read credentials or the production database connection. The command stopped before provider retrieval and performed no mutation. This is an authority/environment gate, not evidence that the payment failed or that the local purchase matches.

Rerun the same dry-run in the deployed Replit operator shell. Do not paste its secret values, customer/payment-method details, or client secret into this report. Record only account ID, livemode/status/amount/currency, latest charge ID, Checkout Session ID, safe OperatorOS metadata, relevant event IDs/types, local purchase/receipt/billing/audit identities, eligibility failures, and whether the existing credit already exists.
