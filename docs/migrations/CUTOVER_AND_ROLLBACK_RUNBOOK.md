# Data cutover and rollback runbook

This is a human-gated production procedure. It is documentation, not current
authorization to execute it.

## Required approval packet

- module, source commit/version, immutable export SHA-256, and export owner;
- approved source user to OperatorOS user/tenant mapping with duplicate policy;
- privacy/security review and prohibited-authority scan;
- source and OperatorOS backups plus a successful restore-to-new-database drill;
- disposable rehearsal report with exact reconciliation and performance;
- maintenance window, communications, cutover owner, rollback owner, and go/no-go
  approver;
- deployed build/health/SSO/workflow/tenant-isolation acceptance evidence.

## Cutover sequence

1. Announce the maintenance window and confirm the latest acceptance packet.
2. Enable the source system's write lock and verify writes fail safely.
3. Verify OperatorOS module writes remain disabled. This establishes no dual
   write.
4. Capture source and OperatorOS backups; record immutable identifiers/hashes.
5. Generate the final delta export, hash it, and compare its schema/version and
   source commit with the approved manifest.
6. Run the dry-run planner. Stop on any manifest, mapping, secret/privacy,
   duplicate, orphan, attachment, money, or provider reconciliation failure.
7. At the human apply gate, run only the separately reviewed resumable,
   checkpointed module apply. The Phase 13 master command cannot apply.
8. Reconcile all approved dimensions at exact tolerance unless the acceptance
   packet contains a signed exception.
9. Run production health/readiness, SSO, return navigation, authorization,
   tenant-isolation, CRUD/persistence, deep-link, refresh, and logout smokes.
10. Record the rollback decision point. Enable OperatorOS module writes only
    after the approver accepts steps 8 and 9.
11. Keep standalone writes locked; monitor structured errors, latency, job
    backlog, provider failures, and audit anomalies through the agreed period.
12. Archive/decommission the standalone system only after final data and product
    acceptance. Preserve required read-only evidence and retention records.

## Abort and rollback

Abort immediately on hash/version drift, a missing mapping, prohibited
authority/secret data, reconciliation outside tolerance, unexpected write,
tenant/authorization failure, failed health/SSO/core workflow, or an exceeded
maintenance window.

1. Disable OperatorOS module writes and stop the importer.
2. Preserve logs, row-error reports, checkpoint state, export hashes, and the
   failed target. Do not log source record values or secrets.
3. Keep the source write lock until the rollback owner decides it is safe to
   reopen; never allow both systems to write.
4. Restore the pre-apply OperatorOS backup to a **new** database.
5. Verify database integrity, release state, health, SSO, tenant isolation, and
   core workflows on the restored target.
6. Switch traffic only with explicit approval, then reopen the authoritative
   system and communicate the rollback.
7. Record cause, affected batches/source ranges, corrective action, and the
   required new rehearsal. A failed batch is never silently skipped.
