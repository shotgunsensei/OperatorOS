# Verified invoice creation observation

Base: `7c077cce8ba6c6471014ffe264b85ab95ddd3735`, tree
`4a9e4fb6f4770522c8c78d80d1ab490f0dee2a42` (identical to reviewed PR131/905).

## Problem and bounded behavior

The central Stripe destination selects `invoice.created`, but every generic
classification path previously returned unhandled and produced a failed receipt
and 503. This is a source/synthetic reproduction, not evidence of a real failed
delivery. Parent's read-only browser observation found the selected destination
disabled; this pass leaves it disabled.

Stripe documents that failing to acknowledge `invoice.created` can delay
automatic-collection invoice finalization for up to 72 hours. The central
integration does not customize draft invoices, and creation conveys no paid
subscription, feature capacity or credit authority. See
[subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks)
and [invoice finalization](https://docs.stripe.com/invoicing/integration/workflow-transitions).

`billingObservationResult` recognizes **only** `invoice.created`. The live
route uses it after signature verification, Torque classification and the
generic immutable event claim. It returns `invoice_created_observed` with
`shouldPropagate:false`, then persists the processed receipt before returning
success. The same result is used by saved-receipt admin retry after its existing
processed guard and lease acquisition, so previously failed observations can
be recovered without calling settlement or feature modules.

The result does not inspect or change invoices, subscriptions, tenant bindings,
entitlements, feature quantities or credit balances. Invalid signatures, missing
raw bodies, disabled configuration, claim conflicts/in-flight delivery and
receipt persistence errors still reject. The five other selected plain events
remain retryable: `charge.dispute.closed`, `charge.dispute.created`,
`charge.refunded`, `checkout.session.async_payment_failed` and
`payment_intent.payment_failed`. Paid/failed invoice and add-on/feature handler
errors still fail their receipt and return 503. Recognized Torque events retain
their separate settlement receipt and 200/202 behavior. No refund, dispute,
cancellation or failure policy was invented.

## Verification

Only existing local dependencies were reused; no package acquisition or install.

| Check | Actual result |
| --- | --- |
| Pristine-base Fastify + real offline SDK-HMAC regression | 20 passed, 7 expected observation failures, 0 skipped, 27 tests |
| Patched original 27 cases | 27 passed |
| Final observation tests with feature-failure controls | 33 passed |
| Actual saved-receipt retry source-body regressions | 12 passed |
| Above plus prior canonical invoice and dedicated binding tests | 166 passed, 0 failed, 0 skipped |
| 15-selected-event source dispatch probe and controls | 42 passed; plain events 10 x 200 / 5 x 503; Torque still 8 recognized types |
| API typecheck | Passed |
| Strict typing of all three changed test files | Passed |
| Root lint | Passed, zero warnings |
| `git diff --check` | Passed |
| Two added real SDK/Fastify/disposable-SQL receipt/admin-retry cases | **Not run locally**: no confirmed existing disposable PostgreSQL fixture |

Focused command from the root with existing pinned `pnpm`/Node on `PATH`:

```powershell
pnpm --dir apps/api exec tsx --test --test-concurrency=1 test/billing-invoice-observation.test.ts test/billing-invoice-observation-retry.test.ts test/billing-invoice-subscription.test.ts test/billing-webhook-binding.test.ts
pnpm --dir apps/api typecheck
pnpm --dir apps/api exec tsc --noEmit --strict --allowJs --resolveJsonModule --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop --skipLibCheck test/billing-invoice-observation.test.ts test/billing-invoice-observation-retry.test.ts test/checkout-expiration-webhook-db.test.ts
pnpm lint
```

The Fastify tests execute the actual route/classifier/canonical dispatcher
source with real SDK HMAC verification and blocked provider egress. Receipt and
settlement dependencies are synthetic. Retry tests execute actual selected
service functions with native SQL/settlement stubs. Those prove control flow,
not SQL persistence or real provider acceptance. The added guarded SQL cases
must pass on the combined exact-head hosted release workflow before merge.
The baseline test snapshot and pristine-base rerun are retained under
`evidence/OperatorOS/launch-oct23` in the task workspace; no candidate source
swapping or production environment override was used.

## Release and provider boundaries

Fresh independent review and full combined exact-head release CI remain gates.
No provider API/event replay, payment, live database, credential, destination,
configuration or deployment action occurred. The selected endpoint remains
`https://api.operatoros.net/v1/billing/webhook`; parent reported account/mode
authority still unattested and destination disabled. The exact private signing
binding remains `OPERATOROS_BILLING_WEBHOOK_SIGNING_SECRET`; application format
readiness cannot prove destination activation or successful settlement.
Implementation verification does not establish deployed payment acceptance.
