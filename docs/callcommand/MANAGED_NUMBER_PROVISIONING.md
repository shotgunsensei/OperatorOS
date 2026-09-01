# CallCommand Managed Number Provisioning

**Release contract:** v58 `callcommand_managed_number_provisioning`  
**Evidence status:** source/local implemented; live provider and deployed acceptance blocked  
**Customer promise:** a tenant obtains and manages an OperatorOS-owned CallCommand business number without receiving Twilio credentials or configuring Twilio.

## Runtime path

```text
Authenticated OperatorOS tenant administrator
  -> CallCommand /setup
  -> server-side local or toll-free inventory search
  -> durable tenant/idempotency-bound provisioning order
  -> tenant Twilio subaccount create-or-reuse
  -> exact number acquisition in that subaccount
  -> persist provider ownership before downstream work
  -> assign tenant AI receptionist and published workflow
  -> configure fixed HTTPS voice and status callbacks
  -> verify provider ownership, voice capability, routing, billing, and Realtime readiness
  -> ACTIVE

External caller
  -> managed Twilio number
  -> signed exact-destination CallCommand ingress
  -> trusted number/account/tenant/agent/workflow resolution
  -> atomic tenant concurrent-lane admission
  -> fixed TLS SIP route to OpenAI Realtime
  -> signed OpenAI incoming-call acceptance and isolated sideband controller
  -> permitted tenant workflow actions
  -> terminal call reconciliation, append-only usage, call history, and lane release
```

The Twilio implementation follows the provider's current subaccount, available local/toll-free number, IncomingPhoneNumber update/delete, and webhook-signature contracts. A search result is not treated as a reservation. Provisioning always attempts the exact selected E.164 number and maps a provider inventory conflict to a safe refresh response.

## Tenant and provider authority

- OperatorOS identity, session, selected tenant, membership, role, CallCommand entitlement, Stripe customer, subscription, and audit remain authoritative.
- The browser cannot supply tenant, role, entitlement, plan, effective-lane, or provider-account authority.
- One persisted `callcommand_telephony_accounts` row maps a tenant to its Twilio subaccount. Creation runs under a tenant advisory lock and reuses the existing row.
- Parent and subaccount credentials stay behind the shared encrypted secret-reference boundary. API responses expose only safe status and masked identifiers.
- Provider account and number SIDs are resource references, never authorization tokens.
- Managed-number channels require a tenant telephony account and an explicit `local` or `toll_free` type.
- Incoming Twilio requests are signature-validated before the exact `To` number and provider mapping resolve the tenant. Payload tenant IDs are not trusted.
- Tenant-composite profile and flow foreign keys prevent a number order from assigning another tenant's agent or workflow.
- MSP-routed numbers remain outside the general commercial path.

## Number search and onboarding

The customer setup surface offers:

1. **Get New Number** — current US local or toll-free inventory with area code, locality, region, postal code, and contained-digit filters.
2. **Forward Existing** — a durable carrier-forwarding plan without claiming external completion.
3. **Connect Provider** — explicit Twilio transfer, SIP/PBX, or porting plans with provider-dependent instructions.

Managed search returns only voice-capable inventory without exposing Twilio implementation details. The provisioning request requires an explicit recurring-provider-charge acknowledgment and a stable idempotency key.

Agent/workflow onboarding is server-owned:

- zero active general agents: create **AI Receptionist**;
- one active general agent: select it;
- multiple active general agents: require customer selection;
- zero active published general workflows: create and publish a validated **General Reception** route;
- one active published general workflow: select it;
- multiple active published general workflows: require customer selection.

The assigned profile and active flow are persisted on the number channel, not held only in React state.

## Durable provisioning saga

The lifecycle is explicit:

`REQUESTED -> PROVISIONING -> PROVIDER_PROVISIONED -> CONFIGURING_ROUTING -> CONFIGURING_BILLING -> TESTING -> ACTIVE`

Recoverable/terminal states are:

`PROVISION_FAILED`, `ROUTING_FAILED`, `BILLING_FAILED`, `ACTION_REQUIRED`, `SUSPENDED`, `RELEASE_PENDING`, `RELEASED`, and `RECONCILIATION_REQUIRED`.

Key recovery behavior:

- The durable order is created before provider acquisition and binds tenant, subaccount, E.164 number, number type, agent, workflow, projected billing quantities, and a request hash.
- An exact replay is resolved before billing projection or any provider call. A changed payload with the same key fails with an idempotency conflict.
- A retryable/ambiguous provider timeout lists the exact tenant subaccount inventory and recovers the exact requested number if acquisition actually succeeded. It does not purchase a second number.
- Provider ownership is persisted before health and activation.
- If the provider confirms acquisition but the local channel write fails, the order and reconciliation issue retain the provider number SID and safe recovery facts. The number is not forgotten or reported as absent.
- Routing or health failure retains the provider resource and enters a retryable reconciliation state.
- Raw provider exceptions and credentials are not returned to the browser.

## Billing model

CallCommand billing remains four independent concerns:

1. base CallCommand module subscription;
2. managed phone-number quantities;
3. concurrent AI-call lane quantities;
4. recorded telephony/AI usage.

Managed-number catalog defaults are configuration values, not scattered UI constants:

- first active US local number: included;
- additional local number: default display/catalog amount 500 USD cents per month;
- toll-free number: default display/catalog amount 800 USD cents per month.

Stable number keys:

- feature: `managed_phone_numbers`;
- local entitlement: `callcommand.additional_local_numbers`;
- local lookup key: `operatoros_callcommand_additional_local_number_monthly_v1`;
- toll-free entitlement: `callcommand.toll_free_numbers`;
- toll-free lookup key: `operatoros_callcommand_toll_free_number_monthly_v1`.

Additional local and toll-free quantities use one dedicated Stripe subscription with separate licensed subscription items where needed. Provider acquisition is refused until the required quantity is settled by the canonical signed Stripe webhook. Checkout/update is only a pending projection; it does not grant capacity. Invoice success settles licensed quantities. Invoice failure starts a bounded grace period. Grace expiration suspends paid service and creates an admin-visible reconciliation issue but does not release the provider number. Subscription deletion suspends paid lines and clears the dedicated number-subscription identifiers without relinquishing numbers.

Concurrent lanes remain in the separate `operatoros_callcommand_concurrent_lane_monthly_v1` entitlement. Number count never grants call concurrency.

## Health, repair, reconciliation, and release

Activation requires provider ownership, active subaccount, voice capability, exact allowed HTTPS POST routing, agent, published workflow, tenant/module authority, usable number billing, and Realtime provider configuration. Missing facts display an action-required state rather than Online.

Number management supports:

- provider health inspection;
- exact expected-versus-actual routing comparison;
- safe automatic routing repair for OperatorOS-managed numbers only;
- provider inventory reconciliation;
- provider-orphan detection without automatic release;
- database-number-missing-at-provider detection;
- routing drift detection/repair;
- stale provisioning/release operation detection;
- number-billing quantity mismatch detection;
- payment-grace expiration and non-destructive suspension;
- admin-visible reconciliation issues and fleet counters.

Removal is a two-stage operation. A confirmed request pauses the line and schedules `RELEASE_PENDING` after the configurable recovery hold. It can be canceled before execution; cancellation returns the line to `ACTION_REQUIRED` until a fresh health check or automatic repair confirms that provider and billing facts are still valid. Execution requires a second explicit confirmation after the hold, releases the exact provider SID, then records `RELEASED`, preserves calls/audit/history, and requests the lower Stripe quantity. Stripe quantity is not reduced before provider release is confirmed. Provider failure leaves a diagnosable pending/reconciliation state.

Tenant hard-delete is blocked while any managed provider number is not `RELEASED`, preventing a local delete from orphaning a billable Twilio resource.

## Production environment contract

Required CallCommand production variables:

- `OPENAI_API_KEY`
- `OPENAI_PROJECT_ID`
- `OPENAI_WEBHOOK_SECRET`
- `CALLCOMMAND_SIP_ROUTE_SECRET`
- `CALLCOMMAND_REALTIME_MODEL`
- `TWILIO_PUBLIC_BASE_URL`
- `TWILIO_VERIFY_SERVICE_SID`
- either `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER`, or the supported bound Replit Twilio connector inputs
- `STRIPE_PRICE_CALLCOMMAND_CONCURRENT_LANE_MONTHLY`
- `STRIPE_PRICE_CALLCOMMAND_ADDITIONAL_LOCAL_NUMBER_MONTHLY`
- `STRIPE_PRICE_CALLCOMMAND_TOLL_FREE_NUMBER_MONTHLY`

Optional bounded catalog/policy controls:

- `CALLCOMMAND_LANE_PRICE_CENTS` (default 4900)
- `CALLCOMMAND_LOCAL_NUMBER_PRICE_CENTS` (default 500)
- `CALLCOMMAND_TOLL_FREE_NUMBER_PRICE_CENTS` (default 800)
- `CALLCOMMAND_NUMBER_RELEASE_HOLD_HOURS` (default 24, bounded in code)
- `CALLCOMMAND_NUMBER_BILLING_GRACE_DAYS` (default 7, bounded in code)

The shared production core, Stripe secret/webhook, database-release, exact-host, proxy, and encryption variables remain required by their existing OperatorOS profiles. Secrets must be configured in the deployment provider; they must not be committed.

## Source/local verification on 2026-08-31

- `corepack pnpm typecheck`: PASS for API, runner gateway, web, and TorqueShed native.
- all `apps/api/test/callcommand*.test.ts` with `--test-concurrency=1`: **162/162 PASS**, zero failures/skips, across 21 files using the disposable PostgreSQL database and mock provider.
- commercial web contract: **6/6 PASS**.
- release/environment contracts: **13/13 PASS**.
- `corepack pnpm db:plan`: release v58, 58 ordered non-destructive steps.
- `corepack pnpm db:apply` followed by immediate reapply on disposable PostgreSQL: PASS/PASS, verified in 1893 ms and 1837 ms in the final run.
- `corepack pnpm build:production`: PASS; deployment scope PASS, FaultlineLab 4/4, all workspace typechecks/builds PASS, 35/35 Next pages generated.
- `corepack pnpm preflight:production -- --callcommand-ready`: expected FAIL CLOSED because production core values and live OpenAI, Twilio/Verify, and three CallCommand Stripe price IDs were not configured in this local shell. No secret value was printed.

There is no repository-defined lint or formatting script, so no lint pass is claimed.

## First controlled live acceptance

This procedure purchases a recurring provider resource. Perform it only after explicit cost approval and after backup/deployment/release-v58 gates are complete.

1. Configure the production core and CallCommand variables above in the deployment secret manager.
2. In Twilio, verify the parent account can create subaccounts and buy the intended US local/toll-free number type. Complete required business/regulatory verification.
3. In Stripe, create the additional-local, toll-free, and concurrent-lane recurring Prices; set the three exact Price IDs; enable the canonical signed billing webhook events used by subscriptions and invoices.
4. In OpenAI, use the production project ID/API key, configure the signed Realtime incoming-call webhook, and confirm the selected Realtime model is available to that project.
5. Back up the production database using `docs/DATABASE_BACKUP_RESTORE.md`.
6. Review `corepack pnpm db:plan`, set `OPERATOROS_DATABASE_RELEASE_MODE=apply`, deploy through the readiness-gated unified runtime, and confirm `/healthz` and `/readyz`.
7. Run `corepack pnpm preflight:production -- --callcommand-ready`; require PASS.
8. Sign in as an authorized test-tenant administrator and confirm CallCommand entitlement.
9. Open **CallCommand -> Set up CallCommand -> Get New Number**.
10. Search a real approved US area code or toll-free inventory and confirm 10-20 current voice-ready results appear.
11. Choose one number, explicitly approve the recurring provider charge, and complete Stripe Checkout if the number is not the included first local number.
12. Confirm provisioning creates/reuses exactly one tenant Twilio subaccount and returns one active number; retry the same browser action once and confirm no second provider number appears.
13. Select or create **Main Receptionist** and select or create **General Reception**.
14. Require the number page to show `ACTIVE`, healthy provider routing, included/active billing, assigned agent/workflow, and Online readiness.
15. Call the number from an external cellular phone.
16. Confirm the correct tenant business greeting/context, selected AI receptionist, and published workflow are used.
17. Trigger one permitted test workflow action and confirm its tenant-scoped result/audit evidence.
18. End the call and confirm Call History contains the provider call reference, called number, agent, workflow, duration, outcome, timeline, and policy-permitted transcript/recording state.
19. Confirm the append-only usage record and lane release, including no remaining active lane after terminal reconciliation.
20. In the super-admin infrastructure view, confirm the subaccount, local/toll-free count, active number/call count, provider failure state, billing alerts, and reconciliation counters.
21. In Twilio, confirm the number belongs to the exact tenant subaccount and the voice/status callbacks are the expected HTTPS POST endpoints.
22. In Stripe, confirm additional-local/toll-free licensed quantities match the OperatorOS effective quantities. Confirm the base CallCommand subscription and concurrent-lane item remain separate.
23. Run CallCommand reconciliation first without repair; require zero provider orphans, missing-provider rows, stale operations, routing drift, and billing mismatches.
24. Deliberately change a test number callback in Twilio, confirm routing drift is detected, run safe auto-repair, and confirm the expected callback is restored with an audit event.
25. Test release only when the number is disposable: schedule it, verify it remains provider-owned during the hold, cancel once, then reschedule and execute after the hold with final confirmation. Confirm provider release precedes Stripe quantity reduction and history remains.

Passing these steps establishes live/deployed evidence for the tested number and tenant. Source/local success alone does not establish public webhook delivery, SIP negotiation, carrier reachability, model availability, real Stripe settlement, or production operations.
