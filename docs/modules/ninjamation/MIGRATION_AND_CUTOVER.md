# Ninjamation migration and cutover

## Source pins

- Application: `AutomationPacks` `master` at
  `cca75338d04ed35b89f28d614eb51559735aa32f`.
- Endpoint catalog: `AutomationPacks` `main` at
  `ca0e55fd086f6751a43964927166bfa69db012b6`.
- Evidence snapshot: `apps/modules/ninjamation/source`.

The source application database was not accessed and no export was supplied.
The snapshot contains source code only. AutoWorkFlowHub is discontinued and
must not appear in an export, mapping, or cutover plan.

## Dry-run

Create an authorized JSON descriptor:

```json
{
  "sourceCommit": "cca75338d04ed35b89f28d614eb51559735aa32f",
  "catalogCommit": "ca0e55fd086f6751a43964927166bfa69db012b6",
  "export": {
    "scripts": [],
    "users": [],
    "sessions": []
  }
}
```

Run:

```powershell
corepack pnpm import:ninjamation:dry-run -- --file <authorized-export.json>
```

The planner is deterministic and has no apply mode. It reports commit pins,
export SHA-256, counts, mappings, exclusions, and blockers.

The versioned zero-row descriptor at
`docs/modules/ninjamation/fixtures/empty-export.json` verifies the command and
current pins only. It is not evidence that a standalone data export is empty.

## Apply prerequisites

No apply is authorized in Phase 12A. A future reviewed apply must have:

1. OperatorOS tenant/user mapping and destination approval.
2. Source export ownership and license evidence per script.
3. Secret scan, deterministic static analysis, and human code review.
4. Import as tenant-private `catalog_import` drafts only.
5. No legacy users, sessions, billing, credentials, admin authority, mutable
   counters, or execution state.
6. Pre-apply backup, restore rehearsal, source write freeze, row/hash
   thresholds, reconciliation report, and rollback owner.
7. Tenant-admin approval after import before any download.

## Rollback

The database release is additive. Before an approved apply, follow
`docs/DATABASE_BACKUP_RESTORE.md`. Rollback restores into a new database,
validates it, and switches traffic; it never performs an in-place destructive
down migration. The quarantined snapshot and legacy `module_automations` rows
remain evidence and are not activated.
