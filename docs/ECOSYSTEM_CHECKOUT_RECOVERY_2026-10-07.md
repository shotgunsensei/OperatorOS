# Commercial checkout recovery and CallCommand continuation

## Current checkpoint

The later `cde70cef` PR release run `37655864318` and standalone run
`37655910611` both finish **13/14 scopes**. Their sole failure is an existing
named-outcome static assertion expecting the former literal platform workflow
path. API records **1,610 passed / 1 failed / 0 skipped**; integration **108/108**,
unit **52/52**, exact-host browser **34/34** and visual **4/4** pass. The two
assertions now require the host-aware route helper and encoded workflow key.
Focused static checks pass **13/13** in **506.9441 ms**, with zero
fail/cancel/skip/todo; the full API rerun is in progress on the same owned
disposable database. Failed logs remain under `build/launch/`. No product
logic, authorization, schema or billing behavior changes in this correction.
Updated exact-head CI remains a publication gate.

OpenAI lists the owner-created restricted **OperatorOS production runtime**
key as active, expiring October 7, 2027. The initial Shell binding check did
not match it; the owner then saved the key directly and the closed form was
verified. The refreshed Shell now matches the new key. Read-only model
discovery returns **200 / gpt-realtime-2.1-mini**, and deliberately missing-file
transcription validation returns **400 / invalid_request_error**, not 401/403.
This verifies runtime binding/authentication and request validation only; no
inference, transcription or call was performed. A Shell reconnect retained earlier
routing output in its accessibility snapshot, so a secure replacement remains
required; no credential value is recorded here. The earlier key-creation-pending checkpoint
below is historical; no credential value is recorded in this document.

The `9405fae1` PR release run `37651363364` and standalone run `37651361980`
now both pass **14/14 scopes**:
API **1,608/1,608**, integration **108/108**, unit **52/52**, exact-host browser
**33/33**, and visual **4/4**. The final browser result has no retry. This
accepts the checkout-recovery candidate only; the subsequent module-session
workflow repair below requires its own exact-head CI before publication.

**SOURCE CANDIDATE / LOCAL RECOVERY PASS / EXACT-HEAD CI REQUIRED / PROVIDER
CONFIGURATION IN PROGRESS**. Publication remains explicitly authorized by the
owner. This record supplements the [October 6 publication evidence](ECOSYSTEM_PUBLICATION_2026-10-06.md);
it does not promote unperformed provider or tenant acceptance.

The resumed workspace starts at `5b50b2cadd815ba1c6de1af79deb04e8971af0b4`.
The owner committed the pending checkout UI patch in `d0e3e213`; the two later
Replit deployment metadata commits are preserved. The unrelated sales kit
files included in that owner commit are preserved without modification.

## Customer defect and recovery

Live Stripe Checkout correctly showed TechDeck $99/month, an additional
companion $29/month, and one additional seat $15/month, for $143/month.
Returning through **Back to OperatorOS** reached
`https://app.operatoros.net/pricing?billing=canceled`. The unpaid record was
`incomplete`, with no settled paid capacity. The pricing UI nevertheless
disabled checkout as **One Flagship Already Active**, and billing labeled the
additional companion **Paid**. The API already supports authoritative safe
resume of an open checkout; the UI prevented the customer from using it.

The patch restores the exact server-owned pending selection through
`pendingStackSelection`, shows **Resume Secure Checkout**, and locks cart
controls while that checkout is pending. Billing pages link the owner back
to recovery and label the companion **Payment pending**. An invalid projection
fails closed. Existing paid flagship and non-owner gates stay closed. Browser
state grants no entitlement; the API still revalidates the tenant, original
selection and live Stripe Price contracts, and signed settlement remains the
only source of paid access and capacity.

Affected files are `apps/web/src/lib/application-stack-checkout.ts`,
`PricingSection.tsx`, `BillingPage.tsx`, `TenantBillingPage.tsx`,
`apps/api/test/application-stack-checkout-recovery.test.ts`, and
`apps/web/e2e/audience-lanes.spec.ts`. This continuation also aligns the billing
button's disabled appearance with its existing pending non-owner gate.

## Fresh verification and retained failures

All tests use the disposable PostgreSQL 16 container
`operatoros-checkout-recovery-20261006`, bound only to `127.0.0.1:55476`, database
`operatoros_checkout_test`. No tests or migrations target production or
persistent developer data. External provider credentials are removed from
the test environment. The supported release apply previously initialized this
disposable database to v65/65 in 27,077 ms.

Commands from the repository root on Windows/PowerShell:

```powershell
corepack pnpm --dir apps/api exec tsx --test test/application-stack-checkout-recovery.test.ts test/commerce-forward-model-static.test.ts test/forward-commerce-contract-static.test.ts test/marketing-pricing-shape.test.ts
$env:INTERNAL_API_URL='http://localhost:5001'; corepack pnpm build:production
. ./build/launch/CheckoutRecoveryEnvironment.ps1
$env:PARITY_BROWSER_GREP='an unpaid Stack resumes'
node scripts/parity/run-browser-tests.mjs --suite e2e
corepack pnpm lint
git diff --check
```

- Focused contracts: **28/28**, zero fail/cancel/skip/todo, 316.4572 ms.
- Production build: exit 0, four workspace typechecks and production artifacts
  pass; Next.js 15.5.25 generates all 38 pages.
- Corrected exact-host browser recovery case: **1/1**, 6.5 seconds, first attempt,
  no retry. Real central registration/login and host-bound SSO run on the local
  production supervisor/TLS proxy. The billing projection/provider availability
  and checkout POST are explicitly synthetic; no Stripe call or charge occurs.
- Whitespace check: exit 0.
- Repository ESLint gate: exit 0, zero warnings.

The inherited head's release run `37522765941` failed its browser scope: the
new case used a local-only login helper on the production host harness and
received `AUTH_HOST_NOT_ALLOWED`. It recorded 31 clean browser passes, one
separate route-control retry, and one failed recovery case; other scopes
passed. This continuation uses the real central browser sign-in flow.

The first local correction then failed because Playwright's `route.fetch`
does not inherit Chromium's hostname-to-loopback mapping; its fixture reads
returned no local tenant projection. All fixture reads now explicitly use the
loopback TLS proxy with the original Host header. The first failure is retained
in `build/launch/checkout-recovery-browser-20261007.log`, and the clean result
in `build/launch/checkout-recovery-browser-local-20261007.log`. No API authority,
host policy, retry budget or assertion was relaxed. Fresh exact-head CI remains
required before publishing this candidate.

## Live checkout and provider progress

The Chrome extension overlay was cleared. Fleet credits open live Stripe
Checkout at **$50 for 500,000 credits**. Back navigation returns to the selected
Torque Assist diagnostic. Roadside $5 and Workshop $15 were already observed.
No payment was submitted; the balance stays zero. Combined Stack and Fleet
screenshots are retained under `build/launch/`, without committing private
checkout URLs or diagnostic identifiers.

The signed-in OpenAI organization is **Shotgun Ninjas Productions** and the
existing project is **OperatorOS**, `proj_MV9PXWXSZkaAaqrxGSUcYEC9`. Following
the owner's specific confirmation, the project webhook
**OperatorOS CallCommand incoming calls** was created for only
`realtime.call.incoming`, at
`https://api.operatoros.net/v1/modules/callcommand-ai/openai/realtime/incoming`.
The owner saved `OPENAI_WEBHOOK_SECRET` in Replit; the masked row was verified.
No secret is recorded here. The saved project/model bindings in source are
`OPENAI_PROJECT_ID` and `CALLCOMMAND_REALTIME_MODEL=gpt-realtime-2.1-mini`.

The owner saved `CALLCOMMAND_SIP_ROUTE_SECRET`; the masked row and refreshed
runtime shape check were verified. A one-time handoff screenshot inadvertently
included that routing credential. That local screenshot was removed and a fresh
replacement was generated directly in the project Shell, without reading or
recording its value. Owner entry/submission of the replacement remains pending.

The linked account-level `OPENAI_API_KEY` overrode the project's own secret.
Only that binding to this project was unlinked, preserving the global account
secret and other applications. Both the original effective credential and the
project credential returned **401 / invalid_api_key** on read-only model
discovery, including the explicit OperatorOS project header. A restricted,
365-day project runtime-key form is prepared for the owner's specific
access-creation confirmation and direct secret-save handoff. No new runtime
key has been created. Published provider readiness, signed events and controlled
call acceptance remain open. A configured shape check is not successful provider
authentication, and no real call or charge was initiated.

## Module-session workflow repair

Authenticated module sessions correctly reject platform-only data-fabric
URLs. `OutcomeWorkflowAction` used those platform URLs from module domains,
so readiness, submission and polling could fail even when the user had
valid access to both applications. This explains the observed diagnostic
preview access-check error.

The repair adds only readiness, submission and run-detail aliases beneath
`/v1/tenants/:tenantId/modules/:moduleId/data-fabric`. The existing session
ceiling binds the path to the sealed module and tenant. The alias forces that
module as the workflow source, rejects source substitution, and filters run
detail by the source module in addition to the trusted tenant. Existing service
checks retain source/destination entitlements, write/manager roles, source
visibility/version, signed events, delivery-time checks and idempotency.
Administrative activity, contracts, rules and replay have no module aliases.
Platform routes remain available to platform sessions. The browser selects
the alias from the canonical host registry; platform hosts retain their original
API paths. No session policy, schema or commercial entitlement was widened.

Focused isolated validation passes **37/37**, zero fail/cancel/skip/todo,
in **11,431.0848 ms**:

```powershell
. ./build/launch/CheckoutRecoveryEnvironment.ps1
corepack pnpm --dir apps/api exec tsx --test --test-concurrency=1 test/cross-module-data-fabric.test.ts test/cross-module-data-fabric-static.test.ts test/module-session-boundary.test.ts
$env:INTERNAL_API_URL='http://localhost:5001'; corepack pnpm build:production
corepack pnpm lint
```

The focused cases cover all ten contracts (both support source modules),
persistent native delivery and duplicate prevention, platform/foreign
tenant/module denial, source substitution, unrelated-source run hiding and
absence of module administration aliases. Production build/four workspace
typechecks and ESLint with zero warnings pass. The real module-session
browser workflow is included in the release harness. Fresh exact-host browser
acceptance passes **2/2** in **18.4 seconds**, without retry, through the
readiness-gated production supervisor and local TLS proxy:

```powershell
. ./build/launch/CheckoutRecoveryEnvironment.ps1
$env:PARITY_BROWSER_GREP='a module session creates native field proof|an unpaid Stack resumes'
node scripts/parity/run-browser-tests.mjs --suite e2e
```

The module journey uses real central sign-in, a sealed TradeFlowKit module
session, the native confirmation UI and real persistent delivery into
SnapProofOS. It proves 403 on the platform-only path, successful scoped
submission/polling, completed database state and two durable links, refresh
and manual resume without another POST, tenant-filtered platform activity,
and a 390-pixel viewport. The billing fixture remains synthetic and no external
provider is called. Logs are `build/launch/module-outcome-focused-20261007.log`,
`module-outcome-production-build-20261007.log`,
`module-outcome-lint-final-20261007.log` and
`module-outcome-browser-clean-20261007.log`.

Earlier local workflow attempts are retained. The first waited for readiness
after it had already fired on dashboard launch and incorrectly expected the
action on job detail. The next did not open the existing native disclosure.
Another expected automatic completion restoration rather than the current
review/confirm resume path; the corrected case proves that resume sends no new
submission. Repeated disposable sessions then reached the shared test-client
login limit; the fixture now uses a distinct synthetic client through the
existing trusted loopback proxy, as other release fixtures do. Authentication
limits remain enabled. The last older assertions used stale activity labels;
they now match the current customer-visible labels while database assertions
still require authoritative `completed` state. Superseded retries were stopped
where appropriate, and their logs are not accepted as passing evidence. No
authorization, retry budget, payment or persistence check was weakened.
The final clean browser result and fresh web typecheck/fixture ESLint pass;
updated exact-head CI remains required before publication.

## Remaining acceptance and rollback

Actual signed Stripe settlement, a paid non-admin tenant's onboarding/access,
all distinct flagship/companion cart mappings, managed-number/capacity payments,
controlled live voice/recording/transfer, recipient email delivery, tenant
provider integrations and OutCall activation remain open. The diagnostic's
cross-module previews also displayed an access-check error and require a
separate authenticated target check. OutCall remains coming soon; no feature
flag is promoted solely because its page renders or CI passes.

There is no schema change. Rollback restores the previous verified application
commit and its matching Torque Assist release pin, preserving production
database rows and saved provider secrets. Replit publication must leave database
copy/apply off, preserve all current secrets/configuration, set the credit
purchase expected commit to the exact tested serving candidate, and verify the
runtime identity and public production checks after promotion.
