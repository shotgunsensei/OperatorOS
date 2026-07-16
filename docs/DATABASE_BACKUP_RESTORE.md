# OperatorOS database backup and restore runbook

OperatorOS and its consolidated modules share one PostgreSQL authority. A
backup therefore protects identity, tenant membership, entitlements, billing
state, audit history, and module workflow records together. Never back up or
restore one module schema independently in production.

## Policy

- Use provider-managed encrypted backups plus a scheduled logical backup.
- Recommended targets: RPO 24 hours or better, RTO 4 hours or better. Tighten
  these before paid SLA commitments.
- Retain daily backups for 30 days and monthly backups for 12 months, subject
  to the actual customer/data-retention policy.
- Encrypt exports, restrict restore authority, record every backup/restore
  action, and never place `DATABASE_URL` or dump files in Git or public object
  storage.
- Test a restore into an isolated non-production database at least quarterly
  and before a high-risk migration.

## Logical backup

Run from a trusted operator environment with `DATABASE_URL` supplied by the
secret manager:

```powershell
pg_dump --format=custom --no-owner --no-acl --file operatoros.dump $env:DATABASE_URL
pg_restore --list operatoros.dump
```

Record the UTC time, application commit, migration/schema version, database
engine version, encrypted artifact location, checksum, size, and operator.

## Restore rehearsal

1. Provision an empty isolated PostgreSQL database with no production network
   access and set its connection string only in the rehearsal shell.
2. Restore with `pg_restore --clean --if-exists --no-owner --no-acl`.
3. Start the matching OperatorOS commit against that database. Allow only the
   idempotent startup migrations appropriate to that release.
4. Run type/build checks plus database-backed auth, SSO, tenant-isolation,
   entitlement, TradeFlowKit, PulseDesk, TechDeck, and TorqueShed tests.
5. Verify row counts and tenant-scoped foreign keys, sample audit chronology,
   and `/readyz`. Do not send email, SMS, Stripe, or webhook traffic.
6. Destroy the rehearsal environment and record the measured restore time and
   any gaps.

## Production recovery

Freeze writes, capture a final backup when safe, identify the last known-good
application and database point, and restore into a new database rather than
overwriting the failed one. Validate readiness and authenticated smoke tests
before switching traffic. Keep the old database read-only until the recovery
is accepted. Roll back traffic if tenant isolation, auth, entitlement, audit,
or module persistence checks fail.
