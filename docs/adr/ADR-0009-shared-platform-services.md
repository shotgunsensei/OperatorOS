# ADR-0009: OperatorOS-owned shared platform services

- Status: Accepted
- Date: 2026-07-18
- Scope: attachments, notifications, outbound providers, background work,
  webhooks, usage metering, activity timelines, and idempotency

## Context

The imported module snapshots contain incompatible implementations of object
storage, email/SMS delivery, provider webhooks, retry loops, AI fallbacks,
notifications, jobs, usage, and activity. Activating those implementations
would duplicate secrets and authority, make tenant isolation inconsistent, and
run child migrations against the OperatorOS database.

The canonical Replit deployment already has one Fastify process, one
PostgreSQL authority, and an autoscale supervisor. The simplest recoverable
architecture is therefore a PostgreSQL-backed service layer and leased worker
inside the compiled API process.

## Decision

1. OperatorOS owns the shared service contracts in `apps/api/src/lib` and the
   ordered schema in `shared-services-db-init.ts`.
2. Every persisted service record is bound to the trusted tenant and module.
   Modules pass intent after server authorization; browser clients never pass
   storage keys, provider secrets, lease ownership, or trusted scope.
3. Attachments use randomized private keys, signature/MIME validation,
   integrity hashes, scan state, authorized reads, versions, soft deletion,
   and retention. Expired soft-delete retention purges the private blob while
   retaining metadata evidence. PostgreSQL blob storage is the initial
   configurable adapter; raw storage URLs are not exposed.
4. Notifications use a database outbox. Versioned templates, email, SMS, and
   in-app delivery share idempotency, bounded retry, provider message IDs,
   disabled and dead-letter terminal states, and redacted context.
5. Email, SMS/telephony, payments, and AI expose explicit
   `configured`/`disabled`/`test` adapter states. Deterministic adapters exist
   only in test environments. Unconfigured production providers fail closed;
   no mock result is presented as delivery or AI work.
6. Jobs, outbound messages, and webhook receipts use PostgreSQL leases with
   `FOR UPDATE SKIP LOCKED`, bounded retry, dead-letter state, correlation IDs,
   and expired-lease recovery. Stale workers cannot overwrite a replacement
   lease. Fastify shutdown drains the active cycle; a crashed process is
   recovered after lease expiry.
7. Provider signatures are verified before receipt creation. The receipt
   ledger stores a payload hash and redacted safe projection, never the raw
   provider body. Provider event IDs are globally unique per provider and
   payload/scope conflicts fail closed.
8. Usage is an append-only event ledger. Activity is an append-only,
   tenant/module/object-scoped timeline with bounded redacted metadata and
   cursor pagination. Commercial balances are derived later and are never the
   sole mutable source of truth.
9. Generic idempotency stores a stable request hash and bounded response
   projection. Replays return the prior result, changed requests conflict, and
   expired processing leases may be reclaimed.
10. Imported module servers, schemas, migrations, SDK ownership, and provider
    fallbacks remain read-only migration evidence.

## Consequences

- Phase 4 and later modules must call these services inside their existing
  authorized transactions rather than calling provider SDKs from route/UI
  handlers.
- Adding a provider means implementing an adapter and health state, not adding
  module-owned secrets or login/billing authority.
- The initial PostgreSQL attachment adapter is intentionally conservative for
  autoscale compatibility. Moving blobs to managed object storage requires a
  reviewed adapter and migration, but not a module schema fork.
- An unavailable malware scanner is visible as `unavailable`; it is not
  reported as clean. Deployments requiring clean-only download must configure
  a scanner adapter or tighten launch policy.
- Dead-letter queues require operational monitoring and deliberate replay;
  retry counts are bounded so outages cannot create unbounded loops.

## Data, security, and privacy

The ten `shared_*` tables use restrictive foreign keys, tenant predicates,
constraints, indexes, bounded fields, hashes, audit/correlation references,
and no plaintext provider credentials. Metadata redaction removes common
credential, session, transcript, recording, SSN, PHI, and authorization keys.
Module activity summaries must remain operational and must not copy secret or
sensitive payload bodies.

## Migration and rollback

The new schema is the additive `shared_service_tables` step in the single
OperatorOS database release. Child migrations are prohibited. Rollback is the
existing restore-to-new-database and traffic-switch procedure; no destructive
down migration is supported. Lease and idempotency rows may be retained across
application rollback, provided the older application does not claim them.

## Superseded records

No accepted ADR is superseded. This decision supersedes module-local shared
infrastructure found only in quarantined source snapshots.
