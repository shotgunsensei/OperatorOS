# SnapProofOS Phase 11B migration and cutover plan

Status: dry-run planning only; no production apply or cutover is authorized.

## Source and mapping

- Source commit:
  `26bded38c13b5b6361d407462c68052b0c30613d`
- `jobs` -> `snapproof_cases`
- `findings` -> `snapproof_findings`
- `notes` -> append-only `snapproof_comments`
- `files` -> manual private attachment transfer with original bytes,
  signature/MIME validation, scan result and SHA-256
- source reports -> regenerate from the approved OperatorOS case snapshot

Users, organizations, memberships, JWT credentials, billing, share links and
client file URLs are never imported. OperatorOS user/tenant mappings must be
owner approved before apply.

## Repeatable dry run

`POST /v1/modules/snapproofos/migration/dry-run` is tenant-admin protected and
accepts an authorized legacy export descriptor. It requires the pinned commit,
returns a stable whole-export hash, counts, mappings, exclusions and blockers,
and has no apply mode. Missing validated file bytes is an explicit blocker.

## Future apply gate

1. Freeze standalone writes and record the source commit/export hash.
2. Back up OperatorOS according to `docs/DATABASE_BACKUP_RESTORE.md`.
3. Review tenant/user mappings and rejected rows.
4. Transfer file bytes through the shared private attachment adapter; never
   fetch legacy `fileUrl` values automatically.
5. Reconcile source counts, mapped counts, file byte counts and SHA-256 values.
6. Rebuild report snapshots and compare report/custody provenance.
7. Run cross-tenant, authorization, download, deep-link, logout and persistence
   acceptance on the exact deployed revision.
8. Record cutover or roll back by restoring to a new database and switching
   traffic. Never use a destructive down migration.
