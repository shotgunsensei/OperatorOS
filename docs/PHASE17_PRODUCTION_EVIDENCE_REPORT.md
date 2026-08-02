# Phase 17 production truth and revenue release evidence

> Historical evidence. Phase 18 activates OutCall in source and supersedes the
> disabled-OutCall and 12-module assertions below. This report remains valid
> only for the exact Phase 17 identity recorded here.

- Evidence date: 2026-07-29
- Branch: `codex/phase-17-production-truth`
- Audited production commit:
  `48b8691fca5c8a8d79f53b309cb44db79698bbcd`
- Audited production build: `932f83cb0d7c15ce994eb04e`
- Decision: **DEPLOYABLE CANDIDATE; NOT DEPLOYED; PROMOTION BLOCKED**
- State 5 certifications issued: **0**

## Production truth at phase start

The public `/api/health` and `/readyz` snapshots identified commit
`48b8691fca5c8a8d79f53b309cb44db79698bbcd`, build
`932f83cb0d7c15ce994eb04e`, built at
`2026-07-29T16:49:23.946Z`. That commit exactly matched the refreshed
`origin/main`, so the pre-phase source-versus-production Git difference was
zero.

The pre-change public verifier passed 48/48 on that release. Database, auth,
SSO encryption, module registry, and shared worker readiness were healthy.
Stripe was disabled; email, Twilio, and OpenAI reported configured. That
baseline is confirmed public evidence, not evidence for the Phase 17 branch.

## Exact gaps found

1. Health/readiness exposed Git, build ID, build timestamp, and lockfile hash,
   but not an explicit database release version or deployment timestamp.
2. The public verifier could not require an intended candidate commit.
3. README and Replit policy described OutCall as planned/disabled, while the
   SDK catalog and machine-readable deployment registry still advertised it
   as live/enabled.
4. The existing authenticated matrix directly seeds its isolated database and
   therefore is not safe to aim at production.
5. No Replit deployment command/API credential was available in this
   workstation context.

## Candidate behavior

The candidate adds one release identity shared by root health and API
readiness:

- build contract version;
- Git commit;
- deterministic build ID;
- build timestamp;
- lockfile SHA-256;
- process deployment timestamp;
- database release contract version, release version `29`, step count `29`,
  and final step ID.

Production readiness fails closed when that identity is missing or malformed.
The public verifier can pin
`OPERATOROS_EXPECTED_RELEASE_COMMIT` and requires matching identities on both
health endpoints.

OutCall is now `coming_soon` in the canonical catalog, disabled in the
deployment registry, and reconciled to `coming_soon` during the idempotent
module seed. No OutCall tables or source evidence were deleted. Authenticated
handoff returns `MODULE_UNAVAILABLE`.

## Fresh local and isolated-candidate evidence

| Gate | Result |
| --- | --- |
| Database plan | PASS; contract v1, release v29, 29 non-destructive ordered steps |
| Clean release apply | PASS on disposable PostgreSQL 16 |
| Idempotent reapply | PASS; first apply 11.521 s, second 1.799 s |
| Focused contracts | PASS 46/46; release identity, DB contract, supervisor, registry, canonical URLs, SSO and browser-matrix contracts |
| Workspace typecheck | PASS; API, runner gateway, and web |
| Production build | PASS; SDK, API, runner gateway, and Next 15.5.22; 20 page entries |
| Core production preflight | PASS with exact canonical values and disposable non-production secrets; no secret values printed |
| Compiled supervisor | PASS; compiled release applied, Fastify readiness returned 200, then compiled Next started |
| Compiled release identity | PASS; commit `48b8691...`, build `7a81ca26c4483d5f8137e38e`, DB v29/29, valid build/deployment timestamps |
| Enabled-host SSO/global logout | PASS 1/1 in 29.5 s across all 12 enabled modules |
| Deep link/silent sibling/local logout | PASS 1/1 in 20.1 s for TechDeck and PulseDesk |
| Entitlement/disabled-module denial | PASS 1/1 in 5.3 s; TechDeck `MODULE_ACCESS_DENIED`, OutCall `MODULE_UNAVAILABLE` |
| Production-safe deployed gate contract | PASS 2/2 static tests; pre-provisioned accounts, no DB/register path, capture disabled |

The compiled candidate used the pre-commit base identity because the Phase 17
changes were still uncommitted at build time. It proves the identity mechanism,
not the final deployed candidate commit.

An attempted broad 9-test module-parity run passed the first three journeys,
then correctly failed the BrandForge AI workflow because the compiled
supervisor runs `APP_ENV=production` while that parity test requires the
deterministic `APP_ENV=test` AI provider. The run was stopped rather than
enabling a test provider in production mode. Phase 17 acceptance is covered by
the three focused browser gates above; unrelated provider workflows remain
their own module/provider gates.

The disposable PostgreSQL container and all synthetic acceptance data were
removed after verification.

## Public candidate comparison

The strengthened Phase 17 verifier was run read-only against the still-current
public release and returned **45/48**:

- FAIL root health: deployment timestamp and DB release identity absent;
- FAIL API readiness: deployment timestamp and DB release identity absent;
- FAIL OutCall disabled callback: the old release still rendered the exchange
  surface;
- PASS all other 45 checks.

This is the expected pre-deployment result and proves the branch has not been
misrepresented as live.

## Exact remaining blockers

1. **Review/merge:** review and merge the Phase 17 draft pull request.
2. **Backup owner action:** confirm a current provider-managed PostgreSQL
   backup under `docs/DATABASE_BACKUP_RESTORE.md`.
3. **Deploy owner action:** deploy merged `main` from Replit Deployments using
   `.replit` and `node scripts/start-unified-runtime.mjs`; record the deployment
   ID/build/timestamp here.
4. **Public gate command:** set
   `OPERATOROS_EXPECTED_RELEASE_COMMIT` to `git rev-parse origin/main`, run
   `corepack pnpm verify:production`, and require 48/48.
5. **Acceptance account owner action:** provision the two synthetic accounts
   described in `docs/PHASE17_PRODUCTION_RELEASE_RUNBOOK.md` and provide the six
   `E2E_PHASE17_*` values through an approved secret manager.
6. **Authenticated gate command:** run
   `corepack pnpm --dir apps/web test:e2e:phase17-deployed` and require 3/3.

No deployment, production database mutation, provider activation, promotion,
or Phase 18 commerce work is claimed by this report.
