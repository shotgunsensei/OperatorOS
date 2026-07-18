# OperatorOS current release gate

- Evidence date: 2026-07-17
- Candidate branch: `codex/phase-2-shared-business-directory`
- Phase 0 base: `a4598f6ae3dcc16896a48b05962f9a0002071363`
- Phase 1 implementation commit: `50d3b616ed2af8f50c983d29e161baf3c943130f`
- Phase 1 closure commit: `c3e55f7`
- Platform and Phase 2 source/local gate: **PASS**
- Public deployment gate: **FAIL (32/47)**
- Overall release decision: **CLOSED — do not promote or begin Phase 3**

## Decision

Phase 1 has produced a reproducible, fail-closed control-plane deployment and
verified it locally through the production build, compiled supervisor, restored
PostgreSQL data, HTTPS canonical-host routing, SSO, deep links, logout,
authorization, tenant isolation, and health/readiness paths.

At the owner's explicit direction, Phase 2 added the shared Business Directory
and passed its local database, browser, build, and health gates. That source
progress does not waive the still-failed public deployment gate.

The candidate was not deployed because deployment/publishing was not
authorized. The current public hosts still serve an older release. The release
gate remains closed until a human deploys the reviewed commit and the public
verifier reaches 47/47 plus authenticated browser acceptance on that exact
revision.

No module is declared production-ready by this platform gate. Real workflow
and migration parity remain controlled by the module parity index.

## Gate matrix

| Gate | Result | Fresh evidence |
| --- | --- | --- |
| Frozen dependency contract | PASS FROM PHASE 0 | Pinned pnpm `10.34.5`; lockfile unchanged by Phase 1 |
| Production environment contract | PASS | Machine-readable contract plus 7 preflight tests; core CLI preflight passed with exact canonical values and non-secret local test credentials |
| Unsafe configuration rejection | PASS | Rejects missing/short secrets, legacy `APP_URL`, parent `COOKIE_DOMAIN`, public unified-runtime API URL, unsafe commands, legacy SSO rollback, wildcard/insecure/credentialed/loopback CORS, and drifted module hosts |
| Database release plan | PASS | `db:plan` emits 15 ordered, additive, secret-free steps; `db:apply` passed twice on a clean Phase 2 rehearsal database |
| Backup/restore rehearsal | PHASE 1 PASS; PHASE 2 OPEN | Phase 1 PostgreSQL 16.14 custom dump passed; the new directory schema still requires a restore rehearsal before promotion |
| Restored data/constraints | PASS | Source and target matched for core rows; both had 61 public tables, 100 foreign keys, and 0 unvalidated foreign keys |
| Production build | PASS | `corepack pnpm build:production`; API, runner gateway, and Next built after mandatory workspace typecheck; 20 Next routes generated |
| Compiled production supervisor | PASS | Compiled database release ran, compiled Fastify reached readiness on 5001, and Next reached ready on 5000; no `tsx` production runtime |
| Local canonical-host health | PASS | HTTPS apex `/healthz` returned 200 with `operatoros-api`; API `/readyz` returned 200 with database/auth/SSO/registry configured |
| Local public URL diagnostics | PASS | TechDeck diagnostic resolved forwarded exact host, HTTPS origin, module role, and host-only cookie mode |
| Production-host SSO browser gate | PASS LOCALLY | 2/2 Playwright scenarios in 25.3 seconds across root/app/auth and all 12 enabled modules; PKCE/state/nonce, exact callbacks, host-only cookies, deep-link return, Back, refresh, silent sibling launch, local logout, and global revocation passed |
| Focused Phase 1 tests | PASS | 11/11 database-release, preflight, and supervisor contract tests |
| Focused Phase 2 tests | PASS | 9/9 directory, UI, deep-link, and release-contract tests |
| Phase 2 browser workflow | PASS LOCALLY | 1/1 on compiled artifacts; CRUD, refresh persistence, same organization ID across three modules, and no script-readable auth |
| Full API regression | PASS | 679/679 against a clean disposable PostgreSQL database; 0 failed, 0 skipped, 152,058.1447 ms |
| Public read-only runtime verifier | FAIL | 32/47 on 2026-07-17; no authentication and no mutation |
| Formatting/lint | NOT DEFINED | Repository has no supported formatting or lint script; no pass is claimed |

## Public deployment blocker

The 2026-07-17 read-only verifier confirmed TLS/host attachment, API
readiness, all 17 public diagnostics, every enabled callback route, and
OutCall's fail-closed callback. It failed these release-critical checks:

- `https://operatoros.net/healthz` returned 404.
- The apex `/app` path did not emit the registered PKCE authorization request.
- The app host and all 12 enabled module launch redirects lacked the three
  host-only SSO transaction cookies expected from the candidate release.

This signature is consistent with the reviewed source not being deployed. It
is not fixed by changing DNS, widening cookies, adding legacy redirects, or
weakening the verifier.

## Human deployment closure

1. Review and deploy the scoped Phase 1/2 revision through the `.replit` autoscale
   build/run path.
2. Validate the real production secrets with
   `corepack pnpm preflight:production -- --core`; enable provider profiles only
   when the corresponding feature is meant to be live.
3. Confirm the provider-managed backup is current before the database release.
4. Run `corepack pnpm verify:production` and require 47/47.
5. Run authenticated browser SSO, direct deep-link, return navigation, refresh,
   local logout, global logout, expired session, disabled entitlement, second
   tenant isolation, and unauthorized API checks on the deployed revision.
6. Record the deployed commit and results in this file and
   `docs/auth/VALIDATION_MATRIX.md`.

Until those steps pass, Phase 3 and all production-ready labels remain blocked.
