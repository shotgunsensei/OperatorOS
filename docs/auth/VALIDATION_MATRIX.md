# OperatorOS SSO v1 validation matrix

- Refreshed: 2026-08-02
- Phase 18 source/isolated-candidate result: **PASS FOR CONTRACTS AND LOCAL BROWSER**
- Current public baseline: **PASS under the pre-Phase-17 48/48 gate**
- Phase 17 public candidate gate: **EXPECTED PRE-DEPLOY FAIL 45/48**
- Overall production gate: **CLOSED**

All platform and module callbacks use the exact `*.operatoros.net` registry.
Standalone product domains and the default Replit alias are not callbacks,
CORS origins, session domains, or return targets.

| Contract | Source/local result | Public result / blocker |
| --- | --- | --- |
| One OperatorOS identity | PASS | Current public baseline works; Phase 17 authenticated gate pending deployment |
| No module-local credentials | PASS | Active module source uses only the shared exact-host session and SSO boundary |
| Exact registered clients/callbacks | PASS | Source contracts cover all 13 active product clients, including exact OutCall callback registration |
| Opaque single-use code | PASS | Deployed authenticated consume/replay test pending |
| State and nonce | PASS | Current public authorization entry passes; Phase 17 exact deployed run pending |
| PKCE S256 | PASS | Current public authorization entry passes; Phase 17 exact deployed run pending |
| Environment/tenant/module/entitlement binding | PASS | Fresh Phase 18 local gate returned `MODULE_ACCESS_DENIED` for tenant-disabled TechDeck and OutCall; deployed rerun pending |
| Replay and expiry rejection | PASS | Deployed authenticated negative tests pending |
| Host-only secure session | PASS | Fresh local Phase 18 canonical-host checks pass across platform and module sessions; deployed rerun pending |
| `SameSite=Lax`, `HttpOnly`, `Secure`, `Path=/` | PASS | Fresh local Phase 18 browser checks pass |
| No parent cookie domain | PASS | Must be rechecked after deployment; never set `COOKIE_DOMAIN` |
| No credential URL/storage leakage | PASS | Fresh Phase 18 local browser evidence passes across all 13 active product modules; deployed rerun remains pending |
| Safe return URL/deep link | PASS | Public authenticated return test pending |
| Open-redirect rejection | PASS | Source tests and local deep-link browser flow passed |
| Session refresh | PASS | Source/database regression passed |
| Local logout | PASS | Local browser test revoked only TechDeck and preserved the sibling session |
| Global logout | PASS | Local browser test rotated token version and made a previously issued module session unusable |
| Direct module URL | PASS | Local TechDeck `/assets` deep link survived central login |
| Browser refresh | PASS | Every enabled module shell survived reload under its host session |
| Back navigation / loop prevention | PASS | Browser Back did not restart central authentication |
| Silent sibling launch | PASS | PulseDesk reused the existing auth-host session without second credential entry |
| OutCall module boundary | PASS LOCALLY | Catalog, registry, seed, SSO selector, commercial boundary, and deployed-acceptance contract treat OutCall as active. Non-entitled organizations receive `MODULE_ACCESS_DENIED`; provider features fail closed until exact live configuration is present |
| Tenant isolation and authorization | PASS | Clean aggregate suite includes cross-tenant denial, viewer write denial, and module-session sealing |
| Structured safe observability | PASS | Request/correlation context is logged without raw codes, cookies, secrets, or passwords |
| Health/readiness | PASS LOCALLY; PUBLIC CANDIDATE PENDING | Strict compiled supervisor reports healthy API/web, configured SSO/worker, and DB v33/33 on merged-main identity `d96c698`; current public deployment remains older |

## Fresh evidence

### Phase 18 merged-main local release closure

The compiled v33 candidate started through the production readiness-gated
supervisor on merged-main identity `d96c698`, build
`50b91a50eab34dcbef995bbe`. API and web health were healthy, the database was
healthy at release v33/33, and SSO encryption plus the shared worker were
configured.

`E2E_PRODUCTION_HOSTS=1 corepack pnpm --dir apps/web test:e2e:sso` passed
12/12 in 1.9 minutes on one uninterrupted run. The registry-derived gate
covered the auth/app hosts and all 13 active module hosts, one credential entry,
PKCE/state/nonce, exact callbacks, Secure host-only cookies, no credential
query/storage leakage, persistence, direct deep links, browser Back, silent
sibling launch, local/global logout, and tenant denial for TechDeck and
OutCall. A separate compiled first-screen run passed 2/2 in 7.4 seconds and
exercised OutCall's deterministic verified-self workflow without external
traffic.

This is local evidence only. The production-safe deployed 3/3 gate, exact
public release identity, real provider acceptance, backup/apply and rollback
remain human-gated.

### Historical Phase 17 compiled candidate

The Phase 17 candidate ran through the compiled readiness-gated supervisor
against disposable PostgreSQL 16 and a canonical-host TLS proxy. The complete
release identity was present on health/readiness. Focused browser runs passed:

- 1/1 in 29.5 seconds for one-login SSO across all 12 enabled modules and
  global revocation;
- 1/1 in 20.1 seconds for TechDeck deep-link return, browser Back, PulseDesk
  silent sibling SSO, persistent workflow, and TechDeck host-local logout;
- 1/1 in 5.3 seconds for tenant entitlement denial and the then-disabled
  OutCall boundary. Phase 18 supersedes that product state.

The post-deploy command is
`corepack pnpm --dir apps/web test:e2e:phase17-deployed`. It requires two
pre-provisioned synthetic accounts and the six `E2E_PHASE17_*` values listed
in `docs/PHASE17_PRODUCTION_RELEASE_RUNBOOK.md`; it performs no direct database
write or registration.

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

The 2026-07-29 public baseline identified commit
`48b8691fca5c8a8d79f53b309cb44db79698bbcd`, build
`932f83cb0d7c15ce994eb04e`, and passed the pre-change 48/48 verifier.

The strengthened Phase 17 verifier then returned 45/48 against that unchanged
release. Root health and API readiness lack the new deployment/database
identity, and the old OutCall callback still renders. All other 45 public
checks pass. This expected failure is the evidence that Phase 17 is not
deployed; it does not authorize weakening any identity, callback, or disabled
module assertion.

## Remaining deployed acceptance

After authorized deployment, run and record:

1. Set `OPERATOROS_EXPECTED_RELEASE_COMMIT` to the deployed merge and require
   48/48 from `corepack pnpm verify:production`.
2. Load the six acceptance-account values and require 3/3 from
   `corepack pnpm --dir apps/web test:e2e:phase17-deployed`.
3. Record the Replit deployment/build IDs and timestamps in the Phase 17
   evidence report.
4. Run persistent module/provider workflows only when their separate parity or
   provider phase reaches its own completion gate.

Until the remaining steps pass, SSO v1 has public contract evidence but the
production release and State 5 certifications remain unaccepted.
