# ADR-0028: TradeFlowKit owns tenant-scoped workflow templates and governed job transitions

- Status: Accepted
- Date: 2026-07-28
- Scope: TradeFlowKit Phase 16 work management

## Context

The original Phase 4 source baseline at
`6d0c13df5e324f6aba9cdf2cf14a550d0cf0ca55` did not contain durable workflow
templates or a team-wide task workspace. The later clean restoration branch at
`37aa67f1da804fc3ac56f36e50e01362077d7a26` adds workflow templates, ordered
stages, team task views, activity, contacts, and job transitions. Those are
real product capabilities and therefore cannot remain absent from a claim of
full TradeFlowKit parity.

The restored source also permits tasks without a job and stores automation
hooks and recurrence rules. Activating those details without a scheduling,
timezone, retry, cancellation, and ownership contract would conflict with
ADR-0009, ADR-0010, and ADR-0011.

## Decision

TradeFlowKit owns tenant-scoped workflow templates for `job` and `task`
entities. A workflow has ordered, named, colored stages. A stage may map to one
existing canonical job or task status. Admins create, edit, select defaults,
add stages, and archive workflows. Mutations use optimistic versions and
append OperatorOS activity events.

Jobs may reference a TradeFlowKit workflow stage. Moving a job to a stage is
an atomic, version-checked server operation that revalidates tenant ownership,
may update the canonical job status, and writes an audit/activity event.

The team task workspace lists, searches, updates, reads, and archives the
existing first-class job tasks across the current tenant. Task creation remains
job-scoped under ADR-0010. Shared Directory remains the contact authority and
shared platform activity remains the audit source.

Automation hooks are not accepted as executable behavior. Recurrence metadata
does not schedule work. Standalone tasks without a job remain a recorded
Phase 16 product decision gap rather than being silently activated.

## Consequences

- The active module exposes real Workflow Studio, team task, job transition,
  task detail/archive, and activity contracts.
- OperatorOS tenant roles and module write/admin guards remain authoritative.
- No project table, module-local membership, local scheduler, or UI-only
  authorization is introduced.
- Workflow UI must not claim automation execution or recurring generation.
- The Phase 16 source ledger must keep standalone-task creation and all other
  unresolved source capabilities explicitly classified.

## Data and security impact

`tradeflowkit_workflows` and `tradeflowkit_workflow_stages` are tenant-scoped,
indexed, versioned, auditable, and archive-only. Composite tenant foreign keys
prevent cross-tenant stage relationships. Partial unique indexes prevent two
active defaults for the same tenant/entity and prevent duplicate active stage
names or positions.

Workflow, stage, job transition, and task mutation routes use server-resolved
tenant identity, server-side role/module authorization, bounded validation,
non-enumerating foreign-resource responses, and optimistic concurrency.

## Migration and rollback

The schema change is additive and idempotent under the existing
`tradeflowkit_tables` release step. No standalone workflow row is imported
automatically. A reviewed import must map the pinned source tenant, users,
templates, stages, and job references before apply.

Production apply requires the normal backup and human release gate. Rollback
is restore-to-new-database and traffic switch; there is no destructive
in-place down migration.
