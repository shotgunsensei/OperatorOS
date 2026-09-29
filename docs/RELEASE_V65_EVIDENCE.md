# Resolution Intelligence v65 publication evidence

2026-09-29 UTC. The owner authorized commits, pull requests, merges, source
synchronization and publication. OpenAI remains disabled until explicitly enabled.
Application source is Phase 5 merge
`ee9ca05e8346bdb1770932029ae8a9a8d682ef0f`
([PR #109](https://github.com/shotgunsensei/OperatorOS/pull/109)).

## Source and CI

Local main and GitHub main matched the application revision before release.
Replit's clean checkout contained only an additional empty publication marker
`1981fbd0498fd09994754a37fa2ac996b4367cba` on the previous v64 source. Its empty
diff was verified and the marker preserved on
`codex/replit-v64-publish-marker-20260929`; fresh main tracks origin/main at the
approved application revision. No force push or history rewrite was used.

Exact-main [release CI](https://github.com/shotgunsensei/OperatorOS/actions/runs/36591653046)
passed all 14 stages: **1,593 API, 108 integration, 52 unit, 32 browser and four
visual checks**, with no failures, skips or browser retries. Exact-main
[vector CI](https://github.com/shotgunsensei/OperatorOS/actions/runs/36591653077)
passed **32/32**. CI's immutable build `d44080ee7a53bdb2e5b62006` is distinct
from the Replit build. The earlier successful PR browser gate retried one generic
route/control case after an aborted JavaScript-chunk request; the exact-main run
needed no retry. The initial vector workflow setup failure and correction remain
recorded in [implementation status](IMPLEMENTATION_STATUS.md).

Replit uses Linux, Node **20.20.0**, pnpm **10.34.5**. The reviewed root
`corepack pnpm --silent db:plan` reports **v65, 65 ordered steps**, ending in
`techdeck_resolution_semantic_tables`.
`CI=true corepack pnpm install --frozen-lockfile` passed before publication.
No tests or synthetic fixtures ran against either Replit database.

## Backup, supported release and reconciliation

Production settings confirmed seven-day point-in-time recovery and restore
controls. Scheduled backups remain off. Publication was paused and the connector
independently reported `suspended` before production backup or apply.

Both databases received custom-format logical backups with no owner/ACL output,
encrypted using AES-256-CBC, PBKDF2 and 200,000 iterations with a random private
key. SHA-256 verification and full `pg_restore --file=/dev/null` decoding passed
before each apply. Backups, key and private logs remain outside Git in restricted
Replit directory `/tmp/operatoros-v65-release.KEZseG` (directory mode 700,
umask 077). Archive readability is verified; a full restore rehearsal and durable
offsite retention are not established. Temporary recovery copies supplement PITR.

| Target | Backup started (UTC) | Encrypted bytes | Root apply and verification | Independent verification |
| --- | --- | ---: | --- | --- |
| Development | 2026-09-29T17:39:02Z | 2,374,128 | Exit 0; 7,651 ms | Exit 0; v65/65; 541 ms |
| Production | 2026-09-29T17:42:32Z | 2,465,264 | Exit 0; 18,046 ms | Exit 0; v65/65; 845 ms |

Database identities were captured privately before backup and compared again
before apply. The supported root manifest performed the additive release;
no imported child migration, generated destructive SQL or extension installation
was used. Apply authority was scoped to the apply process:

```bash
# url is the privately selected target; never a literal credential in records.
DATABASE_URL="$url" APP_ENV=production NODE_ENV=production \
  OPERATOROS_DATABASE_RELEASE_MODE=apply corepack pnpm --silent db:apply
env -u OPERATOROS_DATABASE_RELEASE_MODE DATABASE_URL="$url" \
  APP_ENV=production NODE_ENV=production corepack pnpm --silent db:verify
```

All eleven recorded aggregate counts were unchanged within each database.
Production counts before and after:

| Record group | Before | After |
| --- | ---: | ---: |
| Users | 8 | 8 |
| Tenants | 11 | 11 |
| Memberships | 12 | 12 |
| Subscriptions | 4 | 4 |
| Module grants | 88 | 88 |
| Directory organizations | 1 | 1 |
| BrandForge brands | 1 | 1 |
| SnapProof customers | 0 | 0 |
| Webhook deliveries | 0 | 0 |
| Resolution incidents | 0 | 0 |
| Resolution raw exports | 0 | 0 |

Production has **zero semantic settings rows, zero enabled organizations, zero
embeddings**, and `vector` is not installed. The deployment secret name
`TECHDECK_EMBEDDINGS_ENABLED` is absent. The existing OpenAI key does not activate
this feature. No real OpenAI request was made. The serving apply flag is absent
from both shell and deployment secret names; the temporary production connection
and browser clipboard were cleared before publication.

## Publication and live acceptance

Publication completed on deployment `0a34bd3d-5706-434d-87ee-fffd3bf6e5cd`,
Replit build `f40340a1-1bd1-44f1-a76f-850ec1cbddf6`. Build/Bundle/Promote completed
and both the connector and Publishing UI reported success/Live. The application
layer uploaded from 17:45:59Z to 17:52:29Z without a restart. During promotion,
the first public probes still returned Replit's unavailable page; those were not
accepted as readiness. Final public readiness returned HTTP 200 with `ready: true`:

| Identity | Live value |
| --- | --- |
| Source commit | `ee9ca05e8346bdb1770932029ae8a9a8d682ef0f` |
| Immutable application build | `8eff6d674044c40a533419b4` |
| Built at | `2026-09-29T17:44:47.033Z` |
| Deployed at | `2026-09-29T17:54:52.028Z` |
| Database release | v65 / 65 steps / `techdeck_resolution_semantic_tables` |

The development-to-production database copy option stayed unchecked. No
destructive schema confirmation, provider activation or persistent apply
authority was introduced. From Windows/Node 24 in the local repository:

```powershell
$env:OPERATOROS_EXPECTED_RELEASE_COMMIT='ee9ca05e8346bdb1770932029ae8a9a8d682ef0f'
node scripts/verify-production-runtime.mjs
```

Result: **47/47 passed, zero failures**. These checks cover health, readiness,
exact identity, auth headers, registered hosts, anonymous PKCE redirects and
callback reachability. OutCall remains disabled. The callback probes do not
prove an authenticated user journey.

The live launcher redirected the browser to the canonical auth host and showed
the sign-in form; the previous owner session had expired. Authenticated TechDeck
acceptance therefore remains pending a user sign-in. No credentials, incident,
document or provider setting were changed for this verification. Earlier v64
owner-session checks are historical and are not counted as v65 browser proof.

Local operational evidence is in ignored `build/v65-release-evidence/`:
`readiness.json`, `production-runtime.log` and `replit-published.png`. These
operational artifacts are not added to Git. This evidence-only documentation
update does not change the published application code; a later documentation
merge can be ahead of the deployed source commit without a code difference.
Documentation validation checked all five changed documents, 78 local links and
conflict markers; `git diff --check` passed. No application tests were rerun for
this documentation-only change; deployed application CI is linked above.

## Rollback and remaining acceptance

Retain additive v65 tables on application rollback. Keep semantic activation off;
do not drop evidence or roll back to code without current source authorization.
Follow [the backup/restore runbook](DATABASE_BACKUP_RESTORE.md) for separately
authorized recovery to a new database and verified traffic switching.

Real-model relevance/latency, vector provisioning, chosen model/dimensions,
retention/cost approval, production write workflows, other-role/foreign-tenant
acceptance on the target, live logout and full restore rehearsal remain separate.
The [semantic guide](techdeck/resolution-intelligence-semantic-search.md) records
the explicit activation and data-sharing controls. Phase 6 grounded research is
not included in this publication.
