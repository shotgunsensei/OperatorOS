# TorqueShed cutover plan

Assessment date: 2026-07-18

Status: planned only; no deployment, production mutation, standalone write
freeze, or data apply is authorized.

## Rehearsal

1. Record the reviewed OperatorOS commit, pinned and export source commits,
   export fingerprint, destination tenant, identity mapping owner,
   maintenance window, rollback owner, and attachment policy.
2. Run the dry-run twice and require identical fingerprints, counts, cost
   totals, attachment totals, and mappings with zero missing references.
3. Restore a verified production backup into an isolated database, apply the
   ordered OperatorOS release, then run a future approved idempotent importer.
4. Re-run and prove zero duplicate writes. Verify the source-to-target ledger,
   VIN transformation, integer costs, file scans, and a second tenant's denial.
5. Run garage-to-diagnostic workflow, role/ownership/tenant, concurrency,
   refresh/restart, build/readiness, exact-host SSO, deep links, return, and
   logout acceptance on the target revision.

## Human-gated cutover

After rehearsal and separate production approval, freeze standalone writes,
capture the final export/fingerprint, back up OperatorOS following
`docs/DATABASE_BACKUP_RESTORE.md`, deploy the reviewed cumulative revision
through the canonical supervisor, and run only the reviewed apply. Reconcile
all mappings/counts/costs/attachments before routing users.

Do not copy repositories into OperatorOS. Do not copy `.env` files,
credentials, sessions, users, billing/token data, databases, or storage
directories. The standalone repository remains read-only provenance.

## Abort and rollback

Abort on a fingerprint/count/cost mismatch, missing identity/reference,
plaintext VIN retention, tenant/role leak, stale-write overwrite, attachment
scan/integrity failure, migration failure, unhealthy readiness, or failed
browser journey. Preserve restricted evidence without logging private values.

Rollback stops traffic, restores the verified backup into a new database,
applies its matching release, and switches only after health, auth, tenant,
entitlement, audit, and browser checks pass. Never overwrite the only
recoverable copy.
