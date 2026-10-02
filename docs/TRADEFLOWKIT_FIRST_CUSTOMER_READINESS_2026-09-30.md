# TradeFlowKit first-customer readiness — 2026-09-30 UTC

Verdict: **LOCAL REVENUE PATH VERIFIED; DEPLOYED PAID-CUSTOMER ACCEPTANCE OPEN**.
Public pricing works after hydration. The confirmed acquisition defect is loss
of Stack preferences at authentication, repaired in this isolated local candidate.
No deployment, purchase, live price/configuration change, production write,
or access/security change occurred. Source publication and its required gate
status are recorded in the full-gate continuation and PR evidence.

## Source and coordination

- GitHub main: `737a9d0fa18267c33fb01732ef5be4626e96c1e5`, merged PR110.
  [Exact-main release gate](https://github.com/shotgunsensei/OperatorOS/actions/runs/36608771647)
  is completed/success (2026-09-29). This is existing evidence, not a new test run.
- Canonical checkout `C:\Dev\OperatorOS` was on
  `codex/openai-module-enablement`, local commit `797ffffd`, with unrelated
  `output/presentations/`. It was inspected read-only and left untouched.
- Candidate: `codex/tradeflowkit-revenue-readiness` in a separate clone under
  `C:\Users\John Xodus\Documents\Codex\2026-09-30\task\operatoros-revenue-readiness`,
  based on exact main. Dependencies installed from the pinned pnpm 10.34.5
  lockfile/cache without changing package files or lockfile.
- John reports no known customers or active trials and prefers TradeFlowKit.
  That customer/trial count is an owner report, not a database audit.
- The unpublished Sep30 AI candidate is separate work. No AI, secret,
  provider-enablement or TechDeck changes are included here.

## Prioritized findings

1. **Acceptance gate:** no current deployed proof of a new owner's signup,
   actual Stripe subscription Checkout, signed settlement, purchased tenant
   entitlements, module launch, persistence, second-user restriction/access,
   portal/cancellation and logout. Local tests and configured flags do not prove
   that live chain. This is the first-sale gate, not proof that live billing fails.
2. **Confirmed conversion defect, locally fixed:** a public Stack of TradeFlowKit,
   included BrandForgeOS, additional SnapProofOS and two extra seats renders
   $208/month. Its Sign In to Continue handoff carries only
   `/pricing?product=tradeflowkit#build-stack`; companion and seat choices are lost.
   Both Create free account links carry `/login?mode=register` without `next`.
   The fix preserves all four selection dimensions and exposes a signup link
   beside the existing sign-in continuation.
3. **Pricing concern cleared:** isolated anonymous Chromium reads the live
   catalog at HTTP 200. TradeFlowKit/PulseDesk display $149/month and TechDeck
   $99/month. The public catalog reports all five Stripe price bindings present.
   Desktop and mobile TradeFlowKit totals display $149; mobile has no horizontal
   overflow. The fetched pre-hydration “Price unavailable” text is not a confirmed
   runtime pricing failure. Bound Price validity/mode and completed settlement
   still require separate evidence.
4. **Optional provider gates:** TradeFlowKit merchant invoice payments use Stripe
   Connect, separate from OperatorOS subscription billing. Connect account/mode,
   OAuth, payment, refund and signed settlement acceptance remain open. Outgoing
   messages also require connected and tested delivery. Direct QuickBooks Online
   sync is planned; existing accounting exports are the current boundary.
5. **Operations gate:** published v65 and public release verification do not close
   deployed write/role/logout or restore rehearsal. Resolve recovery evidence and
   support ownership before relying on the product for paid customer records.

## Revenue and first-value path

| Stage / customer goal | Active implementation / observed evidence | State and remaining gate |
| --- | --- | --- |
| Landing: choose a trade-business workflow | `/for/trades`, `audience-lanes.ts`, public browser HTTP 200 | Public entry verified |
| Plan: choose TradeFlowKit and capacity | `/pricing?product=tradeflowkit#build-stack`, SDK `products.ts`, public catalog | Hydrated prices verified; actual Stripe objects not inspected |
| Signup / sign-in: retain the choice | `/login`, exact-host middleware/SSO, `PricingSection.tsx` | Account form/canonical sign-in observed; preference handoff locally repaired; no production form submitted |
| Owner checkout: buy one monthly tenant Stack | `billing-routes.ts` → `createStackCheckoutSession` | Owner/tenant guard, monthly-only/one-flagship and server Price validation present; real-provider acceptance open |
| Settlement: grant purchased access | Signature-verified webhook → tenant subscription/entitlement and seat updates | Synthetic provider/DB tests pass; redirect alone never grants access; live signed settlement open |
| Launch: enter the paid module | Tenant entitlement resolver and exact-host single-use-code SSO | Existing implementation/CI evidence; deployed new-customer launch open |
| First outcome: customer → job → quote → invoice → recorded payment | Tenant-scoped TradeFlowKit revenue routes and persistent tables | Fresh isolated workflow/role/tenant tests pass; deployed persistence and second-user acceptance open |

The pricing URL is an allowlisted preference only. It contains no tenant, role,
price, credential or entitlement authority. Authentication, return-target safety,
owner checks, server price verification and webhook-only grants retain their
existing contracts. Malformed/repeated values fall back safely; additional
companions are deduplicated and cannot include the free selection or OutCall.
The page does not automatically call Checkout after returning from authentication.

## Verification in this candidate

Windows / Node 24.16.0 / pnpm 10.34.5 / isolated PostgreSQL 16 / Playwright 1.61.1.
External provider credentials were stripped from local acceptance subprocesses.
The fresh Docker database used a separate loopback port 55482 and temporary
storage; existing containers/databases were not reused or changed.

| Command / check | Result |
| --- | --- |
| `corepack pnpm install --frozen-lockfile --offline --store-dir <existing-local-cache>` | Pass; 1,131 locked packages installed |
| `node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 apps/api/test/pricing-selection.test.ts apps/api/test/marketing-pricing-shape.test.ts apps/api/test/commerce-forward-model-static.test.ts apps/api/test/forward-commerce-contract-static.test.ts` | 29 passed, 0 failed/skipped/todos |
| `corepack pnpm typecheck` | All four workspaces pass |
| `corepack pnpm lint` | Pass, zero warnings |
| `corepack pnpm build:production` with loopback `INTERNAL_API_URL` | Pass; deployment scope, resolution contracts, catalog 4/4, typechecks, API/runner/SDK, Next 38/38 pages |
| Root `database-release.ts --apply`, explicitly isolated apply mode | v65 applied and verified, 10,381 ms |
| `tsx --test --test-concurrency=1` on `tradeflowkit-revenue-flow`, `commerce-forward-model-db`, `tradeflowkit-payment-provider`, `tradeflowkit-stripe-settlement` | 18 passed, 0 failed/skipped/todos, 30,668 ms; deterministic provider adapters |
| New desktop/mobile `pricing-selection.spec.ts` through compiled supervisor | 2 passed, 0 failed/skipped/retries, 8.9 seconds; both signup/sign-in links and simulated auth return preserve the exact $208 selection; runtime health passed |

The initial shell attempts exposed environment limitations: pnpm was absent
from child PATH, sandbox enumeration blocked the source compiler, and an
elevated build needed a process-only Git ownership exception. A workspace-local
pinned pnpm shim and exact-checkout process Git configuration resolved those;
no global Git or package-manager configuration was edited. Initial browser
reproduction used an overly narrow accessible-name regex; the corrected run
confirmed the defect. These were validation setup failures, not product fixes.

Public read-only browser artifacts are in the parent task's
`output/playwright/`: `revenue-read.json`, `live-selection-repro.json`,
`live-selected-stack.png`, `live-pricing-mobile.png` and page screenshots.
Local database and browser logs are in `test-results/revenue-readiness/`.
The browser check navigates the existing auth return destination without
submitting registration/login credentials; it does not establish real signup,
email delivery, signed SSO exchange or deployed purchase acceptance.
Raw auth transaction parameters are unnecessary for the decision; use the
sanitized selection reproduction artifact when sharing evidence.

No full new release-gate/whole-API run, real Stripe call, external-inbox signup,
production test account, merchant payment, production customer workflow, or
restore was performed. This candidate is **implementation verified;
deployment unverified** and does not promote module parity or readiness state.

## Shortest first sellable offering and owner decisions

Recommend a guided **TradeFlowKit pilot for a 1–5-person trade-service team** at
the existing $149/month tenant price, monthly-only, five seats and one eligible
companion included. Start with one customer/job/quote/invoice, record a real
off-platform payment honestly, reload the record and show a second authorized
user the same organization workflow. Do not make Connect, automated messaging,
QuickBooks sync or AI the required first outcome. An included companion can be
chosen under the current contract; validate its promised pilot use separately.

1. Owner chooses one prospect, support contact and onboarding session, and
   confirms this narrow pilot promise. No new pricing or discount is needed.
2. Arrange explicitly authorized billing acceptance using Stripe test mode in
   a separate test environment: Price/catalog validation, owner checkout,
   signed webhook, tenant access/seats, portal/cancel, replay and recovery. Then
   verify the live account/mode and bound Prices read-only before the first
   customer voluntarily purchases. Do not change live Prices to run a test.
3. Obtain explicit scope for the deployed test organization/account and
   persistent workflow/second-role/logout checks, plus recovery rehearsal.
   Current authorization excludes production data/access/security mutations.
4. Review this small local patch for normal source publication/deployment when
   separately authorized. No migration is required. Rollback is code revert;
   historical auth links remain compatible and no business records are changed.
5. Acquire the first prospect with the existing trades landing page and guided
   demonstration. Broader ad spend should follow billing and activation
   acceptance; the immediate metric is a customer completing the first invoice
   workflow and voluntarily starting the existing subscription.

There is no evidence-based reason to build a new module or merge the unrelated
AI candidate to unblock this pilot. The shortest path is acceptance and one
customer outcome, with this bounded handoff repair supporting conversion.

## Follow-up self-review before source publication

The follow-up review found and repaired three local issues:

- **Back/Refresh:** desktop and mobile reproduction failed because the chosen
  two seats returned to zero after Back and Refresh. Selection controls now
  replace the current pricing history entry with the complete preferences,
  retaining campaign parameters and the existing fragment. They do not add a
  history entry for each control change. Back, Forward and Refresh now pass.
- **Large seat input:** the parser initially accepted safe integers too large
  for existing PostgreSQL integer capacity. A regression failed on 2,147,483,643.
  URL preferences now reject values beyond signed-integer capacity minus the
  SDK's five included seats, and the increment control stops at that boundary.
  This is representation safety, not a new price or commercial seat policy.
- **Release coverage:** the release browser runner has an explicit file list
  that omitted the new spec. It now includes `pricing-selection.spec.ts`.

Redirect review found no new open redirect: the account path is fixed `/login`,
its `next` is fixed `/pricing` plus allowlisted preferences, and unknown query
authority is discarded. Existing shared `sanitizeReturnTo` remains unchanged;
it rejects external/protocol-relative/control/backslash destinations. Canonical
login middleware still enforces the transaction's same origin and excludes
login/SSO callbacks. Existing PKCE/state/nonce/exact-host contracts are unchanged.
No credential, tenant, role, Price ID or entitlement is taken from these URLs.

Fresh follow-up verification: **53 focused pricing/commerce/public-URL/SSO checks
passed, zero failed/skipped/todos**; root lint passed with zero warnings;
`build:production` passed including four-workspace typecheck and Next 38/38.
All **three** scoped browser tests passed, zero retries/skips, in 15.2 seconds
through the local exact-host TLS proxy and compiled supervisor. Browser canonical
domains were mapped to loopback; this was isolated Chromium, not John's signed-in
browser. These checks cover desktop/mobile Back/Forward/Refresh, campaign
retention, canonical signup/sign-in handoffs, malicious companion/query values,
large seats and counter boundary. Authentication completion remains simulated.

The initial full release gate was not rerun because the task selected bounded
verification for this handoff slice; that is an evidence limit, not an environment
blocker or a claim that existing main CI verifies this branch. Read-only
`node scripts/parity/run-release-gate.mjs --plan` confirms 14 stages, including
all 334 API test files, reset/apply/reapply integration, full exact-host browser
and visual suites, and production preflight. It is feasible in this isolated
environment with a fresh disposable database, provider credentials stripped,
synthetic test secrets, and exclusive local ports 443/5000/5001/5002. The GitHub
workflow uses Ubuntu/Node 20 and has a 60-minute timeout; this workstation uses
Windows/Node 24 with reviewed Windows visual baselines. No complete follow-up
release-gate result is claimed. Require the exact candidate's full PR release
gate before merge when source publication is authorized.

Live Stripe account/Price research was authorized, but no callable authenticated
Stripe read tool was available. No sign-in, permission or secret changes were
made to obtain access. Public configured flags still do not establish live
account/mode, active Price amounts/intervals or actual Checkout settlement.
Remaining actionable gates are exact-candidate full CI, authenticated read-only
Stripe verification, approved test-mode paid activation, and deployed workflow/
role/logout/recovery acceptance. Push approval is pending; the branch stays local.

## Full local release gate for the exact code candidate

The owner subsequently authorized source publication, merge and Replit
publication when required gates pass. No payments, secret/credential/security
changes, destructive operations or new legal terms are included in that scope.

`f610a7eaa753547664fc94cc10701b5f5d10e25e` was clean before the full local gate.
All required ports were available; no existing process/container was stopped.
The gate used a new temporary PostgreSQL 16 database on loopback port 55483,
non-production synthetic secrets, stripped external-provider credentials and
the existing compiled-supervisor/exact-host TLS harness. Run: 2026-09-30
20:21:05-20:49:51 UTC, 28 minutes 46 seconds, Windows/Node 24.16.0/pnpm 10.34.5.
Result: **complete, 13 stages passed, one failed; exit 1**.

| Required stage | Result | Evidence |
| --- | --- | --- |
| FaultlineLab source catalog | PASS | 56 cases; 4/4 compiler checks |
| Phase 39 production hardening | FAIL | Complete dependency audit reports nine unresolved advisory IDs |
| Parity report | PASS | All 13 module reports generated |
| Parity verification | PASS | 7,396 capabilities; no failures |
| Four-workspace typecheck | PASS | All four workspaces |
| Root lint | PASS | Zero warnings |
| Unit | PASS | 52 passed; zero failed/skipped/cancelled/todos |
| Complete API | PASS | 1,598 passed; zero failed/skipped/cancelled/todos |
| Integration apply/reapply | PASS | 108 passed; root release reset/apply/reapply/verify |
| Production build | PASS | Scope/contracts/catalog/typecheck; Next 38/38 |
| Route/control static | PASS | 974 crawl routes; no failures |
| Visual-contract static | PASS | 13 modules; no failures |
| Exact-host browser/visual/accessibility | PASS | 35 browser + four Windows visual tests; no failures/skips/retries |
| Core production preflight | PASS | Synthetic local production-artifact environment |

The blocker is inherited, unchanged dependency input: `axios@1.19.0` through
`apps/api -> twilio` and `brace-expansion@5.0.9` through
`@capacitor/cli -> rimraf -> glob -> minimatch`. All dependency manifests,
`pnpm-lock.yaml`, `pnpm-workspace.yaml` and audit exceptions match main `737a9d0f`.
The complete report has 11 raw high disclosures, zero critical, nine unresolved
advisory IDs; exception integrity and deployment scope pass. Source scanning
found zero findings. Dependency policy was not weakened, waived or changed.

The audit's fix ranges are `axios >=1.20.0` and `brace-expansion >=5.0.11`.
These are report-derived targets for a separately scoped dependency update,
not an applied fix or a claim of deployed exploitability. Seven Axios advisory
IDs are 1240603/1240604/1240605/1240607/1240608/1240628/1240634; two brace-expansion
IDs are 1240107/1240111. Keep exact-head CI blocking until these are remediated
and the unchanged hardening gate passes.

The failed audit short-circuited the following hardening checks. The five local
hardening test files were run separately: **15/15 pass**, zero skips/todos.
Their first supplemental attempt needed the known Windows process-only Git
ownership exception; the corrected run passed. The two API hardening/preflight
files are included in the successful whole API suite. This supplemental evidence
does not convert the failed required stage into a pass.

Artifacts: `build/parity/release-gate-results.json`, `api-test-summary.json`,
`integration-test-summary.json`, `unit-test-summary.json`; and under
`test-results/revenue-readiness/`, `full-release-gate.log`,
`full-release-invocation.json`, `full-dependency-audit.json`,
`hardening-tail-tests.log` and retained generated SBOM/screenshots.
Only generated tracked artifacts from this run were restored after retaining
copies. The temporary database/container and test runtime/proxy were stopped;
the existing container, canonical AI branch and unrelated edits were preserved.

No code regression was identified and no code changed during the full run.
This subsequent documentation-only evidence update does not alter the tested
implementation. Exact-head GitHub CI must validate the published PR revision.
Merge and Replit publication remain blocked by required auditing; real-provider,
deployed paid activation and recovery acceptance also remain unverified.
