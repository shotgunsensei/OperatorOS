# CallCommand AI: tenant setup investigation and implementation

Date: 2026-09-10. Branch: `codex/callcommand-guided-setup`, based on `b14e94a`.
Status: **LOCAL IMPLEMENTATION; DEPLOYED/PROVIDER ACCEPTANCE OPEN**.
Delivery authorization was granted after the investigation: commit, PR to main,
Replit pull, and publish. Follow `docs/CURRENT_RELEASE_GATE.md` for the current
delivery gate. The local evidence below is historical to the investigation;
exact scoped-commit CI and production evidence are recorded separately.
The pre-existing module clarity/security work remains in this checkout and is
excluded from the scoped CallCommand PR. Provider purchases, live Stripe catalog
changes, and successful-call acceptance are not inferred from publish authority.

## Finding

CallCommand already had substantial real infrastructure: OperatorOS auth and
entitlements, tenant Twilio subaccounts, managed-number search/acquisition,
encrypted provider credentials, SIP/Realtime call handling, workflows, number
subscriptions, concurrency limits, audit, reconciliation, and staged release.
The weakest part was connecting these capabilities into a reliable first-use
experience. The original setup exposed six technical stages, lost the number
selection around checkout, and could report readiness before AI answering was
enabled. Several billing and recovery edge cases also needed correction.

This change implements the primary path for an entitled organization's owner
or administrator. It uses persisted business configuration and purchase intent,
the existing provider adapter, central billing, and server authorization.
Customer setup does not require a Twilio account, an OpenAI account, API keys,
model selection, SIP configuration, or pasted webhook URLs.

## The tenant's three steps

1. **Your business.** Enter the business name and information callers need.
   OperatorOS supplies an AI-disclosing greeting unless customized, a voice,
   grounded receptionist instructions, and a published follow-up task workflow
   for a new business. Existing receptionists/workflows can be selected when
   there is more than one; custom workflows are preserved.
2. **Your number.** Search US local or toll-free voice inventory, choose an exact
   number, and review its monthly price. The server saves that selection and
   consent before billing. Included capacity proceeds to acquisition; extra
   capacity goes through OperatorOS-managed Stripe checkout or a subscription
   quantity update. Successful signed payment settlement is required before
   purchasing a number beyond licensed capacity.
3. **Start answering.** Returning from billing restores the saved selection and
   checks progress automatically. OperatorOS creates/reuses the tenant provider
   account, acquires the number once, configures routing, binds the receptionist
   and workflow, and checks the line. The tenant enables answering and calls the
   displayed business number. A completed real AI call is tracked separately
   from configuration readiness.

Advanced setup remains collapsed below this path for existing-number forwarding,
provider connections, custom routing, transfers, and other established controls.
The first-use path concerns new US numbers; porting and international regulatory
onboarding are not represented as instant self-service.

## Number prices and billing behavior

These are **current repository defaults**, not verified live Stripe prices or a
newly approved commercial price list. Configured number prices must match active
USD monthly licensed Stripe Prices before checkout/update proceeds.

| Item | Default | Boundary |
| --- | ---: | --- |
| First managed local number | Included | Requires existing CallCommand entitlement |
| Each additional local number | $5/month | Separate licensed number quantity |
| Each toll-free number | $8/month | No included toll-free number |
| First concurrent AI call | Included | Concurrent capacity, independent of number count |
| Each additional concurrent call lane | $49/month | Existing separate lane add-on |
| Base CallCommand access | Existing OperatorOS offer | Existing platform/companion entitlement policy |
| Carrier and AI usage | Separate commercial decision | Cost ledger exists; complete tenant usage invoicing is not established |

Number subscriptions remain centrally controlled by OperatorOS. Where an active
tenant base subscription provides a Stripe customer, that customer is reused;
the number entitlement retains its own subscription/customer association.
This does **not** consolidate all subscriptions into one invoice or align every
billing anniversary. Initial paid-number setup can require Stripe checkout;
later quantity updates use the subscription and can require payment
authentication. Payment credentials remain with Stripe.

## Corrections implemented

| Problem found | Implemented correction and evidence boundary |
| --- | --- |
| Selected number lost on checkout return | Durable tenant setup order stores number, assignment, reviewed price, consent, expiry, billing response, and channel association. Reload/return resumes that order. |
| Retry or a new request key could create another checkout | Tenant purchase locks, shared persisted idempotency, and reuse of an existing compatible pending checkout. Changed requests fail explicitly. |
| Displayed cost could differ from Stripe | Revalidate the saved price before purchase and validate Stripe's active amount/currency/monthly licensed recurrence before charging. |
| Unsupported fields in Stripe pending updates | Move subscription metadata/cancellation updates out of the pending quantity update; expose hosted invoice authentication when returned. Applies to managed numbers and the existing lane update path. |
| Modern invoice metadata missed central routing | Recognize `parent.subscription_details.metadata` and its subscription identifier. |
| Requested metadata/proration lines could grant the wrong quantity | Settle using the current Stripe subscription's actual Price items, only against its latest paid invoice without an outstanding pending update. |
| Out-of-order/duplicate/unrelated events affected paid lines | Serialize tenant billing writes, bind subscription/customer, reject stale/duplicate events, and only change channels after the entitlement write succeeds. Subscription observation does not undo settled payment. |
| Failed upgrade could interrupt already-paid service | Distinguish pending-upgrade payment failure from renewal failure; preserve paid capacity. Grace retries retain the original expiry. |
| Number quantity reduction while provider resources still existed | Require confirmed release before allowing a quantity below provider-owned inventory. |
| New receptionist had a route-only default workflow | New default workflow creates a real tenant follow-up task. Existing custom workflows are preserved. |
| Caller might wait in silence | Start one initial Realtime response on the first sideband connection; do not repeat the greeting on resume or allow greeting-time tool execution. |
| Transcript callbacks lacked requested transcription | Request input transcription only when the existing consent/persistence policy allows it. Recording/consent rules are not relaxed. |
| Readiness combined facts from different numbers | Aggregate configuration readiness now requires a single eligible line with active profile, published flow, usable billing, provider health, and Realtime readiness. |
| Unpaid/releasing line could be selected for activation | Recheck exact channel lifecycle and number billing inside activation. |
| Repaired setup remained unfinished | Successful activation marks its persisted setup order complete. |
| Twilio application/trunk could override apparently correct URLs | Provider health detects these overrides; managed routing repair clears them before checking the result. |
| Repair could bypass a scheduled release | Exclude `RELEASE_PENDING` numbers from repair until release is explicitly canceled. |
| Business number could not be dialed from setup | Expose the owned business line as `dialNumber` for the test-call link. Caller-number privacy remains separate. |

The Stripe changes follow its [pending-update supported attributes](https://docs.stripe.com/billing/subscriptions/pending-updates?locale=en-GB).
Twilio documents the application/trunk precedence on the [IncomingPhoneNumber resource](https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource).
The repository's default model, `gpt-realtime-2.1-mini`, currently supports SIP
and function calling according to the [official model reference](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini).
Availability to the actual production OpenAI project remains to be tested.

## Remaining product and operational gaps

- **No live call certification yet.** Local provider doubles prove application
  decisions; they do not prove carrier reachability, SIP negotiation, actual
  model speech/tool execution, webhook delivery, payment authentication, or
  subscription settlement in the deployed accounts.
- **Usage charging needs a defined offer and implementation acceptance.**
  Current cost estimates use aggregate token counts with model audio rates;
  they do not distinguish every text/audio/cached billing category. The new
  optional transcription also has provider cost. No new customer usage rate,
  included-minute allowance, metered Stripe product, or spending commitment is
  invented here. Reconcile provider usage, define allowance/overage/spend caps,
  and prove exact-once tenant usage invoices before advertising automated
  consumption billing or unlimited calls.
- **Checkout continuation is page driven.** It resumes while the setup page is
  open or when an authorized administrator returns. The order survives a closed
  browser, but this change does not add a background acquisition worker that
  completes provisioning while every administrator is offline. Automatic polling
  is bounded to approximately two minutes; manual Check progress can resume it.
- **Inventory is not reserved during checkout.** If another buyer takes the
  selected number, the tenant chooses a replacement using already-paid capacity.
  Ambiguous provider results require reconciliation before another purchase.
- **Expired/changed pending checkout can need support.** Compatible pending
  checkout is reused; incompatible or expired checkout is blocked to avoid a
  second subscription. A fully automated checkout expiration/cancellation and
  refund workflow is not included. Canceling a selection does not cancel paid
  number capacity, and the UI says so.
- **Long-lived call operations require deployment proof.** The configured Replit
  surface is Autoscale and the sideband controller is process-local. Database
  capacity leases exist, but cold starts, scale-down, process death, reconnection,
  tool delivery, and lane cleanup must be exercised on the target deployment.
- **Platform onboarding happens once.** Twilio parent capabilities, account
  funding/compliance, the OpenAI project/webhook, central Stripe Prices/webhooks,
  and server encryption must be prepared by OperatorOS operations. Tenants
  should never be asked to configure these providers themselves.

## Schema, compatibility, and rollback

Release **v61/61** appends `callcommand_guided_setup`; the first 60 ordered steps
remain intact. `callcommand_setup_orders` has tenant composite foreign keys to
profiles/flows/channels, tenant-scoped idempotency, bounded amounts/statuses,
consent/expiry/audit timestamps, and a pending-order index. The supported release
runner verifies the table and all three validated composite foreign keys.
No child schema or persistent developer/production database was used.

Before an approved production cutover, follow
[DATABASE_BACKUP_RESTORE.md](../DATABASE_BACKUP_RESTORE.md), review `db:plan`, and
apply through the supported release/supervisor path. Do not leave
`OPERATOROS_DATABASE_RELEASE_MODE=apply` in the production supervisor environment.
Rollback must use a reviewed compatible artifact/database plan; do not drop the
purchase-intent ledger or erase Stripe/provider ownership. A code rollback does
not cancel subscriptions, release phone numbers, or remove provider resources.

## Verification record

Windows PowerShell; Node 24.16.0; pnpm 10.34.5; PostgreSQL 16 in task-owned
container `operatoros-callcommand-setup-test`, bound only to `127.0.0.1:55438`.
Synthetic disposable databases: `operatoros_callcommand_test` and
`operatoros_callcommand_clean_test`. Test processes strip external provider
environment and use non-production secrets. The browser harness starts compiled
artifacts through `start-unified-runtime.mjs`, disables the runner, and maps
canonical hosts only to a local TLS proxy.
The harness stopped its runtime/proxy, and the task-owned disposable database
container was stopped after verification. No local preview service was left running.

| Check | Result |
| --- | --- |
| All `apps/api/test/callcommand*.test.ts` plus release contract, forward-commerce, billing ordering/dead-letter, and production-preflight tests, serial in disposable PostgreSQL | **209 passed, 0 failed, 0 skipped**, final run 81,141 ms |
| Help and release identity/runtime verifier after updating v61 expectations | **17 passed, 0 failed, 0 skipped** |
| `node --test apps/web/e2e/callcommand-commercial-contract.test.mjs` | **6 passed, 0 failed, 0 skipped**; existing repair wording expectation updated to the current UI |
| `corepack pnpm build:production`, `INTERNAL_API_URL=http://127.0.0.1:5001` | Pass: deployment scope, 4 FaultlineLab checks, all four workspace typechecks, API/runner builds, 35 Next pages |
| `corepack pnpm lint` | Pass, zero warnings; current package defines the command despite historical documentation saying otherwise |
| Supported `db:apply` on clean disposable PostgreSQL, immediate reapply, then `db:verify` | Pass / pass / pass; **v61/61**, first clean apply 30,241 ms, reapply 2,152 ms, verify 1,155 ms |
| Compiled production supervisor plus local TLS browser test | **3 passed, 0 failed/skipped**, 21.8 seconds; real persisted business setup at 1440/390px, plus explicitly synthetic paid-number return/activation fixture |
| Accessibility and layout within those browser tests | Zero selected WCAG A/AA violations in the guided form at both widths; no horizontal page overflow |
| `git diff --check` | Pass |
| `node scripts/phase39/security-scan.mjs` | Pass: 4,328 files, zero findings, complete dependency audit, zero unresolved advisories; two existing patched high-severity advisory records remain disclosed |
| `corepack pnpm preflight:production -- --callcommand-ready` in this local shell | Fail closed on absent production/provider configuration; does not describe deployed secret configuration |
| Public read-only `https://operatoros.net/readyz` on 2026-09-10 | Ready, commit `f864bed869372fed3c1295b7ca048f06ac7a9a65`, build `570ecdc6285790ae91f1333e`, database **v60/60**. This v61 candidate is not deployed. |

Reproducible focused commands from the repository root (using only an explicitly
isolated test database and test-only secrets):

```powershell
$testFiles = @(rg --files apps/api/test -g 'callcommand*.test.ts') + @(
  'apps/api/test/database-release-contract.test.ts',
  'apps/api/test/commerce-forward-model-static.test.ts',
  'apps/api/test/billing-out-of-order.test.ts',
  'apps/api/test/addon-billing-dlq.test.ts',
  'apps/api/test/production-env-preflight.test.ts')
corepack pnpm exec tsx --test --test-concurrency=1 @testFiles
corepack pnpm exec tsx --test --test-concurrency=1 apps/api/test/help-center-contract.test.ts apps/api/test/phase15-release-identity.test.ts apps/api/test/production-runtime-verifier.test.ts
corepack pnpm lint
$env:INTERNAL_API_URL='http://127.0.0.1:5001'
corepack pnpm build:production
# Isolated disposable database only; never set this for the production supervisor.
$env:OPERATOROS_DATABASE_RELEASE_MODE='apply'
corepack pnpm db:apply
corepack pnpm db:apply
corepack pnpm db:verify
```

Executed Node/tsx entrypoints used the task-local wrapper
`output/callcommand-investigation/verify.mjs` to strip external-provider
environment and bind the disposable database. Browser command:
`node output/callcommand-investigation/verify.mjs browser-final output/callcommand-investigation/browser.mjs`.
The browser fixture for paid-number return is explicitly simulated; real Stripe
settlement logic is tested separately against the disposable database and SDK
doubles. No real phone number was purchased and no live AI call was placed.

Logs are in `output/callcommand-investigation/`: `regression-complete.log`,
`help-release.log`, `build-final.log`, `lint-final.log`, `db-clean-apply.log`,
`db-clean-reapply.log`, `db-clean-verify.log`, `browser-final.log`, and
`preflight-local.log`. Screenshots: `guided-setup-1440.png`,
`guided-setup-390.png`, `guided-number-pricing-1440.png`,
`guided-number-pricing-390.png`, and `guided-activation-synthetic.png`.

Early verification found and corrected source-location expectations after the
provisioning refactor, old route-only/default readiness assertions, v60 release
fixtures, and a browser label locator that included a textarea's saved text.
The final results above are fresh reruns, not skipped or reclassified failures.

The existing broad API/UX results in older reports are historical and are not
claimed as fresh whole-repository certification for this change. The new browser
spec is included in the regular `test:e2e` harness for future runs.

## Platform-owned launch handoff

| Owner | Concrete action | Completion evidence |
| --- | --- | --- |
| OperatorOS operator | Set existing core auth/database/exact-host/encryption configuration and verify CallCommand entitlement | Production preflight passes; owner/member/foreign-tenant access behaves correctly |
| OperatorOS operator | Configure `OPENAI_API_KEY`, `OPENAI_PROJECT_ID`, `OPENAI_WEBHOOK_SECRET`, `CALLCOMMAND_SIP_ROUTE_SECRET`, `CALLCOMMAND_REALTIME_MODEL`; register the signed incoming-call webhook | Actual project accepts the intended SIP call and verified incoming event |
| OperatorOS operator | Configure `TWILIO_ACCOUNT_SID`, primary `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_PUBLIC_BASE_URL`, and `TWILIO_VERIFY_SERVICE_SID` for supported transfer verification, or the documented bound connector | Parent can create/reuse tenant subaccount, acquire approved inventory, and deliver signed HTTPS voice/status callbacks |
| OperatorOS operator | Configure central Stripe key/webhook/mode and `STRIPE_PRICE_CALLCOMMAND_ADDITIONAL_LOCAL_NUMBER_MONTHLY`, `STRIPE_PRICE_CALLCOMMAND_TOLL_FREE_NUMBER_MONTHLY`, `STRIPE_PRICE_CALLCOMMAND_CONCURRENT_LANE_MONTHLY` | Active approved Prices match displayed amounts; actual checkout and latest paid invoice grant exact quantities once |
| John / commercial owner | Approve the number/lane offer plus a separate usage allowance, overage, and spend-cap policy | Published customer terms match enforced billing and observed provider costs |
| Release operator, after authorization | Back up, release v61 through the standard path, and verify exact commit/build/database in `/readyz` | Reviewed backup/restore evidence, healthy exact release, authenticated deployed setup |
| Release operator and test tenant owner, after cost authorization | Run the controlled pilot below with synthetic business information and approved disposable numbers | Carrier call, action, invoice, inventory, audit, and release evidence all reconcile |

Secrets belong in the deployment secret manager, never in chat or this report.
No additional environment variable is introduced by guided setup.

The controlled pilot should cover the included local number, a second local
number, a toll-free number, first paid checkout, saved-payment upgrade, required
payment authentication, declined upgrade, duplicate return, current and stale
webhook delivery, unavailable inventory, routing repair, and release/cancellation.
For each active line, place a real external cellular call: verify the correct
business greeting, prompt first speech, grounded answers, consent behavior,
caller interruption, a real saved follow-up, call history, and released lane.
Test two simultaneous calls, capacity overflow, a longer call, and an application
restart. Verify one provider resource and exact billed quantities per order.
Never promote live readiness solely from a healthy configuration badge.

## Main changed files

- `apps/web/src/components/module-shells/CallCommandSetup.tsx` and `.module.css`:
  guided tenant journey, billing return, activation, recovery, and mobile UI.
- `CallCommandCommercialWorkspace.tsx`, `CallCommandRoute.contract.ts`,
  `apps/web/src/lib/auth.ts`, and Help guide: integrate the path and real APIs.
- `apps/api/src/routes/callcommand-commercial-routes.ts`: durable setup,
  shared provision operation, exact readiness, activation, and release guards.
- `apps/api/src/lib/callcommand-number-billing.ts`, `callcommand-lane-billing.ts`,
  `billing-service.ts`: central payment correctness and retry protections.
- `callcommand-realtime.ts`, `callcommand-realtime-routes.ts`,
  `callcommand-number-provider.ts`: first greeting, policy-bound transcription,
  and provider routing health/repair.
- `callcommand-setup-db-init.ts`, database release contract/runner, `_setup.ts`:
  additive durable state and disposable-test initialization.
- `apps/api/test/callcommand-guided-setup.test.ts`, affected billing/provider/
  Realtime/release tests, `apps/web/e2e/callcommand-guided-setup.spec.ts`, and the
  browser harness: executable regression coverage.

Related existing detail: [managed-number lifecycle](MANAGED_NUMBER_PROVISIONING.md)
and [commercial runtime architecture](CALLCOMMAND_COMMERCIAL_RUNTIME_ARCHITECTURE.md).
