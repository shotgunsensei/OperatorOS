# Commercial checkout recovery and CallCommand continuation

## Current checkpoint

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

`CALLCOMMAND_SIP_ROUTE_SECRET` entry remains a direct owner handoff at this
checkpoint. Existing effective API-key/project access, published provider
readiness and signed event/call acceptance still need verification. No new
OpenAI API key was created and no call was initiated.

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
