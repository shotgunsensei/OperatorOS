# ADR-0033: Shared platform control plane and compatibility adapters

- Status: Accepted
- Date: 2026-08-08
- Scope: encrypted provider references, provider readiness, notification
  suppression/delivery evidence, outbound webhooks, schedules, exports, API
  tokens, service identities, feature flags, search, legacy references, and
  signed retrieval
- Extends: ADR-0008 and ADR-0009

## Context

ADR-0009 established the first OperatorOS-owned attachment, notification,
provider, job, inbound-webhook, usage, activity, and idempotency services. The
Phase 20 source inventory also identifies source-visible provider setup,
outbound integration, scheduled work, report/export, API credential, feature
readiness, and cross-module navigation workflows. Removing child-local
authority without replacements would delete those product outcomes; enabling
the child implementations would duplicate secrets, tenant authority, billing,
workers, and provider state.

Phase 22 therefore needs an additive control plane that lets modules express
typed intent after server authorization while OperatorOS retains the durable
state and policy boundary.

## Decision

1. `@operatoros/sdk` owns the transport-neutral shared-platform vocabulary.
   Child modules pass a trusted tenant/module/actor context and intent; they do
   not supply trusted tenant authority, lease ownership, storage keys, billing
   balances, or provider readiness.
2. Release v34 adds one non-destructive `shared_platform_tables` step after
   `shared_service_tables`. All Phase 22 times are `TIMESTAMPTZ`. Clean apply
   and reapply remain the only supported schema path.
3. Provider credentials and external vault references use AES-256-GCM at rest
   with a versioned 32-byte OperatorOS key. Browser responses contain only a
   fingerprint and `hasSecretReference`; ciphertext, IVs, tags, decrypted
   references, and raw provider material never leave the server.
4. Provider readiness is explicit. `disabled` is blocked; `test` is degraded
   and has `externalDelivery=false`; `live` is ready only when required secret
   references and callbacks exist. Missing production prerequisites never
   become a success state.
5. Notification destinations can be suppressed by a tenant-scoped hash. Each
   delivery attempt records adapter, state, safe error, and whether an external
   delivery occurred. Deterministic email/SMS/AI/storage/webhook/OAuth adapters
   record payload behavior as `recorded_not_delivered`.
6. Outbound webhooks require public HTTPS, no URL credentials, standard port,
   HMAC-SHA256 signing, a timestamped signature, bounded retries, leases,
   delivery logs, and dead-letter state. URL parsing and live DNS resolution
   reject loopback, link-local, private, reserved, local, and internal targets;
   redirects are rejected.
7. Schedules atomically claim due rows, advance `next_run_at`, and enqueue an
   idempotent leased job in one transaction. Dead-letter recovery is an
   audited tenant-admin action. Crashed workers retain the ADR-0009 expired
   lease recovery behavior.
8. Exports are asynchronous registered handlers. A generated report becomes a
   shared attachment, inherits scan/integrity/retention behavior, and is
   retrieved through a short-lived opaque grant stored only as a hash. Pending
   or quarantined attachments cannot receive a grant.
9. Service identities own scoped API tokens. The raw token is returned exactly
   once; only a high-entropy SHA-256 hash and prefix are stored. Scope,
   expiration, tenant binding, identity state, last use, and revocation are
   checked server-side.
10. Feature flags are tenant or tenant/module scoped, versioned, role-gated,
    and audited. They cannot replace entitlement, role, billing, or provider
    readiness checks.
11. Global search stores tenant/module/object references and relative deep
    links only. Every query includes the trusted tenant predicate. Legacy
    source identifiers resolve through an explicit tenant/module mapping with
    provenance.
12. The generated shared-equivalent adapter contract is derived from every
    `ACTIVE_SHARED_EQUIVALENT` Phase 20 record. Each mapping names the original
    user outcome, compatibility assertion, adapter, test ID, and test path;
    duplicates, missing tests, and stale output fail verification.

## Consequences

- Later module restoration can preserve provider, notification, attachment,
  webhook, job, export, API-token, usage, feature-readiness, and search
  workflows without activating child servers, migrations, or credential
  stores.
- A queued, retrying, disabled, recorded-test, dead-letter, quarantined, or
  blocked state remains visible. The system does not convert infrastructure
  outages or deterministic adapters into successful external delivery.
- The tenant-admin Shared Services console is operational data, not a mock
  dashboard. Team and per-module access remain on the existing OperatorOS
  tenant authority surfaces.
- Live providers, callbacks, malware scanning policy, and deployment acceptance
  remain environment gates. Source/local implementation does not prove those
  owner-operated dependencies.

## Data, security, and privacy

Every Phase 22 table has a tenant foreign key and tenant-leading indexes or
uniqueness. Module-scoped records add a module foreign key. Secret responses
are allowlisted. Metadata passes the shared recursive credential/PHI redactor.
Webhook payload projections and export filters are bounded. SSRF checks occur
both at endpoint registration and immediately before live network delivery to
reduce DNS rebinding exposure. Token and download-grant material is
high-entropy and hash-only at rest. Tenant administrators may narrow feature
availability but cannot widen roles or entitlements.

## Migration and rollback

The migration is additive release v34. It does not run a child migration,
delete a child table, or alter production data. Apply is idempotent and is
verified through `corepack pnpm db:plan` and the guarded root `db:apply` path.
Rollback follows `docs/DATABASE_BACKUP_RESTORE.md`: restore the pre-release
backup into a new database, verify, and switch traffic. Older code ignores the
new tables; outstanding Phase 22 jobs and grants should be drained or disabled
before an application rollback.

## Superseded records

No accepted ADR is superseded. This ADR extends ADR-0009 and makes its
deterministic-adapter promise executable by distinguishing recorded test
behavior from external delivery.
