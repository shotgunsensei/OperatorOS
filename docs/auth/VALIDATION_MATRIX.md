# OperatorOS SSO v1 validation matrix

Baseline refreshed: 2026-07-16. Overall gate: **FAIL — do not enable production v1 clients yet.**

All 13 module destinations are the attached `*.operatoros.net` subdomains.
Standalone branded domains are legacy references only; they are not SSO
callbacks, canonical application hosts, or pending DNS migration targets.

| Layer | Result | Evidence / blocker |
|---|---|---|
| Workspace typecheck | PASS IN SOURCE | Root workspace, API, runner gateway, and web TypeScript checks completed |
| API/runner build | PASS IN SOURCE | Fastify API and runner-gateway production compilation completed as part of the root workspace build |
| Next production build | PASS IN SOURCE | The exact Replit build path completed on the pinned pnpm 10.34.5 install without Corepack, then Next 14 compiled directly from `apps/web` with `INTERNAL_API_URL=http://localhost:5001`; `/logout` and `/modules/[slug]/[...path]` are present in the route manifest |
| Production-host browser SSO gate | PASS LOCALLY FOR ALL 12 ENABLED MODULES | Playwright 1.61.1 drove HTTPS `operatoros.net`, `auth.operatoros.net`, and every enabled module subdomain through a TLS/host-preserving proxy: the fresh Phase 0 gate passed 2/2 in 32.6s. The registry-derived gate covers one credential entry, exact callbacks, independent host-only cookies, reload persistence, clean URLs/storage, global revocation, a direct TechDeck deep link, browser Back without reauth looping, silent sibling-tab PulseDesk launch, and host-only local logout. |
| Canonical `/login` executable contract | PASS IN SOURCE | 4/4 middleware executions passed for apex/app callbacks, same-host fallback, safe `next`, registration mode, PKCE transaction cookies, and cross-host/recursive return rejection |
| Core module deep-link dispatch | PASS IN SOURCE | 3/3 focused tests passed. Supported TradeFlowKit, TechDeck, and PulseDesk routes focus their live native workflow; malformed, nested, pending, non-core, and unsupported paths fail closed with module-scoped recovery UI |
| TradeFlowKit revenue workflow | PASS IN ISOLATED POSTGRESQL | 2/2 focused tests passed for customer → job → quote → accepted quote → idempotent invoice → manual payment, including exact integer-cent totals, linked-job state, tenant isolation, viewer write denial, and customer-payment separation from platform billing. `/customers`, `/jobs`, `/quotes`, and `/invoices` now deep-link to the native shell. |
| TechDeck operations workflow | PASS IN ISOLATED POSTGRESQL | 2/2 focused database tests passed for versioned asset posture, derived alerts, cross-tenant isolation, viewer read/write separation, member-authored runbooks, tenant-admin approval, audit redaction, and the no-execution boundary. Twelve route/UI/deep-link contract tests, API/web typechecks, and the Next production build also pass. `/assets`, `/alerts`, `/scripts`, and `/network` resolve to the native workspace. |
| Unified Replit process supervision | PASS LOCALLY | The Corepack-free deployment launcher invokes the installed `tsx` and Next entrypoints with the current Node executable, validates production authority, waits for private Fastify `/readyz`, then starts public Next from the correct `apps/web` working directory. A disposable-PostgreSQL rehearsal returned 200 from apex `/healthz`, API `/readyz`, and TechDeck public-URL diagnostics; both processes shut down cleanly. |
| Production environment preflight | PASS IN SOURCE | Names-only core/revenue/email/CallCommand/AI profiles validate required authority, all thirteen exact canonical module origins, live Stripe Price/webhook configuration, Resend sender delivery configuration, Twilio connector-or-env readiness, canonical webhook origin, and OpenAI presence without printing secret values. A drift test keeps `.replit` aligned with the authoritative URL map. Production values in Replit's Publishing environment remain a deployment-time gate. |
| Read-only production runtime verifier | PASS IN SOURCE | Registry-derived verification covers platform health/readiness, exact diagnostics for all platform/module hosts, enabled anonymous PKCE request shape and host-only transaction cookies, enabled callback reachability/security headers, forbidden credential query names, and OutCall's fail-closed callback. It runs with `npm run verify:production` after deployment and performs no authentication or mutation. |
| Replit proxy/IP trust boundary | PASS IN SOURCE | 4/4 focused tests passed. `TRUST_PROXY` is false by default and only `1`/`true` enables Fastify forwarded-IP trust; spoofed forwarding headers are ignored when disabled |
| Native add-on user lifecycle cleanup | PASS IN ISOLATED POSTGRESQL | 2/2 focused hard-delete tests passed with explicit test DB configuration; CallCommand, StudyForge, Ninjamation, and Ninja Launch Kit rows delete atomically and roll back on a later FK failure |
| Native workflow modules | PASS IN ISOLATED POSTGRESQL | 5/5 focused tests passed for TorqueShed, FaultlineLab, BrandForgeOS, and SnapProofOS: persisted CRUD, product-specific status contracts, optimistic concurrency, soft deletion, cross-tenant isolation, and viewer read/write separation. API and web typechecks pass. |
| Authentication denial short-circuit | PASS IN SOURCE | Denied pre-handler regression passed; a 401 now returns the sent Fastify reply and never executes `/auth/me` handlers with an undefined user |
| SSO correlation and decision observability | PASS IN SOURCE | Route-scoped hooks generate correlation/launch IDs, add `X-Correlation-ID` to every SSO response, add it to bounded JSON errors, record normalized decisions and duration with safe identity/tenant/module context, and never log or echo raw browser codes/cookies. Both `/v1` and same-origin `/api` exchange aliases share the contract. |
| Per-host local logout revocation | PASS IN ISOLATED POSTGRESQL | Focused replay test passed: the presented JWT is denied with `SESSION_REVOKED`, a distinct sibling module session remains valid, and only a 64-character SHA-256 fingerprint is stored. API typecheck and the related auth/security, cleanup, and shared SSO route tests passed. |
| Complete API regression suite | PASS IN ISOLATED POSTGRESQL | The fresh Phase 0 run executed 671 tests from a clean PostgreSQL database: 665 passed, 0 failed, and 6 live-HTTP checks were explicitly skipped because no Next development server was running. The suite covers auth, SSO correlation/decision observability, exact 13-module hosts, tenant isolation, entitlements, billing boundaries, module workflows, lifecycle cleanup, production verification contracts, and source/runtime behavior. Database-pool and rate-limit maintenance handles are non-blocking, so the aggregate exits deterministically. |
| Canonical redirect scheme policy | PASS IN SOURCE | 15/15 focused public-URL and launch-flow tests passed. Every registered platform and 13-module production origin requires HTTPS; HTTP is accepted only for loopback development origins, and login revalidates API-returned callback URLs before navigation |
| API DB-backed SSO exchange tests | PASS IN ISOLATED POSTGRESQL | 38/38 passed across auth security, shared SSO routes, consume rejection, diagnosis, exchange endpoint, and cleanup coverage. This verifies atomic consume, replay/expiry rejection, persisted exchange state, and the shared database initialization path |
| Tenant/module viewer authority | PASS IN SOURCE AND DATABASE | 14/14 focused viewer normalization/write-gate tests passed; tenant RBAC passed 12/12; and the complete clean-database suite passed the Ninja Pool tenant-viewer, entitlement, isolation, invite, and lifecycle assertions |
| Imported source snapshot `tsc` | NOT RUN BY DESIGN | Snapshots are outside the executable workspace and their dependencies are intentionally not installed; they are auditable migration inputs, not independently deployed release builds |
| Unified source `/sso` callback | PASS | Shared Next callback calls same-origin Fastify browser exchange; code is removed from browser history |
| Source browser transaction controls | PASS | Exact host/callback, state, nonce, S256 PKCE, runtime-environment binding, expiry, atomic replay protection, and entitlement recheck are enforced |
| Platform/module session boundary | PASS IN SOURCE | Root/app receive platform sessions without tenant/module claims; module sessions bind one exact module and tenant; credential/account flows reject module and public Replit hosts |
| Global module authority | PASS IN SOURCE | Archived, disabled, hidden, or unavailable modules are denied before platform-admin entitlement override; OutCall remains planned/disabled |
| Canonical Replit subdomain attachment/TLS | PASS LIVE | HTTPS requests reached the apex, `app`, `auth`, `api`, and all 13 module subdomains on 2026-07-14. Attachment alone does not prove the new application release or correct host routing |
| Registry-derived public production matrix | FAIL LIVE (0/47) | The read-only verifier ran across all 17 exact hosts on 2026-07-14. The older deployment returned 404 for platform health/readiness and all 12 enabled callbacks, lacked no-store/no-referrer and host-only cookie behavior, emitted legacy non-PKCE redirects or unprotected 200 module roots, and returned 404 rather than a fail-closed redirect for OutCall's callback. This is the expected pre-deployment failure signature; deployment remains blocked. |
| Live API host routing | FAIL | `https://api.operatoros.net/` returned the Next HTML application and both apex/API `/healthz` returned 404; the source `beforeFiles` API proxy is not deployed |
| Live canonical module-host routing | FAIL | All 13 attached hosts responded, but BrandForgeOS, StudyForge AI, Ninja Launch Kit, and CallCommand AI returned HTTP 200 at `/` instead of entering the protected module lane; the other nine hosts used the older `next`-only redirect and every module `/sso?code=probe&state=probe` returned 404 |
| Live authorization request shape | FAIL | Anonymous app/core-module redirects contain only the legacy `next` parameter; deployed redirects do not yet carry the registered `client_id`, exact `redirect_uri`, state, nonce, and S256 challenge |
| OperatorOS live `/sso?code=probe` | FAIL | Older deployed release returned HTTP 404 on 2026-07-14 |
| PulseDesk live `/sso?code=probe` | FAIL | Older deployed release returned HTTP 404 on 2026-07-14 |
| TradeFlowKit live `/sso?code=probe` | FAIL | Older deployed release returned HTTP 404 on 2026-07-14 |
| TechDeck live `/sso?code=probe` | FAIL | Older deployed release returned HTTP 404 on 2026-07-14 |
| Live auth and redirect header policy | FAIL | Login still returns `s-maxage=31536000, stale-while-revalidate`; module redirects still emit `os_sso_redirects` with `Domain=.operatoros.net` and no `Referrer-Policy`. Current source uses host-only cookies and no-store security headers, but it is not deployed |
| Authenticated browser launch/reload/logout | PASS LOCALLY / BLOCKED LIVE | The production-host local browser gate passes for root + all twelve enabled modules, reload, URL/storage/cookie checks, deep-link return, browser Back without an auth loop, sibling-tab silent SSO, host-only local logout, and global revocation. The same test cannot pass against public hosts until the current source is deployed. |
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
   Run `npm run preflight:production -- --all` inside the production
   environment and require every claimed provider profile to pass without
   copying its secret output anywhere.
3. Verify every enabled exact callback reaches the shared `/sso` page and
   same-origin `/api/sso/browser-exchange` route; verify OutCall returns the
   controlled planned/disabled state without creating a session.
4. Keep the clean-database 665-pass/0-fail complete API result, focused 73/73
   auth/SSO/tenant/entitlement result, and the production-host browser gate
   green for the deployment commit.
5. Re-run the authenticated production-host browser gate against the deployed
   public hosts, then complete the remaining negative cases for revoked
   entitlement, disabled tenant/user/module, replay, and expired code.
6. Re-run the live header probe and require non-404 callbacks plus `Cache-Control: no-store` and `Referrer-Policy: no-referrer` on auth/callback surfaces.
   Run `npm run verify:production` and require every public check to pass
   before starting authenticated production browser tests.

The production gate must remain closed until every FAIL/BLOCKED row above passes.
