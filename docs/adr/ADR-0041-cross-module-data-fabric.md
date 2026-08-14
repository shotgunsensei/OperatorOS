# ADR-0041 — Cross-module data fabric and native-record ownership

- Status: Accepted for Phase 38 source/local release candidate
- Date: 2026-08-14

## Context

OperatorOS modules previously shared parent identity, entitlements, directory,
attachments, providers, jobs, and audit services, but high-value business
journeys still stopped at module boundaries. Direct synchronous writes would
couple availability, obscure provenance, allow retry duplication, and risk
cross-tenant or entitlement bypasses. A universal shared business-record model
would also erase product-specific semantics.

## Decision

OperatorOS owns a tenant-bound, versioned domain-event fabric using durable
workflow runs, HMAC-signed outbox events, leased inbox delivery, native
destination adapters, typed resource references, provenance links,
compensation records, and audited replay. Events contain correlation,
causation, aggregate sequence, source deep link, bounded payload digest, and a
canonical signature. Production publishing fails closed without the shared
encryption key.

Both source and destination module access are evaluated when publishing and
again immediately before delivery. Destination mutation, inbox/event/run
completion, canonical references, and provenance links commit in one database
transaction. A source record never participates in a synchronous distributed
transaction and is never mutated to compensate for a destination failure.

Native modules retain ownership of jobs, tickets, cases, reports, content,
assets, and evidence. Shared references connect these records but do not create
a new polymorphic record authority. OperatorOS Business Directory remains the
canonical organization/site/contact/requester identity; modules store validated
Directory references and their own domain-specific details.

Sensitive training-case workflows require explicit author approval and a
verified redaction pass before creating an unpublished FaultlineLab draft.
Ninjamation source may become inert TechDeck documentation, a draft runbook,
and checksum evidence, but it is never executed by the web or API process.

## Consequences

- Duplicate publish, delivery, and replay attempts reuse durable keys and do
  not duplicate destination records or side effects.
- Destination disablement, entitlement revocation, archived sources, partial
  exports, integrity failure, and redaction denial become observable retry or
  dead-letter states without corrupting source records.
- Operators can inspect source, destination, actor, status, attempts, error,
  replay count, and native deep links in one tenant-scoped provenance view.
- Additive release v48 introduces seven fabric tables and SnapProofOS Directory
  references. Rollback stops publishers/workers and leaves the additive ledger
  intact; destructive table removal is not an application rollback strategy.
- A future event transport may replace the in-database queue only if it
  preserves the envelope, signature, sequence, idempotency, tenant,
  entitlement, audit, compensation, and replay contracts.

## Rejected alternatives

- Synchronous source-to-destination HTTP chains: rejected because partial
  failures and retries cannot be made safely atomic across modules.
- One shared table for every module record: rejected because it collapses
  product semantics and authorization boundaries.
- Client-supplied tenant, actor, source, destination, or entitlement claims:
  rejected because authority must come from the trusted OperatorOS session and
  registry.
- Automatic publication of support data as training content: rejected because
  redaction and human author approval are mandatory.
- Automatic execution of imported Ninjamation scripts: rejected because
  display/reference is not execution authority.
