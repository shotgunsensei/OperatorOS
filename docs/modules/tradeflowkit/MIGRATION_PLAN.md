# TradeFlowKit migration plan

Status: repeatable dry-run tooling implemented; no production export applied.

## Input contract

Export standalone tables to one JSON object using arrays named after the
standalone schema: `customers`, `jobs`, `jobEvents`, `quotes`, `quoteItems`,
`invoices`, `invoiceItems`, `leads`, `leadActivities`, `leadFollowupTasks`,
`orgAutomations`, and `reminderLog`. `exportVersion` must be `1`.

Authority arrays may be present for reconciliation but are never mapped:
`orgs`, `users`, `memberships`, `sessions`, `subscriptions`, and
`processedStripeEvents`. Do not include secrets in an export. The planner
does not echo source records or those authority values.

## Dry run

From the repository root:

```powershell
corepack pnpm import:tradeflowkit:dry-run -- --input C:\approved\tradeflowkit-export.json
```

The command is read-only and exits `0` only when the export is structurally
valid, source IDs are unique, parent references resolve, money/quantity values
are bounded, and reconciliation completes. Exit `2` means the plan was
generated with blocking data errors. Any invocation without `--dry-run` fails
closed.

The repository fixture
`apps/api/test/fixtures/tradeflowkit-export-v1.json` exercises the actual CLI.
Its Phase 4 run produced stable export fingerprint
`7a8a3d0d064d25c496ef56bffc30048dd30cd91171465741622faedd736ec3de`,
9 migration references, zero missing references/errors, 240,000-cent quote and
invoice subtotals, and 259,200 paid invoice cents.

The plan records:

- a stable SHA-256 fingerprint of the full export;
- stable per-record fingerprints and source ID -> target-table mappings;
- source and planned target counts;
- excluded authority counts;
- quote and invoice subtotal cents and paid-invoice cents;
- resolved/missing customer and job references;
- warnings and apply readiness.

## Target mapping

| Standalone | OperatorOS |
| --- | --- |
| customer | Directory organization/contact/site + `tradeflowkit_customers` |
| job | `tradeflowkit_jobs` |
| quote/item | `tradeflowkit_quotes` / `tradeflowkit_quote_items` |
| invoice/item | `tradeflowkit_invoices` / `tradeflowkit_invoice_items` |
| paid invoice state | invoice balance plus `tradeflowkit_payments` |
| lead | `tradeflowkit_leads` |
| job/lead/reminder event | shared activity event |
| follow-up task | job-scoped `tradeflowkit_tasks` after approved parent mapping |
| automation | shared leased job only after approved scheduling semantics |

Applied imports must store source IDs in module `source_id` columns and/or
`tradeflowkit_migration_refs`; those tables have tenant-scoped uniqueness and
fingerprints for repeatability. The current CLI deliberately stops at dry run.
Database apply requires a separately reviewed implementation/cutover action
because the user authorized source phases, not production data mutation.

## Reconciliation gate

Before cutover, require two identical dry-run outputs for the same frozen
export, zero errors, zero missing references, count agreement for every
approved table, integer-cent quote/invoice/paid totals matching independent
SQL, and a signed record of the export fingerprint. Resolve discrepancies in
the standalone system or an explicit transformation version; do not hand-edit
the target.

## Rollback

Back up the OperatorOS database before apply. Restore the pre-import dump into
a new database, run release verification, compare the critical row vector,
and switch traffic. Do not delete or overwrite production rows in place.
