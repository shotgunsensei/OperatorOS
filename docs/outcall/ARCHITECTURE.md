# OutCall Architecture

Status: Phase 1 architecture decision. OutCall is registered but not activated.

## Repository discovery

OperatorOS is a pnpm workspace (`apps/*`, `packages/*`) on Node.js 20. Its live
surfaces are a Fastify API (`apps/api`), a Next.js 14 App Router web app
(`apps/web`), and a Fastify runner gateway. Shared catalog and ecosystem types
live in `packages/sdk`; `packages/modules/registry.ts` derives normalized module
routing metadata from that catalog. Imported child products live beneath
`apps/modules/<slug>/source` with a thin parent adapter beside the snapshot.

The API uses Drizzle ORM over PostgreSQL. The current migration mechanism is
`apps/api/src/lib/saas-db-init.ts`, which performs idempotent, startup-time DDL;
some imported modules also use Drizzle Kit migrations. Before OutCall writes
production data, it should add versioned SQL/Drizzle migrations and a migration
lock rather than expand ad-hoc startup DDL.

Authentication is an OperatorOS host session in the `operatoros_session`
cookie. `authenticate` verifies signature, required claims, the current user,
active status, and `token_version`. Module launch uses the SSO v1 browser lane:
an exact callback, state, nonce, PKCE S256, and a 60-second encrypted one-time
code persisted through `sso_handoff_tokens`. The same-origin server exchange
atomically consumes the code, re-evaluates tenant and module access, and creates
a host-only session sealed to OutCall and the selected tenant. No identity JWT
or session credential appears in the URL.

RBAC is split between `users.platform_role` and `tenant_users.role`. Tenant
context precedence is route parameter, `X-Tenant-Id`, then the user's current
tenant. `resolveEntitlements(userId, tenantId)` is the canonical entitlement
snapshot. Central audit uses `writeAudit` with field allowlists. Stripe checkout,
webhooks, plan/add-on state, and entitlement propagation are owned by the parent.
An existing Twilio REST/signature helper exists for CallCommand AI, but its
recording-oriented behavior and variable names are not safe to reuse wholesale;
OutCall should extract only reviewed primitives or implement a module-scoped
adapter with recording disabled.

The web UI uses shared design tokens and `SaasLayout`; module cards and host
routing derive from the registry. Root Replit deployment currently uses an
autoscale topology, while imported child apps have their own `.replit` files.
OutCall's durable worker requirement makes autoscale unsuitable.

## Placement decision

OutCall belongs at `apps/modules/outcall`, with runtime source under
`apps/modules/outcall/source` and a thin OperatorOS adapter at the module root.
This follows the existing TechDeck, PulseDesk, and TradeFlowKit convention.
OutCall is added to `MODULE_CATALOG` as an external, `planned` Operations Deck
module. The catalog derives its database seed, entitlement key `outcall`, host,
app card, and navigation behavior; no parallel product list is introduced.

## Runtime topology

Use one Replit Reserved VM for the MVP. One supervised Node application owns:

1. Public HTTP/API and Twilio webhook handling.
2. A separately cancellable scheduler/worker loop.
3. Reconciliation and retention loops.
4. Liveness/readiness routes and worker heartbeat.

All durable state lives in PostgreSQL. The worker claims due rows with
`FOR UPDATE SKIP LOCKED`, changes state atomically, uses bounded leases and
heartbeats, and recovers expired leases. Unique execution keys and provider
identifiers prevent duplicate calls. No timer, browser, request continuation,
workspace uptime, or filesystem state is authoritative. Split web and worker
deployments only if production load or independent scaling later justifies the
additional operational surface.

## Database strategy

Prefer the shared OperatorOS production PostgreSQL database with an `outcall_`
table prefix (or an `outcall` schema if migration tooling adopts schema support).
This preserves foreign keys to `users`, `tenants`, and central subscriptions and
avoids duplicating identity or billing data. Restrict the runtime database role
to OutCall tables plus read-only access to the minimum parent views/functions.

Every tenant-owned row carries `tenant_id`; every user-owned row carries
`user_id` and, where applicable, `tenant_id`. Handlers derive both from the
server session. Cross-tenant misses return the repository-standard masked 404.

## Domain model

| Model                            | Purpose and key constraints                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OutCallUserSettings`            | One per user/tenant; timezone, privacy mode, retention policy, onboarding state. FK to parent identity.                                                      |
| `VerifiedPhoneNumber`            | Encrypted E.164 value, keyed lookup fingerprint, country, verification state, key version, soft deletion. Unique active ownership policy.                    |
| `OutCallNumber`                  | Platform-owned Twilio number/SID, capabilities, allowed countries, active state; never user caller ID.                                                       |
| `TriggerPhrase`                  | User-scoped encrypted normalized phrase plus keyed match fingerprint, action, neutral response, enabled/last-used state. Unique active fingerprint per user. |
| `RescueProfile`                  | Tenant/user-owned call behavior, verified destination reference, retry/escalation policy, active state.                                                      |
| `CallScript`                     | Versioned safe spoken content, language/voice, maximum duration; no emergency-service impersonation.                                                         |
| `CallRequest`                    | User intent and immutable requested schedule/action; references profile, script version, and verified destination.                                           |
| `ScheduledCallJob`               | Durable queue row with state, run time, lease owner/expiry, attempts, execution key, heartbeat, retry/dead-letter metadata.                                  |
| `CallAttempt`                    | One provider submission attempt, unique Twilio CallSid, status timeline, safe failure classification, duration.                                              |
| `SmsInboundEvent`                | Unique MessageSid, sender/receiver fingerprints, classification, processing state; raw body omitted after parsing.                                           |
| `SafetyCheckIn`                  | Explicit state machine, deadline, safe/duress response metadata, current escalation step.                                                                    |
| `TrustedContact`                 | Encrypted E.164 data, fingerprint, relationship, consent/verification/opt-out and quiet hours.                                                               |
| `EscalationRule`                 | Ordered, bounded action graph referencing verified consenting contacts; never emergency services.                                                            |
| `UsageEvent`                     | Append-only provider/usage ledger with idempotency key and billing-cycle reference.                                                                          |
| `OutCallSubscriptionEntitlement` | Optional local projection/cache of the parent entitlement snapshot; parent remains authoritative.                                                            |
| `WebhookEvent`                   | Provider, unique external event id, payload digest, processing/attempt/error state, retention expiry.                                                        |
| `AuditEvent`                     | Privacy-minimized OutCall security/business event, actor/tenant/subject, correlation ID, safe metadata and integrity tag.                                    |
| `AdminAction`                    | Reasoned, time-bounded support/operations action linked to immutable audit; masked by default.                                                               |

Use UUIDs, UTC timestamps, explicit state enums, optimistic/version columns where
races matter, and partial unique indexes for active records. `CallRequest` is
the user intent; `ScheduledCallJob` is execution state; `CallAttempt` is each
provider interaction. Keeping these separate makes retries and billing auditable.

## Data protection

- Normalize numbers to E.164 before persistence; reject unsupported countries.
- Encrypt phone numbers and trigger phrases with an envelope/AEAD scheme and
  stored key version. Use independent HMAC-SHA-256 lookup keys for equality.
- Never log OTPs, full numbers, trigger phrases, raw SMS, cookies, SSO tokens,
  provider credentials, or Twilio/Stripe signatures.
- Process Twilio callbacks idempotently inside a transaction; retain only the
  provider id, digest, classification, timestamps, and safe error class.
- Apply tenant and ownership filters in every repository method, not only UI.
- Use soft deletion for records referenced by audit/billing history and hard
  purge ciphertext after the disclosed retention period when legally allowed.
- Export and deletion requests require active session, reauthentication, audit,
  asynchronous execution, and preservation only of mandatory billing/security
  records.

## Existing quality and operations

Root scripts provide build and typecheck, while API tests use Node's test runner.
There is no root lint, format, or test script and no checked-in GitHub Actions
workflow discovered. Replit configuration, deployment logs, Fastify logging,
and central audit are the current operational mechanisms. Phase 2 should add
OutCall-specific unit/integration/e2e scripts before runtime activation.
