# TorqueShed Stripe webhook topology

## Canonical production topology

```text
Stripe live account
  -> POST https://api.operatoros.net/v1/billing/webhook
       -> exact raw-body Stripe signature verification (once)
       -> typed classification
            torque_assist_credit -> shared receipt -> locked token settlement
            addon                -> generic billing claim -> add-on settlement
            plan                 -> generic billing claim -> plan settlement
```

Unsupported generic billing event types keep the existing auditable generic-handler behavior; they are not misclassified as TorqueShed purchases.

`/v1/billing/torque-assist/webhook` is retired. Remove it from Stripe Workbench. Never copy the canonical endpoint's `whsec_...` value to a different URL.

## Required deployment configuration

- `STRIPE_MODE=live`
- `STRIPE_SECRET_KEY`: approved live account key, server-side only.
- `STRIPE_WEBHOOK_SECRET`: signing secret displayed for the exact canonical endpoint.
- `STRIPE_EXPECTED_ACCOUNT_ID`: exact `acct_...` identity returned by the approved live key.
- `STRIPE_WEBHOOK_ENDPOINT_URL=https://api.operatoros.net/v1/billing/webhook`
- `STRIPE_WEBHOOK_EVENTS` includes:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.async_payment_failed`
  - `checkout.session.expired`
  - `payment_intent.payment_failed`
  - `charge.refunded`
  - `charge.dispute.created`
  - `charge.dispute.closed`
  - existing plan/add-on subscription and invoice events.

Validate without displaying secrets:

```powershell
pnpm preflight:production -- --revenue-ready
```

The preflight verifies declared URL, event selection, live mode, account-ID shape, secret presence/type, and existing price configuration. Stripe Workbench remains the authority for confirming the endpoint's actual signing secret and enabled event selection.

## Event policies

- `checkout.session.completed`: credit only when the signed session is paid; otherwise preserve payment-pending state.
- `checkout.session.async_payment_succeeded`: credit exactly once.
- async failure, PaymentIntent failure, or Session expiration: no credit; store a terminal safe state.
- refund: append a proportional credit reversal up to the original grant.
- dispute opened/lost: freeze remaining purchased units through an immutable reversal and mark disputed.
- dispute won: restore only units reversed by dispute policy and return the purchase to credited.
- browser success/cancel query: display/status input only; never settlement authority.

## Deployment and verification

1. Back up production and record current release identity.
2. Build and deploy the exact reviewed hotfix commit from its isolated deployed-base branch.
3. Apply/reapply the supported cumulative database release; never use `drizzle-kit push`.
4. Configure the canonical Workbench endpoint and its own signing secret.
5. Run revenue preflight and verify `/api/health` plus `/readyz` show the intended commit/build/database identity.
6. Use a new Stripe **test-mode** purchase to prove canonical dispatch, status polling, balance persistence, replay, and refund/dispute policy.
7. Run the incident PaymentIntent dry-run.
8. Resend the existing paid event or use the guarded reconciliation fallback—never make another live purchase.
9. Verify exactly one purchase credit and persistent balance after refresh/relogin.

## Forward integration

This hotfix branch is intentionally based on deployed commit `1942a9f`. After the incident release is stable, cherry-pick or merge the hotfix forward into current `main`; do not replace later Phase 31+ restoration work with the deployed-base tree.
