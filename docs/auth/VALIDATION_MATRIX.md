# OperatorOS SSO v1 validation matrix

- Refreshed: 2026-07-27
- Source/local result: **PASS**
- Public deployed result: **PASS (48/48 read-only gate)**
- Overall production gate: **CLOSED**

All platform and module callbacks use the exact `*.operatoros.net` registry.
Standalone product domains and the default Replit alias are not callbacks,
CORS origins, session domains, or return targets.

| Contract | Source/local result | Public result / blocker |
| --- | --- | --- |
| One OperatorOS identity | PASS | Public authenticated acceptance pending candidate deployment |
| No module-local credentials | PASS | No second login was used in the local 12-module gate |
| Exact registered clients/callbacks | PASS | Public callback routes are reachable, but launch is still on the older transaction behavior |
| Opaque single-use code | PASS | Deployed authenticated consume/replay test pending |
| State and nonce | PASS | Apex public launch does not yet emit the candidate registered request |
| PKCE S256 | PASS | Apex public launch did not emit `code_challenge_method=S256` |
| Environment/tenant/module/entitlement binding | PASS | Deployed authenticated negative tests pending |
| Replay and expiry rejection | PASS | Deployed authenticated negative tests pending |
| Host-only secure session | PASS | Public app/module launch responses lack the candidate transaction cookies |
| `SameSite=Lax`, `HttpOnly`, `Secure`, `Path=/` | PASS | Public transaction-cookie verification failed on 14 enabled launch registrations |
| No parent cookie domain | PASS | Must be rechecked after deployment; never set `COOKIE_DOMAIN` |
| No credential URL/storage leakage | PASS | Local browser navigation and storage checks passed across all enabled modules |
| Safe return URL/deep link | PASS | Public authenticated return test pending |
| Open-redirect rejection | PASS | Source tests and local deep-link browser flow passed |
| Session refresh | PASS | Source/database regression passed |
| Local logout | PASS | Local browser test revoked only TechDeck and preserved the sibling session |
| Global logout | PASS | Local browser test rotated token version and made a previously issued module session unusable |
| Direct module URL | PASS | Local TechDeck `/assets` deep link survived central login |
| Browser refresh | PASS | Every enabled module shell survived reload under its host session |
| Back navigation / loop prevention | PASS | Browser Back did not restart central authentication |
| Silent sibling launch | PASS | PulseDesk reused the existing auth-host session without second credential entry |
| OutCall module boundary | PASS LOCALLY | Exact callback and host-only session pass; non-entitled tenant is denied; live provider remains fail closed |
| Tenant isolation and authorization | PASS | Clean aggregate suite includes cross-tenant denial, viewer write denial, and module-session sealing |
| Structured safe observability | PASS | Request/correlation context is logged without raw codes, cookies, secrets, or passwords |
| Health/readiness | PASS | Public `/api/health` and `/readyz` return the API snapshot and exact release identity; Replit reserves raw `/healthz` before the app |

## Fresh evidence

### Local production topology

The Phase 1 candidate was built and started through the production supervisor
against a restored PostgreSQL database. A short-lived TLS proxy preserved each
canonical Host header while mapping the browser to the local runtime.

`E2E_PRODUCTION_HOSTS=1 corepack pnpm --dir apps/web test:e2e:sso` passed 2/2
in 25.3 seconds. The registry-derived test covered the auth and app hosts plus
all 13 enabled module hosts. It asserted one credential entry, exact callback,
PKCE/state/nonce, host-only cookies, no credential query/storage leakage,
reload, direct deep-link return, browser Back, silent sibling launch, local
logout, and global revocation.

Local HTTPS probes also returned:

- `operatoros.net/healthz`: HTTP 200, service `operatoros-api`.
- `api.operatoros.net/readyz`: HTTP 200, database healthy, auth configured,
  SSO code encryption configured, module registry configured.
- `techdeck.operatoros.net/api/diagnostics/public-url`: HTTP 200, exact
  forwarded HTTPS module host and host-only cookie mode.

### Source/database regression

- Focused Phase 1 deployment/security contracts: 11/11 passed.
- Complete API suite: 679/679 passed, 0 failed, 0 skipped against a clean
  disposable PostgreSQL 16.14 database.
- Phase 2 compiled-runtime directory browser workflow: 1/1 passed locally;
  this adds persistence evidence but does not replace deployed SSO validation.
- Production build: API, runner gateway, and Next passed after the required
  workspace typecheck.

### Public read-only verification

`corepack pnpm verify:production` ran without authentication or mutation on
2026-07-27:

- 48/48 passed against merge `c249a75396104e7aabd773e564be6a95ada56467`,
  build `2eb701089a539d9e6da5af80`.
- API health/readiness and release identity, auth security headers, all 17
  host diagnostics, root/app plus all 13 enabled PKCE authorization responses,
  every callback route, and OutCall's fail-closed callback passed.
- The verifier now follows the authoritative contracts: root `/login`,
  `operatoros_sso_*` transaction cookies, and the Fastify health snapshot
  through `/api/health` because Replit reserves raw `/healthz`.

This closes the unauthenticated public deployment gate without weakening
cookies, callbacks, redirects, or health semantics. The authenticated browser
matrix remains required on the exact deployed revision.

## Remaining deployed acceptance

After authorized deployment, run and record:

1. **PASS:** Public read-only verifier 48/48, including exact release identity.
2. Real configured test-user login and entitled My Apps filtering.
3. Direct and launcher-based entry for the primary modules.
4. Deep-link return, refresh, expired session, disabled entitlement, local
   logout, and coordinated global logout.
5. Second-tenant isolation and unauthorized direct API calls.
6. Persistent module workflows only when their parity phase reaches its own
   completion gate.

Until the remaining steps pass, SSO v1 has public contract evidence but the
production release and State 5 certifications remain unaccepted.
