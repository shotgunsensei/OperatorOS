# Flagship landing pages and public pricing — local candidate

Historical record for preserved original commit `5e4c8c435405436eeef6fe33e27b13692c718a04`
on base `62fb640c`. Its failed dependency gate below describes that original
baseline, not the later PR #115/#116 dependency fixes. The current-main local
integration and fresh checks are recorded in
[the integration report](FLAGSHIP_LANDINGS_MAIN_INTEGRATION_2026-10-06.md).

Status: **IMPLEMENTED / FOCUSED LOCAL VERIFICATION PASSED / NOT PUSHED OR DEPLOYED**.

Branch: `codex/flagship-landings-pricing-oct5`, based on
`62fb640c64bd5477a8e5752301c17cb108ab6d2e`. The final commit and evidence file
hashes are recorded in the accompanying local evidence manifest. This document
does not supersede the deployed release identity or historical parity counts.

## Scope and prior work

The canonical checkout `C:\Dev\OperatorOS` was inspected and preserved at
`6d3f60ae82c03fdde148cc71964c748b754c921a` on
`codex/ecosystem-commercial-launch`, including its untracked Oct 5 presentation
directory. Implementation uses an isolated worktree in the delegated task
workspace. Relevant local Codex memories, global/repository AGENTS, SSO,
ecosystem, readiness, implementation, parity and database instructions were read.
The checkout has no `.agents/skills` directory; `.agents/memory` was inspected.

PR #103 already merged the three audience lanes (head
`d326959224df4f6da7b64c3354200c2b8731a281`). These existing canonical pages
are extended; no competing module-name landing routes are added:

| Page | Customer and outcome |
| --- | --- |
| `/for/trades` | TradeFlowKit: customer inquiry, quote, job, task, invoice and cash follow-up |
| `/for/msps` | TechDeck: client/system context, tickets, time, evidence, structured closeout and reviewed knowledge |
| `/for/healthcare-legal` | PulseDesk: operations requests, location/category, owner, service target, updates and closeout |

PR #111 remains unmerged at
`7a3a92703740491cb7dbb0d09fb5ab1a3054a340`. Its bounded selection helper,
pricing/auth handoff, focused selection tests and browser cases were reused and
extended. Review/merge coordination must account for the overlapping files;
this is not a claim that PR #111 has merged. Its dependency changes were not
imported. PR #114 and unrelated TechDeck AI work are untouched.

Each landing has a repeated, module-specific pricing destination, current price
and inclusions, a clearly labeled illustrative workday, practical next steps,
fit/integration limits, FAQs and existing owned audience photography. TradeFlowKit
uses green/blue emphasis, TechDeck cyan/dark emphasis, and PulseDesk a lighter
operations-fit panel within the existing OperatorOS brand. These examples are
illustrations, not customer testimonials or measured performance claims.

TradeFlowKit does not promise live QuickBooks sync or unconfigured payment/message
services. TechDeck does not claim endpoint monitoring, network discovery or script
execution; semantic search remains disabled in the reviewed release. PulseDesk's
healthcare/legal positioning covers general office operations, not PHI, patient
charts, clinical work, legal case records, court deadlines or trust accounting.
No compliance certification, invented metric, testimonial or trial offer is added.

## Pricing evidence and demonstrated cause

At **2026-10-05 23:46:29 UTC**, a fresh anonymous Chromium context with no cookies
loaded live `https://operatoros.net/pricing`. The public catalog returned HTTP 200
and valid JSON. After hydration there were zero “Price unavailable” labels.
Readiness identified deployed source
`62fb640c64bd5477a8e5752301c17cb108ab6d2e`, build
`dbca1e6f06bbb7aa9bb2de15`, deployed `2026-10-04T17:43:38.847Z`, database v65/65.
This is a historical observed identity, not a deployment of this candidate.

At **23:49:52 UTC**, the same real browser held only the anonymous catalog GET
before allowing it to continue. The rendered pricing page showed **16 “Price
unavailable” labels** while the request was pending, then recovered to
`$149/month` when released. This reproduces a rendering/loading defect without
production writes. It does not establish the cause of an earlier prolonged sales
snapshot or prove a persistent live catalog outage today.

Before this change, `PricingSection` initialized `catalog` to null, fetched only
after mount, and formatted every null price as “Price unavailable” even while
loading. Prices could not be read from initial server HTML. There was no retry
after a real failure, and malformed JSON was cast rather than validated.

The candidate fetches the same anonymous catalog on the server, with no cache and
a four-second bound. Validated prices populate initial HTML and client state.
If the server cannot load them, a bounded client fallback shows **Loading
pricing…**, then a recoverable unavailable state and retry. Missing/malformed
catalogs cannot enable checkout. Displayed prices and provider readiness are
separate; no old price fallback or fake zero replaces a failure. All paid price
sentences in the configurator and landing panels derive from this catalog.

The pricing source is the active API **`GET /v1/billing/catalog`**, exposed to the
browser as **`GET /api/billing/catalog`**, implemented in
`apps/api/src/routes/billing-routes.ts` and backed by the current product constants
in **`packages/sdk/src/products.ts`**. The observed live response agrees with this
source:

| Catalog item | Current monthly amount |
| --- | ---: |
| TradeFlowKit | $149 |
| TechDeck | $99 |
| PulseDesk | $149 |
| Extra eligible organization-wide companion | $29 each |
| Extra seat | $15 each |
| OperatorOS home base and free account apps | $0 |

One flagship per organization, five included seats, one eligible companion and
monthly-only billing remain unchanged. Old tier questionnaires/historical offers
were not used. No catalog constant, commercial price, subscription term, Stripe
product/price, credential or provider configuration was changed. Live readiness
flags report configured environment slots; they do not independently establish
Stripe object validity or successful real payment. No purchase was attempted.

## Navigation and authority

Module, included companion, additional companions and seat preferences survive
pricing edits, signup/sign-in links, reload, back/forward and return navigation.
Header, mobile drawer, footer and main pricing CTAs use the same bounded handoff.
The fixed relative return path remains `/pricing`; unsupported products,
duplicate companions, oversized seats, external destinations and authority-shaped
query fields cannot authorize access or change prices.

Only bounded public `utm_source`, `utm_medium`, `utm_campaign`, `utm_term` and
`utm_content` labels travel through these URLs. No identity, tenant, role, token,
tracking cookie or new analytics collector is introduced. No active consent-aware
marketing analytics integration was found. A future approved measurement plan can
use landing → signup → organization creation → module opening → first record/job/
quote → paid conversion, but this candidate does not collect or claim those events.

Existing identity, exact-host SSO/PKCE, tenancy, RBAC, billing and entitlement
authority remain server-owned. Auth forms are reached in tests without submitting
an account or enrolling production users. Local UI fixtures verify owner,
administrator and existing-flagship checkout restrictions; they do not replace
authenticated cross-tenant/real-provider acceptance. Unknown/nested audience
routes now receive a real 404 and noindex before a dynamic Next stream starts.

## Local verification and limits

Pinned pnpm 10.34.5 frozen install succeeded with the unchanged root lockfile.
The local environment uses Node 24.16.0. An ignored process-local pnpm shim lets
nested scripts resolve pnpm without changing global configuration. The repository
currently defines a root lint script despite the older AGENTS command paragraph.

| Check | Result and scope |
| --- | --- |
| `corepack pnpm typecheck` | Pass, all four application workspaces |
| `corepack pnpm lint` | Pass, zero warnings under the existing ESLint command |
| `corepack pnpm build:production` | Pass: supporting contracts, workspace typechecks, API, runner, web and release metadata |
| Web rebuild after final customer-text correction | Pass, `node node_modules/next/dist/bin/next build` |
| Six focused Node test files | **53/53 pass**, zero failures/skips, including public HTTP checks against the local production build |
| Local compiled Chromium landing/selection suite | **18/18 pass**, zero retries: desktop/mobile navigation, prices, selections, metadata, real 404, images, no overflow, axe accessibility, loading/failure/malformed/retry and UI billing restrictions |
| Fresh phase39 security scan | **Fail** on unchanged dependency lock; no source secret/SAST findings, deployment scope passes |

Focused Node command, from root with `WEB_BASE_URL=http://127.0.0.1:5100`:

```text
node node_modules/tsx/dist/cli.mjs --test apps/api/test/pricing-selection.test.ts apps/api/test/public-pricing-catalog.test.ts apps/api/test/public-landing-routing.test.ts apps/api/test/middleware-login-routing.test.ts apps/api/test/marketing-shell.test.ts apps/api/test/public-seo.test.ts
```

Browser recipe (PowerShell; three separate processes):

```powershell
# Root: public catalog fixture, source-derived values, all provider flags false.
node node_modules/tsx/dist/cli.mjs scripts/landing-catalog-fixture.ts
# apps/web: after build, loopback production Next artifact.
$env:INTERNAL_API_URL='http://127.0.0.1:5101'
node node_modules/next/dist/bin/next start -p 5100 --hostname 127.0.0.1
# apps/web: local-only config; no database, purchase or enrollment.
node node_modules/@playwright/test/cli.js test --config playwright.landing.config.ts
```

The local fixture binds loopback and is not imported into application runtime.
The local-only test filename/config keep its synthetic provider state out of
default production-host browser discovery. The existing PR111 selection spec is
also registered in the normal browser test runner. Screenshots cover each module
at 1440 and 390 pixels; existing reflow/accessibility cases additionally cover
768 pixels. Screenshots and complete command logs live in the ignored local
evidence archive, not in deployed application assets.

Earlier diagnostic browser runs failed on the streamed unknown-route soft 200
(fixed), ambiguous alert/sign-in selectors (corrected), and a mistaken no-JS
visibility expectation. Initial server HTML contains verified pricing data, but
the shared Next loading stream requires JavaScript to reveal the page; no full
no-JS visible-page support is claimed. Visible pages and interaction are tested
with JavaScript enabled. The broader existing static smoke tests were updated
for selection-preserving links and removal of the unverified trust heading.
Final logs retain the successful full runs; diagnostic logs are preserved too.

Not run: the complete API/database/integration suites, readiness-gated unified
supervisor, production-host SSO/other-role/foreign-tenant acceptance, full visual
golden suite, real Stripe checkout or hosted CI. No disposable database was
configured for this public-page scope. Existing runtime/security release gates
remain necessary before any deployment. No production mutation, hosted action,
push, PR, merge, publication, customer outreach or new spending occurred.

## Release blockers and rollback

The current local security scan reports **17 disclosed high advisories, zero
critical and 15 unresolved advisory IDs**. The detailed audit still contains
**node-forge GHSA-86w9-cpqp-85rv**. Two pre-existing image-size exclusions are
reported by the scanner; none were added or treated as a new waiver. An imported
`security-fixed.log` is not remediation. Dependencies/lockfile are unchanged.

GitHub Actions cost protection after the 1800/2000-minute warning is unresolved
and has not been independently verified in this task. **Do not push or open a
CI-triggering PR until cost protection is verified and required security gates
pass.** This local candidate is separate from PR #114. Security remediation and
any real provider verification require their own scoped work, not commercial
price changes or exceptions hidden in this landing-page patch.

Rollback is a normal revert of this candidate commit after authorized release;
there is no migration, commercial catalog change or external configuration to
reverse. Local evidence can be reviewed without starting CI or spending money.
