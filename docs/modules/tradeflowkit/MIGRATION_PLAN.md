# TradeFlowKit migration and cutover plan

Status: Phase 16A version 1 snapshot, dry-run, and guarded atomic apply are
implemented. The apply path has passed a synthetic isolated-PostgreSQL
rehearsal. No real standalone export, production apply, traffic switch, or
source archive has been authorized or performed.

## Version 1 scope

The version 1 path transfers one frozen standalone organization into one
existing, entitled OperatorOS tenant:

- customers into a shared Directory organization plus
  `tradeflowkit_customers`;
- jobs, quotes/items, invoices/items, and leads;
- paid invoice state into a reconciled historical `tradeflowkit_payments` row
  without copying Stripe identifiers;
- lead follow-up tasks only when their lead has an imported job;
- job, lead, and reminder history into sanitized `activity_feed` records;
- source IDs and per-record SHA-256 values into
  `tradeflowkit_migration_refs`.

It does not import passwords, MFA material, sessions, users, memberships,
roles, subscriptions, entitlements, Stripe state, public/portal tokens,
provider identifiers, raw provider/event payloads, or message bodies.
Standalone recurring jobs/invoices and automation configuration fail closed.
Workflow templates/stages, restored general work tasks, contacts, public
intake configuration, and business-payment provider state require an approved
later export/apply version. The product ledger has zero source/local gaps, but
version 1 is not a complete production data cutover by itself.

## Read-only source snapshot

Use a dedicated read-only PostgreSQL credential supplied through the secret
manager. The exporter starts a repeatable-read, read-only transaction, uses
parameterized organization predicates, selects only approved columns, refuses
to overwrite a file, and refuses to write inside the OperatorOS repository.
The export contains customer/business data and must be encrypted and access
controlled.

```powershell
$env:OPERATOROS_TRADEFLOWKIT_EXPORT_MODE='read-only'
$env:TRADEFLOWKIT_SOURCE_DATABASE_URL='<secret-manager-value>'
corepack pnpm export:tradeflowkit:snapshot -- `
  --source-org-id '<approved-legacy-org-id>' `
  --source-commit '37aa67f1da804fc3ac56f36e50e01362077d7a26' `
  --output 'C:\secure-exports\tradeflowkit-export-v1.json'
Remove-Item Env:TRADEFLOWKIT_SOURCE_DATABASE_URL
```

Never paste the source URL or export contents into chat, CI logs, issues, or a
Git worktree. The script reports only the output path and table counts.

## Deterministic dry run

```powershell
corepack pnpm import:tradeflowkit:dry-run -- `
  --input 'C:\secure-exports\tradeflowkit-export-v1.json'
```

The command is database-free and exits `0` only when source IDs are unique,
references resolve, quantities/money are bounded, and reconciliation
completes. Exit `2` means blocking data errors. `exportedAt` is intentionally
excluded from the source fingerprint, so unchanged row snapshots produce the
same reviewed SHA-256. Version 1 also binds snapshot and apply to restored
source commit `37aa67f1da804fc3ac56f36e50e01362077d7a26`.

Run the dry run twice against the frozen file and record:

- exact source fingerprint;
- source/planned target counts;
- excluded authority counts;
- quote and invoice subtotal cents and paid-invoice cents;
- resolved/missing customer and job references;
- warnings and errors.

Do not hand-edit the frozen export. Correct the source or introduce a reviewed
transform version.

## Identity and tenant mapping

The target tenant ID, source organization ID, and actor user ID are command
arguments, never read from source business rows. Every business row must carry
the exact approved source organization ID. The actor must be an active owner
or admin of the target tenant, and the tenant must have TradeFlowKit enabled.

If a source row names a creator or assignee, supply an external JSON mapping:

```json
{
  "legacy-user-id": "existing-operatoros-user-id"
}
```

Every target user must already belong to the target tenant. Missing or foreign
user mappings fail the transaction; the importer never creates identities or
silently broadens authority.

## Isolated apply rehearsal

First restore a production-like backup to an isolated target with every
provider disabled. Run the current OperatorOS database release, record the
backup artifact/checksum as the backup reference, and apply:

```powershell
$env:APP_ENV='test'
$env:OPERATOROS_TRADEFLOWKIT_IMPORT_MODE='apply'
$env:DATABASE_URL='<isolated-target-secret>'
corepack pnpm import:tradeflowkit:apply -- `
  --input 'C:\secure-exports\tradeflowkit-export-v1.json' `
  --tenant-id '<approved-operatoros-tenant-id>' `
  --source-org-id '<approved-legacy-org-id>' `
  --actor-user-id '<operatoros-owner-or-admin-id>' `
  --user-map 'C:\secure-exports\tradeflowkit-user-map.json' `
  --expect-source-fingerprint '<reviewed-sha256>' `
  --backup-reference '<backup-id-and-checksum>'
```

Version 1 is capped at 25,000 business rows and applies inside one database
transaction protected by a tenant-specific advisory lock. A failure rolls
back every row. Re-running the same frozen export reuses exact migration
references; a changed record fingerprint or missing target fails closed.
Directory name collisions require an explicit reviewed merge policy.

The committed audit contains only tenant/actor IDs, fingerprint, backup
reference, version, safe counts, and reconciliation totals. It never contains
source records, credentials, provider tokens, or message content.

## Production gate

Production use additionally requires all of the following:

- explicit owner approval for the exact tenant, users, file fingerprint, and
  maintenance window;
- verified provider snapshot plus logical backup and restore rehearsal;
- deployed revision acceptance, SSO, authorization, tenant isolation,
  persistence, deep-link, logout, health, and related browser E2E;
- exact independent source totals and post-apply target reconciliation;
- a written decision for every version 1 exclusion and confirmation that the
  zero-gap Phase 16 product contract remains satisfied after reconciliation.

Only the authorized operator may then set:

```powershell
$env:APP_ENV='production'
$env:OPERATOROS_TRADEFLOWKIT_IMPORT_MODE='apply'
$env:OPERATOROS_TRADEFLOWKIT_PRODUCTION_CUTOVER='approved'
# Use the same apply command and append:
--confirm-production-cutover
```

This repository work does not constitute that approval.

## Rollback

The transaction rolls back automatically on any apply or reconciliation
failure. After a successful commit, rollback is restore-and-switch:

1. preserve the failed/current target for evidence;
2. restore the recorded pre-import custom-format backup into a new database;
3. verify its checksum, critical authority/module row vectors, release
   contract, `/healthz`, and `/readyz`;
4. switch traffic only after identity, tenant, entitlement, billing, audit,
   and TradeFlowKit checks pass.

Do not delete imported rows in place or run a destructive down migration. Use
the shared procedure in `docs/DATABASE_BACKUP_RESTORE.md`.
