# ADR-0029: TradeFlowKit bounded bulk-operation contract

- Status: Accepted
- Date: 2026-08-01
- Scope: TradeFlowKit job and invoice batch mutations

## Context

The standalone TradeFlowKit application exposed bulk job status, archived
record restore, invoice payment, and bulk-delete routes. ADR-0011 intentionally
excluded permanent purge and destructive bulk routes, but it did not prohibit
bounded administrative operations that preserve records and enforce the same
authorization and concurrency rules as the corresponding single-record paths.

Operators need a practical way to move several jobs through the same status,
restore several retained records, or record full offline payments against
several payable invoices without repeating identical actions one record at a
time. Recreating the standalone handlers directly would be unsafe because they
were not bound to OperatorOS tenant authority, optimistic versions, shared
idempotency, or atomic all-or-nothing behavior.

## Decision

TradeFlowKit may expose the following authenticated tenant-admin operations:

1. Set one status on a bounded set of active jobs.
2. Restore a bounded set of archived jobs after validating every active
   customer, Directory site, and workflow-stage dependency.
3. Restore a bounded set of archived invoices after validating every active
   customer and linked job dependency.
4. Record the exact remaining balance as a successful manual payment for a
   bounded set of payable invoices.

Each request is limited to 25 unique records and supplies every record ID with
its expected version. The server sorts and locks the requested tenant records,
validates the entire batch, and commits all changes in one transaction or none
of them. A shared `Idempotency-Key` is mandatory; replay returns the completed
result and body drift returns a conflict. Responses do not identify foreign or
missing record IDs.

Every record mutation and the enclosing batch are written to the activity
feed. Bulk payment recording creates first-class `tradeflowkit_payments` rows,
uses integer cents, records only the exact current balance, and never invokes a
payment provider. Provider-backed collection remains governed by ADR-0011.

Permanent purge, bulk delete, and archive-by-batch remain excluded. The legacy
job and invoice bulk-delete contracts are retired security surfaces, not parity
gaps.

## Consequences

Tenant administrators gain fast, usable batch workflows without a second auth,
billing, or data-authority path. Normal module members cannot execute them.
Stale versions, missing or foreign records, unavailable dependencies, invalid
invoice states, duplicate IDs, oversized batches, and reused keys with changed
bodies fail closed before any business row is changed.

The 25-record bound favors predictable lock time and readable audit history.
Larger changes must be split into separately reviewed batches. Job and invoice
CSV imports remain separate parity work because they require their own schema,
deduplication, validation, and reconciliation contract.

## Data and security impact

No schema change is required. All predicates include the trusted session tenant
ID. The request tenant is never accepted from the body. Batch keys use the
shared OperatorOS idempotency table, while each generated payment also receives
a deterministic tenant-unique payment key. Financial writes retain complete
payment and activity records and cannot silently overwrite invoice balances.

## Migration and rollback

This change adds routes and UI controls only. Rollback removes those surfaces;
already committed status, restore, payment, and activity rows remain valid
business history. No destructive data rollback is required. Database release
version 30 remains unchanged.

## Superseded records

None. This ADR narrows and implements the non-destructive portion of the legacy
bulk surface while preserving ADR-0011's destructive-route exclusion.
