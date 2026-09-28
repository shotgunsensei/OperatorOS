# Resolution Intelligence v64 production recovery evidence

2026-09-27 UTC. The owner explicitly authorized the production migration and
republish after the [deployment diagnosis](techdeck/resolution-intelligence-v64-deployment-diagnosis.md).
Source is Phase 4 merge `aa3e2ea08d4e60f2a5342c3395d73ec2f4948f81` (PR #107).
Replit's checkout was clean at that exact revision before release operations.

## Exact-source CI

The [fail-closed release gate](https://github.com/shotgunsensei/OperatorOS/actions/runs/36347620046)
completed successfully at `2026-09-27T20:44:54Z`. Its recorded results include
1,587 API, 52 unit, 102 integration, 32 browser journeys and four visual cases,
with no test failures or skips. These tests used CI's isolated database;
no test suite or synthetic fixture was run against Replit production/development.

## Backup and maintenance

Replit Production Database settings confirmed seven-day point-in-time recovery
enabled and restore controls available. Scheduled backups remain off. Production
was paused through Publishing; a refreshed Overview confirmed **John paused**
before the release apply. The initial Overview stayed on **is pausing** until
refresh, so that intermediate status was not accepted as completion.

A custom-format logical backup started at `2026-09-27T20:49:28Z`, encrypted using
AES-256-CBC with PBKDF2 (200,000 iterations) and a random private key. The encrypted
archive is **2,462,848 bytes**, with **3,860 table-of-contents lines**. SHA-256
verification and full `pg_restore --file=/dev/null` decoding passed. This proves
archive readability, not a completed restore rehearsal. Backup, key, private logs
and count snapshots remain outside Git in the restricted Replit temporary
directory `/tmp/operatoros-v64-recovery.3fYCbY`. This supplements provider PITR;
it is not durable offsite backup retention.

The first invocation using a URL in `PGDATABASE` failed before export because
libpq treated it as a database name. The corrected `pg_dump --dbname` export
completed without stderr. The metadata-only `pg_restore --list` closed its pipe
early and caused an OpenSSL write error; the separate full archive decode and
checksum passed before any migration. No backup failure was treated as success.

```bash
# Connection and key are privately selected, never literal command arguments in records.
pg_dump --dbname="$OOS_V64_PROD_URL" --format=custom --no-owner --no-acl |
  openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
    -pass file:"$OOS_V64_RECOVERY_DIR/backup.key" \
    -out "$OOS_V64_RECOVERY_DIR/production.dump.enc"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -pass file:"$OOS_V64_RECOVERY_DIR/backup.key" \
  -in "$OOS_V64_RECOVERY_DIR/production.dump.enc" |
  pg_restore --no-owner --no-acl --file=/dev/null
sha256sum -c "$OOS_V64_RECOVERY_DIR/production.sha256"
```

## Supported release and reconciliation

Environment: Replit Linux shell, Node 20.20.0, repository-pinned pnpm 10.34.5.
The production connection was held only in a temporary shell variable and
provided to each release process. The saved development connection stayed intact.
Production release processes used `APP_ENV=production`, `NODE_ENV=production`;
only the apply invocation received `OPERATOROS_DATABASE_RELEASE_MODE=apply`.

| Exact command / check | Observed result |
| --- | --- |
| `corepack pnpm --silent db:plan` | v64, 64 ordered steps, final `techdeck_resolution_intelligence_tables` |
| Production `corepack pnpm db:verify` before apply | Exit 1: `Resolution storage verification failed: tdri_raw_export_immutable` |
| Production `OPERATOROS_DATABASE_RELEASE_MODE=apply corepack pnpm db:apply` | Initial invocation started `20:52:17Z`, logged all 64 completed steps, but its shell ended before final verification evidence; not recorded as a clean success |
| Independent production `corepack pnpm db:verify` after that interruption | Exit 0, v64/64, 904 ms |
| Uninterrupted guarded idempotent root `db:apply` | Exit 0, complete release verified in **12,000 ms** |
| Final independent production `corepack pnpm db:verify` | Exit 0, **v64/64, 803 ms** |
| Development `corepack pnpm db:verify` | Exit 0, **v64/64, 789 ms** (earlier diagnostic run 3,884 ms) |
| Production trigger/function catalog check | One enabled `tdri_raw_export_immutable`; `tdri_preserve_raw_export()` present |
| Final before/after aggregate comparison | All eleven counts unchanged |
| Serving authority | Apply flag absent from the working shell and production secret names; temporary production connection unset |

The supported root release held its advisory lock and replayed the existing
ordered idempotent operations. No imported child migration, generated destructive
schema change, ad hoc trigger repair or serving-time apply was used.

| Record group | Before | Final |
| --- | ---: | ---: |
| Users | 8 | 8 |
| Tenants | 11 | 11 |
| Tenant memberships | 12 | 12 |
| Subscriptions | 4 | 4 |
| Module grants | 88 | 88 |
| Directory organizations | 1 | 1 |
| BrandForge brands | 1 | 1 |
| SnapProof customers | 0 | 0 |
| Shared webhook deliveries | 0 | 0 |
| Resolution incidents | 0 | 0 |
| Resolution raw exports | 0 | 0 |

## Publication and live acceptance

Publication completed through Replit with **Copy your development database
to production database** unchecked. No destructive schema confirmation was
presented or approved. Provisioning, security scan, build, bundle and promotion
passed for Replit build `1a24b00c-d755-49a7-bda3-d1630720d070` on deployment
`0a34bd3d-5706-434d-87ee-fffd3bf6e5cd`. Production changed from paused to published.
The application layer upload took several minutes; no timeout, security bypass,
runtime patch or publication restart was used to shorten it.

Public `https://operatoros.net/readyz` returned HTTP 200 with `ready: true`:

| Identity | Live value |
| --- | --- |
| Source commit | `aa3e2ea08d4e60f2a5342c3395d73ec2f4948f81` |
| Immutable application build | `be3ad2cb7e0d27e741a20ef0` |
| Built at | `2026-09-27T20:57:28.744Z` |
| Deployed at | `2026-09-27T21:07:53.585Z` |
| Database release | v64 / 64 steps / `techdeck_resolution_intelligence_tables` |

From the local Windows repository:

```powershell
$env:OPERATOROS_EXPECTED_RELEASE_COMMIT='aa3e2ea08d4e60f2a5342c3395d73ec2f4948f81'
node scripts/verify-production-runtime.mjs
```

Result: **47/47 passed, zero failures**. This covers root health, API readiness,
release identity, auth response headers, registered-host diagnostics, anonymous
PKCE redirects and module callback reachability. OutCall remains disabled.
The callback probes are negative/reachability checks; authenticated owner SSO
was separately exercised in Chrome.

The existing owner session opened the OperatorOS launcher, followed **Open
TechDeck** through the canonical auth host and reached the native TechDeck host.
Live browser checks confirmed:

- Resolution Intelligence loads real zero counts, matching the production
  aggregate snapshot; the module does not invent incidents.
- Linked knowledge loads the Phase 4 evidence-derived-document guidance and
  honest empty state. Import opens the guarded input form, with validation
  disabled while empty; no incident was submitted.
- Prompt and templates loads schema version 1.0. **Copy full prompt** succeeds
  with 13,112 characters and SHA-256
  `3d0283064bcb14240d229d94c096d6dc897a2fd5a2d12b323bf78b88df9c2004`, matching
  the displayed canonical checksum. The prior clipboard was restored.
- A read-only search for `0x800f0915` returns the expected empty matching-evidence
  view without an error. Refresh preserves the canonical search route.
- **My Apps** returns to the authenticated launcher. Captured tab console errors
  are empty. Import/search document and viewport widths both measure 1,905 px;
  no horizontal overflow was observed at the current desktop viewport.

Local operational evidence is under `build/v64-recovery-evidence/`:
`production-runtime.log`, `readiness.json`, `replit-published.png`,
`techdeck-resolution-live.png` and `techdeck-linked-knowledge-live.png`.
These include private owner/workspace context and are not added to Git. A later
full-page prompt screenshot timed out; that image is not claimed as captured.
The prompt checksum/control result is independent of that screenshot attempt.

## Rollback and limits

Keep the additive v64 storage and accepted evidence on application rollback.
Do not roll linked documents back to code lacking source authorization guards.
Data recovery uses the full backup/restore runbook and a new database, with
separately authorized validation and traffic switching. No destructive restore
or production fixture import occurred in this release operation.

This establishes the published source/database identity, public runtime checks,
owner SSO, current desktop presentation, read-only retrieval, prompt copying,
deep links and return navigation. Production incident import, document writes,
multi-role/foreign-tenant acceptance, live logout and restore rehearsal were not
executed here; those flows have the separately recorded synthetic local/CI
coverage. Semantic retrieval/embeddings remain disabled and Phase 5 is next.
Provider configuration presence is not provider delivery acceptance; readiness
still reports the shared provider control plane as not configured.

The local evidence/documentation update remains uncommitted on
`codex/techdeck-v64-release-diagnosis`. `git diff --check` passes; production
screenshots and runtime logs are confirmed ignored under `build/`. No application
code or dependency changed during recovery, and no lint/formatting gate is claimed.
