# PulseDesk cutover plan

Assessment date: 2026-07-18

Status: **planned only; no data apply, deployment, write freeze, or production
mutation is authorized.** The source/local implementation is a consolidation
state 4 candidate. State 5 requires the human-gated production steps below.

## Required approvals and inputs

Before a cutover operator begins, record the reviewed OperatorOS commit, exact
PulseDesk export fingerprint, destination tenant, source owner, privacy
reviewer, maintenance window, rollback owner, provider decisions, and approved
attachment disposition. Take and verify both the source snapshot and the
OperatorOS database backup using `docs/DATABASE_BACKUP_RESTORE.md`.

Do not copy repositories, databases, storage directories, `.env` files,
credentials, provider tokens, sessions, standalone users, tenant authority,
or billing data into OperatorOS. The read-only source remains provenance and
migration evidence. Only an approved versioned export may cross the boundary.

## Rehearsal

1. Run `pnpm import:pulsedesk:dry-run -- --input <approved-export>` twice and
   require identical whole-export and per-record SHA-256 fingerprints.
2. Require zero missing references, duplicate source IDs, prohibited
   patient/clinical fields, or count mismatches. Review every exclusion and
   privacy finding without placing source values in the ledger.
3. Restore the production backup into an isolated rehearsal database, apply
   the ordered OperatorOS release manifest, and run a future reviewed importer
   apply implementation with durable idempotency claims and transactional
   batches. Phase 6 intentionally provides no apply mode.
4. Reconcile source-to-target mappings, tenant predicates, human ticket
   identifiers, row counts, attachment checksums/scan results, and workflow
   child counts. Re-run the import and prove it performs no duplicate writes.
5. Prove a second tenant cannot enumerate or mutate any imported identifier.
   Run PulseDesk workflow, privacy, SSO, deep-link, return, refresh, logout,
   restart-persistence, build, readiness, and browser acceptance gates.

## Authorized cutover sequence

After a successful rehearsal and separate production approval, freeze writes
in the standalone PulseDesk source, capture the final export and fingerprint,
repeat dry-run privacy/reference reconciliation, back up OperatorOS, deploy the
reviewed cumulative revision through `.replit`, and run the approved idempotent
apply. Keep standalone provider integrations disabled until their ownership
and credentials are explicitly approved in OperatorOS.

The cutover operator must reconcile counts and mappings before routing users.
Then verify exact-host SSO, host-only sessions, tenant/role enforcement,
Directory reuse, ticket lifecycle, internal-note isolation, no-PHI controls,
attachments, notifications without ticket text, SLA state, deep links,
refresh, return navigation, local logout, global revocation, readiness, and
restart persistence on the deployed hosts.

## Abort and rollback

Abort before traffic moves on any privacy finding, missing reference, count or
fingerprint mismatch, tenant leak, authorization failure, notification text
leak, attachment scan failure, migration error, unhealthy readiness result, or
failed deployed browser journey. Preserve the failed database and logs as
restricted evidence without copying sensitive payloads into tickets or docs.

The release is additive. Rollback means stopping traffic to the new workflow,
restoring the verified backup into a new database, applying its matching
OperatorOS release, reconciling schema/counts/constraints, and switching only
after health, auth, tenant, entitlement, audit, privacy, and browser checks
pass. Never overwrite the only recoverable database or resume source writes
until the rollback owner confirms the system of record.
