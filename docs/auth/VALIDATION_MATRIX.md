# OperatorOS SSO v1 validation matrix

Date: 2026-07-14. Overall gate: **FAIL — do not enable production v1 clients yet.**

All 13 module destinations are the attached `*.operatoros.net` subdomains.
Standalone branded domains are legacy references only; they are not SSO
callbacks, canonical application hosts, or pending DNS migration targets.

| Layer | Result | Evidence / blocker |
|---|---|---|
| Workspace typecheck | PASS IN SOURCE | Root workspace, API, runner gateway, and web TypeScript checks completed |
| API/runner build | PASS IN SOURCE | Fastify API and runner-gateway production compilation completed as part of the root workspace build |
| Next production build | PASS IN SOURCE | Next 14 production compilation completed with `INTERNAL_API_URL=http://localhost:5001`; `/logout` and `/modules/[slug]/[...path]` are present in the route manifest |
| Production-host browser SSO gate | PASS LOCALLY | Playwright 1.61.1 drove HTTPS `operatoros.net`, `auth.operatoros.net`, and the three core module hosts through a TLS/host-preserving proxy. One credential entry established independent host-only sessions, TradeFlowKit/TechDeck/PulseDesk launched silently, callbacks contained only `code` + `state`, final URLs were clean, reloads remained authenticated, browser storage contained no bearer, and global logout invalidated the module sessions. Final rerun: 1/1 passed in 15.0s with no API error lines. |
| Canonical `/login` executable contract | PASS IN SOURCE | 4/4 middleware executions passed for apex/app callbacks, same-host fallback, safe `next`, registration mode, PKCE transaction cookies, and cross-host/recursive return rejection |
| Core module deep-link dispatch | PASS IN SOURCE | 3/3 focused tests passed. Supported TradeFlowKit, TechDeck, and PulseDesk routes focus their live native workflow; malformed, nested, pending, non-core, and unsupported paths fail closed with module-scoped recovery UI |
| TradeFlowKit revenue workflow | PASS IN ISOLATED POSTGRESQL | 2/2 focused tests passed for customer → job → quote → accepted quote → idempotent invoice → manual payment, including exact integer-cent totals, linked-job state, tenant isolation, viewer write denial, and customer-payment separation from platform billing. `/customers`, `/jobs`, `/quotes`, and `/invoices` now deep-link to the native shell. |
| Replit proxy/IP trust boundary | PASS IN SOURCE | 4/4 focused tests passed. `TRUST_PROXY` is false by default and only `1`/`true` enables Fastify forwarded-IP trust; spoofed forwarding headers are ignored when disabled |
| Native add-on user lifecycle cleanup | PASS IN ISOLATED POSTGRESQL | 2/2 focused hard-delete tests passed with explicit test DB configuration; CallCommand, StudyForge, Ninjamation, and Ninja Launch Kit rows delete atomically and roll back on a later FK failure |
| Native workflow modules | PASS IN ISOLATED POSTGRESQL | 5/5 focused tests passed for TorqueShed, FaultlineLab, BrandForgeOS, and SnapProofOS: persisted CRUD, product-specific status contracts, optimistic concurrency, soft deletion, cross-tenant isolation, and viewer read/write separation. API and web typechecks pass. |
| Authentication denial short-circuit | PASS IN SOURCE | Denied pre-handler regression passed; a 401 now returns the sent Fastify reply and never executes `/auth/me` handlers with an undefined user |
| Per-host local logout revocation | PASS IN ISOLATED POSTGRESQL | Focused replay test passed: the presented JWT is denied with `SESSION_REVOKED`, a distinct sibling module session remains valid, and only a 64-character SHA-256 fingerprint is stored. API typecheck and the related auth/security, cleanup, and shared SSO route tests passed. |
| Complete API regression suite | PASS IN ISOLATED POSTGRESQL | 619 tests executed from a clean PostgreSQL database: 613 passed, 0 failed, and 6 live-HTTP checks were explicitly skipped because no Next development server was running. The suite covers auth, SSO, exact 13-module hosts, tenant isolation, entitlements, billing boundaries, module workflows, lifecycle cleanup, and source/runtime contracts |
| Canonical redirect scheme policy | PASS IN SOURCE | 15/15 focused public-URL and launch-flow tests passed. Every registered platform and 13-module production origin requires HTTPS; HTTP is accepted only for loopback development origins, and login revalidates API-returned callback URLs before navigation |
| API DB-backed SSO exchange tests | PASS IN ISOLATED POSTGRESQL | 38/38 passed across auth security, shared SSO routes, consume rejection, diagnosis, exchange endpoint, and cleanup coverage. This verifies atomic consume, replay/expiry rejection, persisted exchange state, and the shared database initialization path |
| Tenant/module viewer authority | PASS IN SOURCE AND DATABASE | 14/14 focused viewer normalization/write-gate tests passed; tenant RBAC passed 12/12; and the complete clean-database suite passed the Ninja Pool tenant-viewer, entitlement, isolation, invite, and lifecycle assertions |
| Imported source snapshot `tsc` | NOT RUN BY DESIGN | Snapshots are outside the executable workspace and their dependencies are intentionally not installed; they are auditable migration inputs, not independently deployed release builds |
| Unified source `/sso` callback | PASS | Shared Next callback calls same-origin Fastify browser exchange; code is removed from browser history |
| Source browser transaction controls | PASS | Exact host/callback, state, nonce, S256 PKCE, runtime-environment binding, expiry, atomic replay protection, and entitlement recheck are enforced |
| Platform/module session boundary | PASS IN SOURCE | Root/app receive platform sessions without tenant/module claims; module sessions bind one exact module and tenant; credential/account flows reject module and public Replit hosts |
| Global module authority | PASS IN SOURCE | Archived, disabled, hidden, or unavailable modules are denied before platform-admin entitlement override; OutCall remains planned/disabled |
| Canonical Replit subdomain attachment/TLS | PASS LIVE | HTTPS requests reached the apex, `app`, `auth`, `api`, and all 13 module subdomains on 2026-07-14. Attachment alone does not prove the new application release or correct host routing |
| Live API host routing | FAIL | `https://api.operatoros.net/` returned the Next HTML application and both apex/API `/healthz` returned 404; the source `beforeFiles` API proxy is not deployed |
| Live canonical module-host routing | FAIL | All 13 attached hosts responded, but BrandForgeOS, StudyForge AI, Ninja Launch Kit, and CallCommand AI returned HTTP 200 at `/` instead of entering the protected module lane; the other nine hosts used the older `next`-only redirect and every module `/sso?code=probe&state=probe` returned 404 |
| Live authorization request shape | FAIL | Anonymous app/core-module redirects contain only the legacy `next` parameter; deployed redirects do not yet carry the registered `client_id`, exact `redirect_uri`, state, nonce, and S256 challenge |
| OperatorOS live `/sso?code=probe` | FAIL | Older deployed release returned HTTP 404 on 2026-07-14 |
| PulseDesk live `/sso?code=probe` | FAIL | Older deployed release returned HTTP 404 on 2026-07-14 |
| TradeFlowKit live `/sso?code=probe` | FAIL | Older deployed release returned HTTP 404 on 2026-07-14 |
| TechDeck live `/sso?code=probe` | FAIL | Older deployed release returned HTTP 404 on 2026-07-14 |
| Live auth and redirect header policy | FAIL | Login still returns `s-maxage=31536000, stale-while-revalidate`; module redirects still emit `os_sso_redirects` with `Domain=.operatoros.net` and no `Referrer-Policy`. Current source uses host-only cookies and no-store security headers, but it is not deployed |
| Authenticated browser launch/reload/logout | PASS LOCALLY / BLOCKED LIVE | The production-host local browser gate passes for root + all three core modules, reload, URL/storage/cookie checks, and global logout. The same test cannot pass against public hosts until the current source is deployed |
| Public browser state/nonce/PKCE | PASS IN SOURCE | Target-host HttpOnly transaction cookies and sealed code bindings are compared before session creation; no browser client secret |

## Required actions to turn the gate green

1. Deploy the unified Next/Fastify release; the canonical Replit subdomains are
   already attached, so this is an application-release and environment task,
   not a DNS migration.
2. Configure `DATABASE_URL`, `SESSION_SECRET`, an independent 32+ character
   `SSO_CODE_ENCRYPTION_SECRET`, `APP_ENV=production`, `NODE_ENV=production`,
   `OPERATOROS_BASE_URL=https://operatoros.net`,
   `INTERNAL_API_URL=http://localhost:5001`, and `TRUST_PROXY=true` in Replit
   Secrets. Keep `APP_URL` unset, keep `ALLOW_LEGACY_SSO_ROLLBACK` absent or
   false, and do not distribute `MODULE_SSO_SECRET` except for an explicitly
   approved emergency rollback.
3. Verify every enabled exact callback reaches the shared `/sso` page and
   same-origin `/api/sso/browser-exchange` route; verify OutCall returns the
   controlled planned/disabled state without creating a session.
4. Keep the clean-database 613-pass/0-fail complete API result, focused 38/38
   SSO result, 12/12 tenant-RBAC result, and the production-host browser gate
   green for the deployment commit.
5. Re-run the authenticated production-host browser gate against the deployed
   public hosts, then complete the remaining negative cases for revoked
   entitlement, disabled tenant/user/module, replay, and expired code.
6. Re-run the live header probe and require non-404 callbacks plus `Cache-Control: no-store` and `Referrer-Policy: no-referrer` on auth/callback surfaces.

The production gate must remain closed until every FAIL/BLOCKED row above passes.
