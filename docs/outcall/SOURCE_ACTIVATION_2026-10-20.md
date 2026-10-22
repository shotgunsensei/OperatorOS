# OutCall application source activation - 2026-10-20

Status: reviewed bounded source candidate, with no remote publication. Existing centrally authorized
users can open the reconstructed OutCall application after this candidate is
built and applied through the approved release process. New enrollment remains
closed pending an explicit commercial decision. No live-provider activation,
real account approval, production database operation, publication or deployed acceptance occurred.
Friday, October 23, Eastern remains the owner's all-module target, including
OutCall; these local checks do not close that acceptance requirement.

## Exact source scope

Worktree: `operatoros-outcall-source-activation-oct20`, branch
`codex/outcall-source-activation-oct20`, created clean from
`9a72db2f94bfa8dc6defaa9bf7692ad1da08ca98`. The separately committed country
preflight worktree and frozen FieldNode candidate were not edited. Central
`apps/api/src/index.ts`, dependency manifests/lock versions, provider adapter,
resource policy implementation and the approved product/price roster are unchanged.

The SDK catalog, ecosystem registry and deployment registry now consistently
describe an active application. The shared runtime registry no longer needs
an OutCall-only test launch exception. Startup module seeding follows the
canonical live status instead of reapplying the obsolete source-recovery lock.
It still requires the approved Stack eligibility roster before assigning
companion price metadata, so activating OutCall cannot assign it the shared
$29 price by accident. Root follow-through executed the real seed only against
the task-owned disposable database. Existing legacy price metadata
is not overwritten by this change.

The public runtime verifier requires canonical OutCall registration and explicit
health state (`configured` or `disabled`). A disabled provider is an honest
application readiness state, not evidence of phone delivery. Marketing, setup
guidance, source recovery ledger and test expectations reflect existing access
and provider/commercial gates separately. Historical imported README evidence
is retained unchanged; its old planned-lock description does not override this
dated candidate.

## Access and commercial decision

Authentication, validated tenant membership, user/module authorization and
OperatorOS entitlements remain authoritative. An ordinary authenticated user
without OutCall entitlement is denied; a trusted existing OutCall entitlement
permits the application. The existing platform-admin authority is unchanged.
This candidate does not grant OutCall to free accounts, add a paid grant, reopen
legacy individual purchases, change plan mappings or create an approval row.
Existing centrally computed access, including established grandfathered policy,
continues through the normal server enforcement path.

`packages/sdk/src/catalog.ts` retains the legacy
`STRIPE_PRICE_ADDON_OUTCALL` key. A key is not an approved new price or purchase
flow: `legacyAddonSalesClosed()` in `apps/api/src/lib/billing-service.ts` and
the legacy route still reject new individual sales with
`LEGACY_ADDON_SALES_CLOSED` (409). No current provider price amount was inspected.

The current forward-sale contract in `packages/sdk/src/products.ts` offers
six companion choices. One selected companion is included with a core
application; each additional eligible companion costs USD29/month through
`STRIPE_PRICE_COMPANION_MODULE_MONTHLY`. OutCall is deliberately absent.
Core monthly prices and the seat contract are unchanged.

Two concrete owner choices remain: authorize OutCall as a seventh choice under
those existing shared Stack terms (recommended if new buyers must obtain it
at first release), or retain existing-entitlement access and hold new enrollment
until terms are approved. A dedicated individual OutCall offering would need a
separate explicit contract and implementation. No choice is assumed here.
Every choice still requires the separate live-provider gates below.

## Preserved provider and account boundaries

The production adapter still requires complete valid Twilio configuration,
the exact `https://outcall.operatoros.net` public URL, a nonempty supported
US/CA country set and the explicit live-provider switch. Production cannot use
the test adapter: both APP_ENV and NODE_ENV must be test for that adapter.
Readiness additionally needs a valid resource policy and a durable approval
bound to the exact account and policy hash, unrevoked, already effective,
unexpired and approved by an active super_admin. A synthetic row used in an
isolated test does not establish any real account approval.

The unchanged reservation/submission path also enforces account budgets,
operation quotas, outstanding requests, call duration, queue lateness and
unreconciled legacy work. Verified-self destination, consent, membership,
tenant isolation, callback signatures, delivery state and unknown-outcome
handling remain required. Opening a workspace does not place a call.

## Local verification

Windows PowerShell, existing Node24.16.0, cached TSX, TypeScript5.6.3,
ESLint10.8.1 and esbuild. No package was installed or acquired. An attempted
task-local dependency junction failed with filesystem `Access is denied`;
it created no link. The worker used ignored
`build/outcall-activation-tests/tsconfig.json` instead maps SDK imports to this
candidate and external dependencies to the existing cache by absolute path.
The strict typecheck configuration uses cached existing declarations, including
Next's own CSS declarations, with strictness unchanged.

Root subsequently linked the already-existing dependency cache into this
isolated worktree through the permitted sandbox escalation, with workspace
links pointing at this candidate. No package acquisition, install or lifecycle
script occurred. The retained cache contains follow-redirects1.16.0 while the
source lock specifies1.16.1; the separate PR136 hosted frozen installation
passed its1.16.1 hardening gate, but these local results are not proof of an
installed final lock graph.

| Check | Result and limit |
| --- | --- |
| New application regressions against original source | 3 failed: catalog unavailable, unavailable before authentication, and startup relock; isolated provider gate control passed |
| Final independent focused suite | 56 passed, 0 failed/skipped/cancelled/todo; no held SSO-file static tests included |
| Earlier full focused suite | 58 passed, 0 failed/skipped; includes two static tests reading the locally modified SSO file held for parent approval, so it is not independent evidence for the deliverable patch |
| `scripts/phase20-product-truth.test.mjs` with inherited cached loader | 8 passed, 0 failed/skipped/cancelled/todo; no ledger/source import changes |
| Strict check of changed TS/TSX files excluding held SSO file | Pass, no emit; includes API seed/test and browser test source, but executes no DB/browser |
| Scoped ESLint of changed JS/TS/TSX excluding held SSO file | Pass, zero warnings |
| Source-gate compiler / ledger agreement | Pass; application source active, commercial and live-provider acceptance explicitly pending |
| `git diff --check` and changed MJS syntax | Pass |
| Root full production build | Pass; API, runner and Next39pages plus four workspace typechecks; no runtime service or provider |
| Root disposable database/provider/control suite | 46 passed,0 failed/skipped/cancelled; real seed/idempotence, auth/tenant and OutCall routes/resources plus synthetic provider controls; PostgreSQL16.14 from an existing pinned image, no production target |
| Root synthetic component browser | 5 passed,0 failed/skipped; existing Playwright1.61.1 and Chromium1228, locally fulfilled HTTP, mobile/cancel/retry/recovery/provider truth; no backend, account or delivery claim |
| Root exact-host local application journey | 1 passed,0 failed/skipped/retries,34.2s; real compiled API/Next and PostgreSQL with test-only provider, all11routes, signup/login, safety, synthetic phone verification, profile/schedule/record/history, redirects, six-route Axe checks and desktop/tablet/mobile navigation; no live call |
| Root official compiled release on the same disposable database | Apply and verify-current pass,v67/67; no production database or installed extension required |

The focused command uses `node --import <existing-cache>/tsx/dist/loader.mjs
--test` for `outcall-source-activation`, `operatoros-module-registry`,
`ecosystem-registry`, `sso-exchange-rollout`, `middleware-login-routing`,
`production-runtime-verifier`, `module-product-value-contract`,
`phase17-deployed-acceptance-static` under `apps/api/test`, plus
`scripts/phase37/*.test.mjs`. Exact logs and loader/typecheck configurations
are retained under ignored `build/outcall-activation-tests/` for local review.

The new provider-readiness test bundles the actual unchanged provider and
resource functions in memory. Only persistence, the SQL-tag capture and unrelated
phone parsers are synthetic; fetch throws, no real DB client loads, and no
operation parser or call is invoked. It proves fail-closed readiness and the
query predicates plus a synthetic positive control. It does not execute SQL
authorization predicates or prove an actual provider account.

Root receipts live in the task's `evidence/resume-oct20/operatoros-outcall/`:
`root-final-build-receipt.json`, `outcall-source-sql-pg16-final-receipt.json`
and `component-browser-cached-receipt.json`. The first isolated SQL launcher
omitted its synthetic signing key; subsequent normal-sandbox attempts exposed
the task guard's TSX named-pipe argument handling and loopback `connect EACCES`.
Those failed logs remain. The corrected launcher uses a disposable-only key,
permits only the selected database and task-temporary TSX numeric pipes, and
passes three guard-policy controls. The permitted final database run passed.
No application source was changed to relax a boot or network guard. The first
browser launcher resolved the sandbox's absent browser cache; the recorded
successful run selected the existing host cache explicitly, acquired nothing,
and Chromium exited0. Its normal local fulfillment runs through a closed
loopback proxy, with no external provider request.

The full existing `scripts/phase50-business-operations-browser.mjs` path was
then selected with `PHASE50_BROWSER_SPEC=outcall` and already-built artifacts.
The acceptance rebuild baked its actual loopback API URL5001 instead of the
first compile-only dead-port51999. The API uses APP_ENV/NODE_ENV=test and the
explicit OutCall test adapter; Next uses its production build. Task-only
changes to the evidence driver bind every service to loopback, invoke the
existing cached Playwright CLI with zero retries, map all browser DNS to
loopback, and block every other Node socket/fetch and redirect. No held SSO
suite or production account runs. The compiled official release requires
`--conditions=production`; the first missing-condition loader failure happened
before database work and is preserved. The initial local numeric Next hostname
also hit Next15's documented-in-source numeric-loopback-to-localhost normalization
and produced an internal rewrite TLS mismatch; matching the listener and gateway
to `localhost` fixed only the test harness. Application source was unchanged.

`phase50-browser-receipt.json`, `phase50-apply-receipt.json`,
`phase50-verify-receipt.json`, `root-final-build-acceptance-receipt.json` and
`phase50-cleanup.json` retain the exact results. Fresh desktop/mobile screenshots
are copied to task evidence; only this test's generated tracked PNGs were restored
to their original bytes. Required screenshot comparison baselines were not changed.
Chromium exited0 and the four service ports were verified free on both applicable
loopback address families. The task-owned PostgreSQL remains only for a separate
bounded PulseDesk check before its verified tmpfs cleanup.

Initial cache resolution and ad-hoc typecheck runs failed for missing external
module/declaration aliases; no install was attempted. Corrected absolute cached
paths resolved those failures. A fixed cookie-count assertion was corrected to
assert all required secure, HttpOnly, host-only PKCE cookies while permitting the
existing return-path cookie. No failed gate was converted to a skip.

## Remaining integration and acceptance

The parent owns final integration and the held
`apps/web/e2e/sso-v1.spec.ts`. Before its hold arrived, local uncommitted edits
changed the OutCall selector from `shell-outcall` to `outcall-module-shell`,
the enabled-module count13 to14, the denial-test title to active OutCall and
the expected denial from `MODULE_UNAVAILABLE` to `MODULE_ACCESS_DENIED`.
The file has not been edited further and is excluded from the deliverable
patch/hash roster. No upload or publication was attempted. Its upload approval
must be resolved by the parent; the candidate cannot claim complete combined CI.

The Phase17 deployed matrix has a pre-existing missing FieldNode selector on
this base. This worker changed only its OutCall/count expectations; the parent
owns the FieldNode integration. OutCall activation raises enabled non-platform
modules13 to14 (15 registry entries including OperatorOS).

The source candidate's disposable-DB seed/idempotence, production build and
synthetic component-browser checks are complete as recorded above. Combined
head integration, the final production runtime profile/deployed exact-host
acceptance and hosted release checks remain open. The separate local compiled
application journey passes in its explicitly synthetic provider profile. OutCall screenshot
baselines depict the old unavailable state and require reviewed refresh against
the actual active shell; visual checks remain enforced. The synthetic component
browser result is not a replacement for those baselines or exact-host SSO.

The smallest live proof remains an authorized isolated tenant and owned
recipient, exact-host production SSO, persisted safety/verification/profile/
schedule workflow, a bounded approved call, authentic callback and delivery
reconciliation, cancellation/failure/duplicate handling, tenant denial and
export/deletion. It requires verified provider account/services, rates/budgets,
number/country compliance, public callbacks, a current expiring account-policy
approval and explicit permission for controlled calls. No real account facts,
credentials, recipients or delivery outcomes were checked in this task.

Source review, approved commercial choice, held-file resolution, combined CI,
controlled target acceptance and publication remain distinct gates. Do not
silently remove OutCall from Friday scope or present source activation as live
provider acceptance. Source rollback restores the prior catalog/registries,
seed relock and verifier expectations together; existing rows would require an
approved release application. No operational rollback is needed for this task,
because nothing was applied or activated in production.
