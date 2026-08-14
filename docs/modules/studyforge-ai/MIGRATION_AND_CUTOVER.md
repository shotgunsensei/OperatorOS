# StudyForge AI Phase 33 migration and cutover

Status: source/local implementation only. No production apply, source write
freeze, provider activation, deployment, or traffic cutover is authorized.

## Pinned source and target

- Source commit: `a607a9f34442b1d0f6bfffbf0293609529494825`.
- Source remains read-only evidence under
  `apps/modules/studyforge-ai/source/`.
- Cumulative additive target: OperatorOS database release v42,
  `studyforge_complete_product_tables`.

Authorized source rows map to OperatorOS users/tenants first, then folders,
study sets and raw notes, complete generated artifacts, flashcard progress and
sessions, quiz attempts, study-plan sessions, countdowns, and daily activity.
Original source/output provenance, timestamps, archived state, and hashes must
be retained. Generation must not be rerun during migration.

Users, password hashes, sessions, child roles, Stripe records, subscriptions,
provider credentials, and child admin authority are never imported.

## Current no-apply planning path

The existing commit-pinned dry-run planner remains the only imported-data path:

```powershell
corepack pnpm import:studyforge:dry-run -- --file <authorized-export.json>
```

The equivalent tenant-authorized API dry run is
`POST /v1/modules/studyforge-ai/import/dry-run`. It emits stable hashes, counts,
mappings, exclusions, and blockers and has no production apply mode.
No apply mode exists in the imported-data planner.

## Future authorized cutover

1. Freeze standalone writes and record source commit/schema/export SHA-256.
2. Approve exact OperatorOS tenant and user ownership mappings.
3. Back up and restore-test the target database.
4. Apply cumulative release v42 through the supported release runner.
5. Import in dependency order with stable source references and per-batch
   transactions; do not regenerate content.
6. Reconcile counts, foreign keys, owners, artifact/source hashes, attempts,
   sessions, activity, archived/deleted state, and usage without double debit.
7. Run deployed SSO, isolation, limits, generation, learning, export,
   restart-persistence, mobile/accessibility, provider, and health acceptance.
8. Promote only after an explicit owner decision. Roll back by restoring into
   a new database and switching traffic; never use a destructive down migration.
