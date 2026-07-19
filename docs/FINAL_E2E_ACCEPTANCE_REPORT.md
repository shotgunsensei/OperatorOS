# OperatorOS ecosystem final E2E acceptance report

Assessment date: 2026-07-16  
Target: local production-mode HTTPS topology backed by disposable PostgreSQL 16  
Scope: OperatorOS, TradeFlowKit, PulseDesk, TechDeck, and TorqueShed  
Verdict: **NOT ACCEPTED — release gate failed**

## Phase 4 follow-up

The local production-host acceptance was rerun on 2026-07-18 after the
TradeFlowKit Phase 4 candidate. It produced 29 passing evidence records and 9
failures. Every TradeFlowKit-specific row passed: SSO launch, shared-directory
customer creation, numbered job and first-class task persistence, intentional
project-endpoint denial under ADR-0010, return navigation, reopen persistence,
and disabled-entitlement denial. TradeFlowKit deep-link refresh also passed
inside the combined step; that step remained failed only because TorqueShed's
`/diagnostics` route is Phase 7 scope. The remaining nine failures are in
PulseDesk, TechDeck, and TorqueShed and are carried into their later phases.

The complete two-test local production-host SSO matrix separately passed all
12 enabled modules. This follow-up does not change the report's **NOT
ACCEPTED** verdict: the candidate is not deployed, the broader ecosystem gaps
remain, and TradeFlowKit still lacks approved cutover/deployed workflow and
public-document smoke evidence required for state 5.

## Phase 2 follow-up

After this dated 35-step run, Phase 2 added one OperatorOS-owned persistent
Business Directory used by TradeFlowKit, TechDeck, and PulseDesk for shared
organizations, contacts, addresses, sites, associations, and module-specific
profiles. A production-artifact browser test created records, refreshed, and
reused the same organization ID across all three modules. This closes only the
shared client/contact/site foundation; it does not retroactively change this
report's verdict or close projects/tasks, PulseDesk asset/ticket/note/time,
TechDeck VLAN/subnet, TorqueShed, deployed SSO, or deployed health gates. The
full acceptance sequence must be rerun on the reviewed deployed revision.

This report does not mark any application production-ready. The final browser
gate produced 28 passing evidence records and 10 failures. Authentication,
entitlement filtering, SSO launch/return, coordinated logout, implemented-data
persistence, negative authorization, tenant isolation, production builds, and
health checks passed. Required domain workflows remain absent.

## Test topology

- Real Next.js production build on `http://127.0.0.1:5000`.
- Real Fastify API in production mode on `http://127.0.0.1:5001`.
- Host-preserving TLS proxy on `https://127.0.0.1:443` for every canonical
  `*.operatoros.net` origin.
- Disposable PostgreSQL 16 database on `127.0.0.1:55432`.
- Disposable registered users and tenant-scoped entitlement rows; no fake
  browser session or response stubs.
- Browser requests were executed in Chromium through the production host and
  cookie boundaries. Domain record creation used the live same-origin APIs
  from the authenticated module browser page.

Raw machine-readable evidence is emitted by
`apps/web/e2e/operatoros-final-acceptance.spec.ts` to the Playwright test
output as `operatoros-final-acceptance.json`. The final run was generated at
2026-07-16T16:06:16.140Z.

## Acceptance summary

Passed behavior:

- Anonymous OperatorOS entry and one-credential SSO login.
- My Apps showed exactly `pulsedesk`, `techdeck`, `torqueshed`, and
  `tradeflowkit` for the disposable entitlement set.
- All four modules launched through SSO and returned through shared My Apps
  navigation.
- Global logout revoked the platform session; every module became unusable and
  restarted authentication.
- Re-login reopened every module. Implemented records persisted with observed
  counts: TradeFlowKit 2, PulseDesk 1, TechDeck 3, TorqueShed 1.
- TradeFlowKit, PulseDesk, and TechDeck supported their registered deep routes
  and browser refresh. All four canonical module roots supported direct URL
  navigation.
- Expired sessions restarted canonical authentication.
- A disabled tenant entitlement returned 403 (`req-ba`) and did not enter the
  protected route handler.
- A client-supplied foreign tenant returned 403
  `SESSION_TENANT_MISMATCH` (`req-bc`) without foreign data.
- An unauthenticated direct module API call returned 401 (`req-bd`).
- `/healthz` and `/readyz` returned 200; readiness reported database healthy,
  auth configured, SSO-code encryption configured, and module registry
  configured.
- No module navigation link targeted an unsupported `/app` path.
- Profile, Billing, and Support primary destinations rendered without
  placeholder or “coming soon” content.

## Failure evidence

Every API failure below was also present in the Fastify structured request log
with the same `requestId`, method, normalized route, status 404, and module
context. Routes absent before authentication pre-handlers correctly have null
user and tenant log fields. The owning repository for every row is the
consolidated `C:\Dev\OperatorOS` runtime.

| Step | URL | Captured request | Captured response / server log | Request ID | Owning area | Disposition |
| --- | --- | --- | --- | --- | --- | --- |
| 5 | `https://tradeflowkit.operatoros.net/` | `POST /api/modules/tradeflowkit/tasks` with `projectId` and `title` | 404, `Route POST:/v1/modules/tradeflowkit/tasks not found` | `req-65` | TradeFlowKit API/domain | Client and job persisted, but distinct project/task contracts do not exist. Not fixed; requires a persistent project/task product increment and browser UI. |
| 8 | `https://pulsedesk.operatoros.net/` | `POST /api/modules/pulsedesk/clients` with `name` | 404, `Route POST:/v1/modules/pulsedesk/clients not found` | `req-6k` | PulseDesk API/domain | Department and PHI-minimized operational request persisted. Client/contact/asset/ticket endpoints do not exist. Not fixed; the requested MSP-style model also conflicts with PulseDesk's healthcare-operations boundary and needs an explicit domain decision. |
| 9 | `https://pulsedesk.operatoros.net/` | `POST /api/modules/pulsedesk/tickets/probe/notes` with internal note data | 404, `Route POST:/v1/modules/pulsedesk/tickets/probe/notes not found` | `req-6o` | PulseDesk API/domain | Internal-note and time-entry ticket contracts do not exist. Not fixed; depends on the step 8 domain decision and persistent ticket model. |
| 12 | `https://techdeck.operatoros.net/` | `POST /api/modules/techdeck/clients` with `name` | 404, `Route POST:/v1/modules/techdeck/clients not found` | `req-74` | TechDeck API/domain | Server, firewall, and runbook persisted. Client/site/VLAN/subnet contracts do not exist. Not fixed; requires persistent topology entities and UI. |
| 15 | `https://torqueshed.operatoros.net/` | `POST /api/modules/torqueshed/vehicles` with year/make/model | 404, `Route POST:/v1/modules/torqueshed/vehicles not found` | `req-7j` | TorqueShed API/domain | Generic diagnostic-case data persisted, but vehicle and diagnostic-session entities do not exist. Not fixed; requires first-class durable records and UI. |
| 16 | `https://torqueshed.operatoros.net/` | `POST /api/modules/torqueshed/diagnostic-sessions/probe/trouble-codes` with `P0302` | 404, route not found | `req-7l` | TorqueShed API/domain | Trouble-code and measurement child-record contracts do not exist. Not fixed. |
| 17 | `https://torqueshed.operatoros.net/` | `POST /api/modules/torqueshed/torque-assist` with `adapter: test` | 404, route not found | `req-7n` | Torque Assist service/API | No Torque Assist adapter contract exists. Not fixed; no simulated result was accepted. |
| 18 | `https://torqueshed.operatoros.net/` | `GET /api/modules/torqueshed/token-ledger` | 404, route not found | `req-7o` | Torque Assist metering | No tenant/user/session-scoped token ledger exists. Not fixed. |
| 19 | `https://torqueshed.operatoros.net/` | `POST /api/modules/torqueshed/marketplace/listings` with title and price | 404, route not found | `req-7p` | TorqueShed marketplace/community | Marketplace listing and community post contracts do not exist. Not fixed; no placeholder was treated as functionality. |
| 26 | `https://torqueshed.operatoros.net/diagnostics` | `GET /diagnostics` followed by browser refresh | HTTP 200 recovery shell, but no supported diagnostic route/screen; no API request ID applies | — | TorqueShed routing/UI | Not fixed; requires a registered durable diagnostic-session route. |

The same scenarios were rerun after fixing the eligible shared-routing defects.
The ten rows above reproduced consistently and are product-scope blockers, not
test-harness or environment failures.

## Defects fixed during acceptance

1. The canonical My Apps root automatically redirected tenant owners/admins to
   Tenant Command Center, so the module header's “My Apps” return did not land
   on My Apps. The role-based automatic redirect was removed; Command Center
   remains an explicit sidebar destination. The browser return steps now pass.
2. A production OperatorOS host requesting legacy `/app` could resolve to a
   localhost destination when `NODE_ENV` was non-production. Middleware now
   derives production canonicalization from the registered host, not process
   mode. Live retest: 308 to `https://app.operatoros.net/`, `Cache-Control:
   no-store`, hostile `next` discarded.
3. API listen failures previously emitted only a generic startup error.
   Startup logging now exposes safe socket metadata (`code`, `syscall`,
   `address`, `port`) without secrets; this identified and removed a stale
   local listener during acceptance.
4. Tenant/module pre-handlers sent the correct denial response but returned
   `undefined`, allowing Fastify to continue into a protected handler and log
   `FST_ERR_REP_ALREADY_SENT`. All authentication, tenant, entitlement, and
   write-denial branches now return the reply. Live retest: disabled
   entitlement `req-ba` returned one clean 403 with no handler execution or
   duplicate-reply error.
5. The API compiled successfully but its production `start` entry pointed at a
   nonexistent output path, and the workspace SDK resolved TypeScript source
   under plain Node. The API build now emits the SDK, the SDK exposes a
   production-only compiled export, and `start` uses the actual emitted API
   entrypoint with Node's `production` condition. The compiled production API
   started successfully and served the final acceptance run.

## Final application matrix

| Application | SSO | Return navigation | Dashboard | CRUD | Persistence | Tenant isolation | Authorization | Deep links | Logout | Production build | Health check | End-to-end result | Outstanding defects |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OperatorOS | Pass | Pass | Pass; exact entitlement set | Pass for existing identity/tenant/entitlement surfaces | Pass | Pass | Pass | Pass | Pass; global revocation verified across all modules | Pass | Pass | **FAIL — ecosystem release gate** | Child-module core workflows below remain incomplete; no deployment readiness claim. |
| TradeFlowKit | Pass | Pass | Pass | **Partial**: client/job pass; project/task fail | Pass for client/job | Pass | Pass | Pass and refresh pass | Pass | Pass in consolidated build | Pass in shared runtime | **FAIL** | Persistent project/task API and browser workflow absent. |
| PulseDesk | Pass | Pass | Pass | **Partial**: department/request pass; requested client/contact/asset/ticket/note/time fail | Pass for department/request | Pass | Pass | Pass and refresh pass | Pass | Pass in consolidated build | Pass in shared runtime | **FAIL** | Requested data model absent and conflicts with the established healthcare-operations boundary. |
| TechDeck | Pass | Pass | Pass | **Partial**: server/firewall/runbook pass; client/site/VLAN/subnet fail | Pass for implemented records | Pass | Pass | Pass and refresh pass | Pass | Pass in consolidated build | Pass in shared runtime | **FAIL** | Persistent client/site/VLAN/subnet topology and UI absent. |
| TorqueShed | Pass | Pass | Pass | **Partial**: generic diagnostic case passes; required vehicle/session/code/measurement/assist/ledger/marketplace/community fail | Pass only for generic diagnostic case | Pass | Pass | **Fail** for `/diagnostics`; root direct URL passes | Pass | Pass in consolidated build | Pass in shared runtime | **FAIL** | First-class diagnostic model, Torque Assist adapter, token ledger, marketplace, community, and diagnostic deep route absent. |

## Verification results

- Final production-host acceptance gate: **28 pass evidence records, 10 fail**.
- Production-host SSO browser matrix: **2/2 passed** after rate-limit state was
  reset by restarting the disposable API process.
- Full isolated-PostgreSQL API suite: **670 tests; 664 passed, 0 failed, 6
  explicit live-HTTP skips** after the routing fix. A prior run against the
  acceptance database was discarded because pre-seeded catalog rows polluted
  test fixtures.
- Focused ecosystem/navigation regression suite: **15/15 passed**.
- Targeted database-backed tenant/module RBAC suite: **8/8 passed** against a
  clean disposable PostgreSQL database after the pre-handler fix.
- Root typecheck: API, runner gateway, and web **passed**.
- Root production build: API (including the workspace SDK), runner gateway,
  and Next web **passed**; the compiled API production start was exercised.
- The same build without `INTERNAL_API_URL` failed before compilation with the
  expected configuration error; the configured build used
  `INTERNAL_API_URL=http://localhost:5001` and passed.
- Final post-fix web typecheck and Next production build: **passed**.
- Live HTTPS `/healthz`: **200**.
- Live HTTPS `/readyz`: **200**, database/auth/SSO/registry healthy or
  configured; Stripe, email, Twilio, and OpenAI intentionally disabled in the
  local acceptance environment.
- Static placeholder scan found only input placeholder attributes, catalog
  status handling, and cards explicitly labeled `Migration pending —
  disabled`; no unfinished primary navigation destination was presented as
  functional.

## Release decision

No application in this matrix is production-ready under the supplied release
rule. The next work must be product implementation, not another acceptance
rerun: define the PulseDesk domain decision, implement the missing persistent
entities and module UI, add their tenant/RBAC/negative tests, and then rerun
this exact gate against an empty database and the deployed target.
