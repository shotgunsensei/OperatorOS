# ADR-0010: TradeFlowKit uses jobs/work orders with first-class tasks

- Status: Accepted
- Date: 2026-07-18
- Scope: TradeFlowKit operational hierarchy

## Context

The Phase 4 completion gate required an explicit decision between projects and
jobs. The reviewed standalone schema at upstream commit
`6d0c13df5e324f6aba9cdf2cf14a550d0cf0ca55` has `jobs` and `job_events`, and
its quotes/invoices link directly to jobs. It has no project table or
multi-job project ownership semantics. Earlier OperatorOS acceptance probes
asked for both a project and task endpoint, but that probe was not source
evidence and would have created two names for the same operational record.

## Decision

`tradeflowkit_jobs` is the primary work-order entity. A job belongs to one
tenant and customer, may reference a shared-directory site and assignee, and
owns scheduling, priority, operational state, documents, attachments,
comments, tags, and audit history.

`tradeflowkit_tasks` is the first-class execution entity beneath a job. Tasks
support assignee, due date, priority, ordering, optimistic version, archive
state, completion, and same-job acyclic dependencies.

OperatorOS does not expose a TradeFlowKit project table or `/projects` API.
That path fails closed. A future project entity requires new source/product
evidence showing a real multi-job grouping with lifecycle and authorization
semantics, followed by a superseding ADR.

## Consequences

- Customer -> job -> task -> quote -> invoice -> payment is the canonical
  workflow and navigation vocabulary.
- Quotes and invoices continue to link directly to a job.
- Tasks cannot enumerate or depend on foreign-tenant or foreign-job records.
- The old acceptance probe now expects `/projects` to return 404 and verifies
  task creation beneath `/jobs/:id/tasks`.
- There is no lossy project-to-job data migration because the approved source
  contains no project records.

## Data and security impact

Tasks and dependencies are tenant-namespaced. Composite tenant/parent foreign
keys prevent cross-tenant relationships at the database layer. Server guards
revalidate tenant membership, module access, write access, assignees, parents,
dependencies, and optimistic versions. Completion fails while an active
prerequisite is incomplete.

## Migration and rollback

The schema addition is additive and idempotent. Rollback follows the root
database contract: restore the pre-release backup into a new database and
switch traffic. No in-place destructive down migration is supported.
