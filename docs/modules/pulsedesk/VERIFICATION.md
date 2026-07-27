# PulseDesk Phase 6 verification ledger

Assessment date: 2026-07-18

## Environment

- Branch: `codex/phase-6-pulsedesk-state-5`
- Database: disposable Docker `postgres:16` container
  `operatoros-phase6-postgres`, database `operatoros_phase6`, bound only to
  `127.0.0.1:55436`.
- Test mode: `APP_ENV=test`, `NODE_ENV=test`, non-production test-only session
  secret.
- Production-artifact mode: exact canonical OperatorOS hosts, production
  environment contract, local compiled API on 5001, compiled Next on 5000,
  short-lived HTTPS proxy on 443, and local-only bootstrap credential in the
  disposable database.
- No deployment, production database mutation, provider traffic, source write
  freeze, source attachment copy, importer apply, or cutover occurred.

The bundled workspace runtime provides `node` and `pnpm` but no `corepack`
shim, so the commands below use the equivalent pinned workspace `pnpm`.

## Fresh evidence

| Gate | Exact command / scope | Result |
| --- | --- | --- |
| PulseDesk focused domain/import/static/API suite | `pnpm --dir apps/api exec tsx --test <PulseDesk focused files>` with the disposable PostgreSQL URL | PASS 37/37 before the aggregate run; privacy, transitions, SLA, importer, schema/routes/UI and the complete workflow passed |
| Complete workflow after aggregate-bootstrap correction | `pnpm --dir apps/api exec tsx --test test/pulsedesk-state5-workflow.test.ts` on a new empty database | PASS 1/1 in 65,550 ms; Directory client -> facility -> department -> requester -> asset -> ticket, queues/teams/assignment, internal/requester messages, time, SLA, vendor/supply/facility, attachments, privacy/role/tenant/idempotency, lifecycle, archive and restart persistence |
| Final complete API regression | `pnpm --dir apps/api test` on a new empty database; the test harness owns schema initialization | PASS; 712 total, 706 passed, 0 failed, 6 HTTP-only skips, 1,305,103 ms |
| Workspace typecheck | `pnpm typecheck` | PASS for API, runner gateway and web |
| Database plan | `pnpm db:plan` | PASS; 19 explicit ordered steps; `pulsedesk_tables` follows TechDeck and precedes shared services; contract is additive/non-destructive |
| Database apply | `OPERATOROS_DATABASE_RELEASE_MODE=apply pnpm db:apply` on a new empty PostgreSQL 16 database | PASS; all 19 steps applied and verified in 26,277 ms |
| Production core preflight | Exact safe local production contract, then `pnpm preflight:production -- --core` | PASS |
| Production build | `INTERNAL_API_URL=http://localhost:5001 pnpm build:production` | PASS; API, runner and Next 14.2.35 artifacts; 20 static page-generation entries. The repository has no lint gate; root typecheck passed separately |
| Compiled runtime | `node scripts/start-unified-runtime.mjs` with the exact production contract and disposable DB | PASS after supplying the required local-only bootstrap secret; idempotent 19-step release, Fastify readiness and Next readiness passed |
| Local health and deep-link smoke | Host-preserving requests to compiled runtime | PASS; `operatoros.net/healthz` 200, `api.operatoros.net/readyz` 200, anonymous PulseDesk API 401, and `/dashboard`, `/tickets`, `/tickets/:id`, `/assets`, `/supplies`, `/facilities`, `/knowledge`, `/admin` each returned an exact-host 307 PKCE redirect preserving its path |
| Production-host SSO/browser matrix | HTTPS proxy plus `E2E_PRODUCTION_HOSTS=1 pnpm --dir apps/web test:e2e:sso` | PASS 2/2 in 3.9 minutes across 12 enabled module hosts; includes direct deep link, return, refresh, browser Back, PulseDesk sibling SSO, host-only local logout and global revocation |
| Migration dry-run CLI | `pnpm import:pulsedesk:dry-run -- --input apps/api/test/fixtures/pulsedesk-export-v1.json` | PASS; fingerprint `2371e62e36925e22ffea4a9f3adcf77d352aea3bd8d970c27b18b95584b5dffe`; 34/34 references resolved, zero missing, zero privacy findings; two shared Directory organization targets; standalone identity/session/subscription, credential and attachment-byte rows excluded |
| Public/deployed target | Not run; deployment not authorized | BLOCKED; the earlier public read-only result remains 32/47 on an older revision |
| Lint/format | No repository command exists | NOT DEFINED; no pass is claimed |

## Rejected/intermediate runs

The first aggregate invocation was run after `db:apply` had intentionally
seeded fixed catalog module slugs. Tests that own those fixtures reported 19
duplicate/contamination failures; its 687 pass, 19 fail and 6 skip result is
not clean-suite evidence. The next empty-database aggregate exposed that the
shared test bootstrap had not yet called `ensurePulseDeskTables`: the workflow
reported missing new columns/tables, its teardown cascaded, and the later SSO
fixture encountered the leftover module. This was corrected by wiring the
same idempotent PulseDesk initializer into `ensureSchemaReady` and making the
workflow teardown resilient. The clean focused and final aggregate passes
above are authoritative.

The first production-runtime start also failed closed because production mode
requires an explicit bootstrap-admin password on an empty database. The rerun
used a local-only credential in the disposable database and passed. No
real or runtime credential value is stored in source or this ledger; the
versioned importer fixture contains only an explicit excluded test sentinel.

## State decision

The approved PulseDesk product, privacy controls, migration planner and local
production artifacts meet source/local consolidation state 4. State 5 remains
blocked until the exact reviewed cumulative revision is deployed, the public
48/48 verifier passes, authenticated deployed PulseDesk workflow/privacy/
second-tenant/provider checks pass, and a human authorizes and reconciles the
privacy-reviewed export, apply and cutover in `CUTOVER_PLAN.md`.
