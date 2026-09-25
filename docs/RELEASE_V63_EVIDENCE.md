# OperatorOS v63 publication evidence

Date: 2026-09-22. Source: merged PR #102,
`74fdfeaff89b88b39073269066954b6f0787c7ad`.

## Scope and authorization

The owner explicitly authorized completing the publishing fixes and publication.
The release contains the previously reviewed customer workflow, shared customer,
account security, and presentation changes. No new application code was needed
to repair this publishing failure. Provider activation and real billing or
messaging transactions are not part of this publication evidence.

## Failure and repair

The failed Replit build `2e13a2c7-95ea-4ebd-b7b7-e1e8a437ff4f` completed its
build but failed promotion: the production database was missing the ordered
`shared_customer_links` and `auth_security_controls` release steps. The runtime
correctly refused to serve against the incomplete schema.

Public traffic was paused through Replit's publishing controls. The explicitly
selected production database was backed up, upgraded using the supported
one-shot release, and independently verified at v63/63. A subsequent publishing
review proposed dropping the new tables and columns because the development
database still had the older schema. That attempt was cancelled before approval;
none of its proposed drops or security changes was accepted. The development
database was separately backed up and converged through the same ordered release.
The next publishing attempt passed the database review and entered provisioning.

## Source and CI

The clean local and Replit checkouts matched the merged commit before publication.
The exact-merge [release run](https://github.com/shotgunsensei/OperatorOS/actions/runs/35750772167)
and [native run](https://github.com/shotgunsensei/OperatorOS/actions/runs/35750772172)
completed successfully. Downloaded release artifacts and logs record:

- API: 1,517 passed, 0 failed, 0 skipped.
- Unit: 52 passed, 0 failed, 0 skipped.
- Integration: 32 passed, 0 failed, 0 skipped; clean apply/reapply included.
- Production-host browser journeys: 24 passed in 6.3 minutes.
- Visual/accessibility cases: 4 passed in 1.7 minutes, no skipped browser cases.
- Workspace typechecks, production build, and production preflight completed.

These are isolated CI results, not tests against production data. No lint or
formatting approval is claimed; the repository's verification policy remains
unchanged. Local downloaded evidence is ignored under
`build/pr102-merge-release-evidence/`.

## Recovery and database verification

Replit production settings showed seven-day point-in-time recovery enabled and
the restore control available. Scheduled backups remain off. A fresh encrypted
custom-format logical production backup began at `2026-09-22T17:11:26Z`.
The encrypted artifact is 2,263,776 bytes; its restore catalog contains 3,552
lines. A full decrypt-to-`pg_restore --file=/dev/null` decode passed, and a SHA-256
checksum was retained with the private recovery artifacts. This proves archive
readability; it is not a restore drill into a new database.

The separate encrypted development backup began at `2026-09-22T17:20:05Z`, is
2,178,096 bytes, and also passed a full decode. Both backups, keys, and database
logs remain outside Git in a restricted private Replit temporary recovery
directory. This temporary copy
supplements provider PITR; it is not durable offsite backup storage.

Commands used the existing PostgreSQL tools and the exact reviewed source:

```text
corepack pnpm db:plan
pg_dump --dbname=<privately selected connection> --format=custom --no-owner --no-acl
  | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -pass file:<private key> -out <private encrypted backup>
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:<private key> -in <private encrypted backup>
  | pg_restore --no-owner --no-acl --file=/dev/null
DATABASE_URL=<privately selected production connection> APP_ENV=production NODE_ENV=production OPERATOROS_DATABASE_RELEASE_MODE=apply corepack pnpm db:apply
DATABASE_URL=<privately selected production connection> APP_ENV=production NODE_ENV=production corepack pnpm db:verify
APP_ENV=development NODE_ENV=development OPERATOROS_DATABASE_RELEASE_MODE=apply corepack pnpm db:apply
APP_ENV=development NODE_ENV=development corepack pnpm db:verify
```

The placeholders above document intent and must not be pasted as real credentials.
Apply authority was scoped to each one-shot process, not saved in deployment
settings. Production apply verified all 63 steps in 16,602 ms; independent
verification passed in 629 ms. Development apply verified in 9,156 ms and
independently verified v63/63 in 455 ms. The temporary production connection was
removed from the working shell after verification; persistent apply mode was
confirmed absent. The BrandForge tenant-composite shared customer foreign key is
validated; all three new account security tables are present.

Production aggregate reconciliation:

| Record group | Before | After |
| --- | ---: | ---: |
| Users | 8 | 8 |
| Tenants | 10 | 11 |
| Tenant memberships | 11 | 12 |
| Subscriptions | 4 | 4 |
| Module grants | 85 | 88 |
| Shared directory customers | 1 | 1 |
| BrandForge brands | 1 | 1 |
| SnapProof customers | 0 | 0 |
| Shared webhook deliveries | 0 | 0 |

The existing idempotent backfill created one missing personal workspace for an
existing user, its owner membership, and the three standard included free-app
grants: TorqueShed, FaultlineLab, and Operator Pool Hall. The log and catalog
checks explain the differences; no subscription or customer record was added
by that backfill. Development data was never copied over production.

## Publication and live acceptance

Replit reports successful public publication of build
`cf3514bd-433a-432c-bbde-d5034bf7e04c` on deployment
`0a34bd3d-5706-434d-87ee-fffd3bf6e5cd`. Provisioning, security scan, production
build, bundle, and promotion completed. Production returned from paused to
published; no separate startup bypass was required.

Replit's empty post-publish commit `59641eeb` was preserved on
`codex/replit-v63-publish-marker`. After confirming no file differences from the
reviewed merge, the clean active checkout was returned to `main`, tracking
`origin/main` at the exact source commit. No commit was discarded or force-pushed.

Public `https://operatoros.net/readyz` returned HTTP 200 with:

| Identity | Verified value |
| --- | --- |
| Commit | `74fdfeaff89b88b39073269066954b6f0787c7ad` |
| Immutable application build | `22a89e74549fcde123f916b5` |
| Built at | `2026-09-22T17:22:48.097Z` |
| Deployed at | `2026-09-22T17:35:47.641Z` |
| Lockfile SHA-256 | `6d4f65f8f33fd2e95c9d28830c1166ca7b9a952c9361c7a4da71f6ee7d709c98` |
| Database | v63/63, ending in `auth_security_controls` |

The database, worker, and queues are healthy/ready; the worker has zero
consecutive failures. Auth, SSO encryption, registry, and release identity are
configured. The optional shared provider control plane remains explicitly
`not_configured`; configured external dependencies are not delivery evidence.

From Windows Node 24.16.0, the repository's public, read-only runtime verifier
completed **47 passed / 0 failed** against the exact expected commit:

```powershell
$env:OPERATOROS_EXPECTED_RELEASE_COMMIT='74fdfeaff89b88b39073269066954b6f0787c7ad'
node scripts/verify-production-runtime.mjs
```

This verifies root health and API readiness, exact release/database identity,
all registered host diagnostics, auth security headers, exact-host PKCE launch
redirects, callback reachability, and OutCall's unavailable boundary. Local
ignored evidence: `build/release-v63-public-runtime.log` and
`build/release-v63-live-readiness.json`.

The actual Chrome browser loaded the published marketing page and the signed-in
owner workspace home. The existing session completed exact-host single sign-on
to TradeFlowKit, BrandForge OS, and SnapProofOS under the same organization.
Each dashboard rendered its current guided workflow, and each Shared customers
panel finished loading and offered the same existing directory customer. Returning
through My Apps reopened the owner workspace. TradeFlowKit's desktop presentation
was also inspected visually. No customer, brand, job, or provider setting was
created or edited during this inspection. These are authenticated navigation and
shared-directory read checks, not production write or external-delivery acceptance.

## Remaining acceptance and recovery limits

Shared customers use the existing tenant-scoped Business Directory and need no
new vendor. Current identity is available to linked TradeFlowKit, BrandForge OS,
and SnapProofOS records on their next load; historical documents and private
module notes remain separate. Publication does not automatically merge legacy
unlinked records or prove a signed-in customer write journey in production.

Microsoft 365, Google, QuickBooks Online, Facebook, LinkedIn, and X integrations
remain implementation/activation targets. No live email, call, social publishing,
payment, provider permission, or new Stripe catalog acceptance is inferred from
this release. OutCall remains unavailable.

Rollback follows `DATABASE_BACKUP_RESTORE.md`: retain the additive schema or
restore the verified backup into a new database, validate, and deliberately
switch traffic. Do not approve provider-generated drops or copy development
data onto production. Rolling back application code also rolls back the new
account security guarantees.
