# TorqueShed paid-not-credited incident

## Incident identity

- Severity: P0 paid-but-unfulfilled revenue incident.
- Confirmed owner-supplied provider reference: `pi_3U3GHkLb6JkgBESX0ZlLb1DR`.
- Confirmed owner-supplied amount: USD $5.00, with Stripe reporting a successful payment and upcoming payout.
- Observed product state: Torque Assist balance remained zero and the diagnostic action did not explain the settlement/provider failure.
- Deployed release, verified from `https://operatoros.net/api/health` and `https://api.operatoros.net/readyz` on 2026-08-11: commit `1942a9f69f2e90e28ea8da31cadf257441175e9c`, build `bf05e2fa4d4b697fe755cc5a`, database release v39, last step `ninja_pool_online_tables`.
- Hotfix source: branch `codex/hotfix-torqueshed-paid-credit`, implementation commit `b03ab43`, based exactly on deployed commit `1942a9f69f2e90e28ea8da31cadf257441175e9c`. Confirm the final branch-tip full hash with `git rev-parse HEAD` immediately before deployment.

No second charge was created. No refund, raw ledger insert, production database mutation, or live reconciliation was performed by this work.

## Proven root cause

The deployed source has a deterministic routing defect:

1. Torque checkout creation correctly puts `operatoros_kind=torque_assist_credit`, purchase, tenant, user, module, package, and unit metadata on the Checkout Session and PaymentIntent.
2. The configured canonical route, `POST /v1/billing/webhook`, verifies the Stripe signature and classifies every non-add-on Checkout event as a plan event.
3. It claims the Stripe event ID in `billing_events` before processing.
4. Generic plan settlement then requires `userId` and `planSlug`, which a Torque credit event intentionally does not contain, so no Torque ledger credit is appended.
5. Torque settlement was exposed at a second URL, `/v1/billing/torque-assist/webhook`, while the repository documented only one `STRIPE_WEBHOOK_SECRET`. Stripe signing secrets are endpoint-specific, so two independently configured endpoints cannot safely assume one secret.

Therefore, a valid Torque event delivered to the production canonical Stripe endpoint cannot fulfill the purchase in deployed commit `1942a9f`. The live Stripe delivery/event ID and production purchase/receipt rows still require the guarded read-only inspection below because this workstation has neither live Stripe read credentials nor the production `DATABASE_URL`.

## Corrective implementation

- `/v1/billing/webhook` is now the one canonical Stripe endpoint.
- The canonical route verifies the raw body/signature once, classifies Torque metadata before generic plan/add-on claiming, and dispatches an already-verified event to the shared receipt pipeline.
- The retired dedicated Torque webhook route is removed; its signing-secret ambiguity is eliminated.
- An existing plan-classified `billing_events` row is explicitly and idempotently reclassified after Torque dispatch. It cannot suppress the Torque receipt.
- Settlement uses a transactionally locked shared function. Credit idempotency is purchase-scoped (`purchase:<purchase-id>`), so completed, async-succeeded, resend, and reconciliation events cannot create a second purchase credit.
- Checkout/session, mode, tenant, user, module, package, units, amount, and currency are validated before credit.
- Refunds proportionally reverse immutable credits. A dispute freezes the remaining purchased units; a won dispute restores only dispute-reversed units. All actions remain append-only and audited.
- The purchase return URL contains the opaque purchase ID. The new authenticated status endpoint only observes server state and ledger balance; query parameters cannot settle or credit a purchase.
- The UI shows verifying, paid-pending-credit, credited, failed/expired, refunded, and disputed states with bounded polling and a manual refresh.
- TorqueShed errors now retain safe error codes and request references while translating balance, payment configuration, provider outage, rate limit, and tenant/context failures into actionable messages.

## Live truth still required

Run the dry-run from the deployed Replit shell or another approved operator environment that has read access to the same live Stripe account and production database:

```powershell
pnpm billing:reconcile:torque -- --payment-intent pi_3U3GHkLb6JkgBESX0ZlLb1DR --dry-run
```

The command retrieves and prints only redacted provider/account/payment/session/event identity and safe OperatorOS metadata. It requires all of the following before declaring the purchase eligible: live mode; expected Stripe account; succeeded/paid state; $5.00 USD; one-time payment mode; exact purchase/tenant/user/module/package/unit metadata; matching local purchase snapshot; no invalidating refund/dispute; at most one existing purchase credit; and an associated paid Stripe event.

The following values are deliberately not invented and remain pending that run:

- Stripe account ID and live account match;
- Checkout Session ID;
- paid Stripe event ID and delivery response/retry history;
- production purchase-intent ID/status;
- `shared_webhook_receipts` and `billing_events` rows;
- audit row identity;
- final authoritative ledger balance.

## Existing-payment repair

Preferred repair after deployment is to resend the existing paid event—not create another Checkout Session:

1. Verify the deployed health release matches the reviewed hotfix commit.
2. In Stripe Workbench, open the event associated with `pi_3U3GHkLb6JkgBESX0ZlLb1DR`, normally `checkout.session.completed` or `checkout.session.async_payment_succeeded`.
3. Review the delivery target and resend that existing event only to `https://api.operatoros.net/v1/billing/webhook`.
4. Confirm the response identifies `kind=torque_assist_credit` and `status=processed`.
5. Refresh the original diagnostic. Confirm purchase state `credited`, exactly one 25,000-unit Roadside credit, and a persistent 25,000-unit balance before any AI debit.

If Workbench resend is unavailable but the dry-run reports `eligible=true`, an authorized owner may use the guarded fallback:

```powershell
$env:BILLING_RECONCILIATION_LIVE_APPLY='pi_3U3GHkLb6JkgBESX0ZlLb1DR'
pnpm billing:reconcile:torque -- --payment-intent pi_3U3GHkLb6JkgBESX0ZlLb1DR --apply
Remove-Item Env:BILLING_RECONCILIATION_LIVE_APPLY
```

The apply path calls the same locked settlement function as the signed webhook. It stops without mutation on any mismatch or ambiguity. A repeated apply or later event resend is a no-op at the purchase-credit boundary.

## Verification evidence

- Focused API/database/static/preflight suite against disposable PostgreSQL: PASS, 13/13 on the final diff (the earlier pre-fix run was 15/15 under the prior test grouping).
- Exact database release apply and immediate reapply against disposable PostgreSQL: PASS.
- ESLint with zero warnings: PASS.
- API, runner, and web TypeScript: PASS.
- API, runner, and Next production build with `INTERNAL_API_URL` configured: PASS.
- Exact-host production-artifact browser journey: PASS, 1/1. It proves login/SSO, canonical webhook dispatch, duplicate replay, exactly one purchase credit, authoritative `Credits added` status, 25,000-unit balance, reload persistence, and 390px mobile containment.
- Revenue-ready environment preflight with non-secret test-shaped values: PASS for core and revenue profiles.
- Direct Phase 28 report verification: PASS, 860 mapped capabilities, 0 blocked. The umbrella command remains blocked by three pre-existing stale generated parity artifacts on the deployed-base line; this incident branch deliberately does not rewrite unrelated generated ledgers.
- Live provider retrieval: BLOCKED on this workstation with redacted code `STRIPE_NOT_CONFIGURED`.
- Existing payment reconciled: NO; owner-authorized deployment plus provider-truth dry-run/event resend remains required.

## Rollback

The schema change only broadens purchase states and is backward-compatible; do not remove ledger rows or reverse migrations. If runtime rollback is unavoidable, first disable new Torque credit checkout, retain the canonical Stripe event for later resend, redeploy the previous release, and immediately schedule the corrected runtime. Rolling back the code reintroduces the fulfillment defect and is not a steady-state resolution.
