# OperatorOS database backup and restore runbook

OperatorOS and its consolidated modules share one PostgreSQL authority. A
backup protects identity, tenant membership, entitlements, billing state,
audit history, SSO replay state, and module workflows together. Never back up,
restore, or migrate one active module schema independently in production.

## Policy

- Use provider-managed encrypted backups plus scheduled logical backups.
- Initial operating targets are RPO 24 hours and RTO 4 hours; tighten them
  before paid SLA commitments.
- Retain daily backups for 30 days and monthly backups for 12 months, subject
  to approved customer and legal retention policy.
- Encrypt exports, restrict restore authority, audit every backup/restore, and
  never place database URLs, dumps, credentials, tokens, or customer data in
  Git or public object storage.
- Rehearse restore into an isolated non-production database at least quarterly
  and before any high-risk release.
- Production backup, release apply, traffic switch, and restore are separate
  human-authorized operations.

## Supported database release

OperatorOS exposes one root release contract:

```powershell
corepack pnpm db:plan
$env:OPERATOROS_DATABASE_RELEASE_MODE='apply'
corepack pnpm db:apply
```

`db:plan` is read-only and prints 14 ordered step identifiers without secrets
or a database connection. `db:apply` requires `DATABASE_URL` and the exact
release mode. The production supervisor executes the compiled apply before
Fastify starts and then verifies the required authority tables.

The release is idempotent and additive. Do not run imported child migrations,
`drizzle-kit push`, or an ad hoc SQL directory against OperatorOS. There is no
supported destructive down migration. Rollback means restore into a new
database and switch traffic after validation.

## Deployment order

1. Identify the exact reviewed application commit and database engine version.
2. Run `corepack pnpm db:plan` and review the ordered release.
3. Capture a provider snapshot and a logical backup; verify its manifest and
   checksum before deployment.
4. Validate the production core environment with
   `corepack pnpm preflight:production -- --core`.
5. Build with `corepack pnpm build:production`.
6. Start through `node scripts/start-unified-runtime.mjs`. The supervisor must
   complete the database release and private `/readyz` before Next starts.
7. Require public `/healthz`, `/readyz`, the 47-check read-only verifier, and
   authenticated browser acceptance before accepting traffic.
8. If any identity, tenant, entitlement, audit, persistence, SSO, or readiness
   gate fails, restore/switch according to the recovery procedure below.

## Logical backup

Run from a trusted operator environment with `DATABASE_URL` supplied by the
secret manager:

```powershell
pg_dump --format=custom --no-owner --no-acl --file operatoros.dump $env:DATABASE_URL
pg_restore --list operatoros.dump
Get-FileHash -Algorithm SHA256 -LiteralPath operatoros.dump
```

Record UTC time, application commit, release contract version, PostgreSQL
version, encrypted artifact location, checksum, byte size, duration, and
operator. A successful command without a readable TOC and checksum is not an
accepted backup.

## Restore rehearsal procedure

1. Provision an empty isolated PostgreSQL database with no production network
   access. Keep all provider integrations disabled.
2. Restore with:

   ```powershell
   pg_restore --clean --if-exists --exit-on-error --no-owner --no-acl --dbname $env:RESTORE_DATABASE_URL operatoros.dump
   ```

3. Compare source and target row counts for users, tenants, tenant membership,
   modules, tenant modules, entitlements, SSO handoffs, and audit rows.
4. Require zero unvalidated foreign keys and compare public table and foreign
   key counts.
5. Start the matching compiled OperatorOS release against the restored target.
   Permit only the supported idempotent release contract.
6. Require `/readyz`, database-backed auth/SSO/tenant/entitlement tests, and
   the production-host browser SSO gate. Do not send email, SMS, Stripe, AI, or
   webhook traffic.
7. Destroy the isolated database and securely delete the local dump after the
   evidence record is complete.

## Phase 1 rehearsal record

| Field | Recorded value |
| --- | --- |
| Rehearsal date | 2026-07-16 through 2026-07-17 |
| Candidate | Implementation commit `50d3b616ed2af8f50c983d29e161baf3c943130f` on `codex/phase-1-platform-deployment-gate` |
| Database | PostgreSQL 16.14 in isolated disposable Docker containers |
| Backup format | PostgreSQL custom archive; 435 TOC entries |
| Backup duration | 355 ms |
| Restore duration | 1,045 ms |
| Size | 196,552 bytes |
| SHA-256 | `6a1ab73c67a69a1bfe6a51d5f40b5df56f20302b779c9663e8002b408207932c` |
| Public tables | Source 61; restored target 61 |
| Foreign keys | Source 100; restored target 100 |
| Unvalidated foreign keys | Source 0; restored target 0 |
| Core row comparison | Exact match for users, tenants, tenant users, modules, tenant modules, tenant entitlements, SSO handoffs, and admin audit rows |
| Release on restored target | PASS; all 14 idempotent steps completed and required tables verified |
| Restored runtime readiness | PASS; Fastify and Next production artifacts reached ready state |
| Restored runtime SSO | PASS; 2/2 production-host browser scenarios |
| Aggregate regression | PASS; 675/675 on a separate clean disposable database |
| Provider traffic | None; Stripe, email, Twilio, and OpenAI disabled |

The dump was kept only under ignored `test-results` while evidence was being
captured. It is not a release artifact and must not be committed.

## Production recovery

1. Freeze writes and preserve the failed database as read-only when safe.
2. Identify the last known-good application commit and backup before changing
   data or traffic.
3. Restore into a new database. Never overwrite the only recoverable copy.
4. Run the matching release contract and require schema/row/FK reconciliation,
   `/readyz`, auth/tenant/entitlement negatives, and authenticated smoke tests.
5. Switch traffic only after acceptance. Record the operator, timestamps,
   source/target database identifiers, checksum, and decision.
6. Roll traffic back if validation fails; investigate without weakening tenant,
   identity, SSO, audit, or persistence checks.
