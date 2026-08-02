# ADR-0030: TradeFlowKit lead-operations and intake boundary

- Status: Accepted
- Date: 2026-08-01
- Scope: TradeFlowKit lead settings, follow-ups, source validation, and test messaging

## Context

The restored TradeFlowKit product included tenant lead settings, trade
templates, follow-up tasks, capture-form configuration, source-adapter
discovery, source-event history, and provider test messaging. It also exposed
anonymous lead-ingress routes. Recreating that surface without a reviewed
privacy, consent, retention, rate-limit, and abuse contract would create a new
public data-ingestion boundary inside OperatorOS.

Operators still need the internal half of the workflow: configure how new
leads are handled, apply a trade-specific playbook, see and action scheduled
follow-ups, validate adapter payloads before deployment, and verify the shared
notification path.

## Decision

OperatorOS will restore the authenticated internal lead-operations surface.
All state is stored under the trusted session tenant and remains subject to
the TradeFlowKit entitlement. Tenant members may read settings, follow-ups,
adapter descriptions, and sanitized source events. Tenant owners and admins
may change settings, apply a reviewed template, validate an adapter sample,
queue a follow-up, complete a follow-up, or queue a test email.

New manually created leads receive the configured follow-up sequence in the
same database transaction as the lead. Follow-up delivery is deliberate and
manual in this increment: each queued message uses the shared OperatorOS
outbox, requires an idempotency key, derives its destination from the
tenant-owned lead, and preserves the existing SMS-consent requirement.

Adapter validation accepts a bounded sample through an authenticated admin
route, applies the canonical lead-input validator, and persists only the
adapter key, validation result, accepted field names, and payload size. It
does not create a lead and never stores the sample values.

Test messaging supports email only. It requires an explicit confirmation and
queues to the authenticated tenant admin's OperatorOS account email. The
request cannot supply or override the destination. Replay is safe and body
drift fails closed through the shared outbox idempotency contract.

Anonymous capture and source-adapter ingress remain absent. Capture-form state
is an internal deployment profile only; it does not issue a public token or
advertise a working public URL. Automatic response delivery, autonomous
follow-up execution, direct SendGrid/Twilio credentials, and module-owned
provider configuration remain outside this decision.

## Consequences

TradeFlowKit gains a usable lead-conversion setup and follow-up workflow
without creating a second auth, scheduler, notification, or public-ingress
authority. Provider delivery remains dependent on the shared OperatorOS
worker and its deployment secrets, and the UI must label that boundary.

The public lead-capture routes remain explicit parity gaps until a later ADR
defines consent evidence, request authentication or rate limiting, PII
retention, deletion, abuse response, webhook verification, and deployed-host
acceptance.

## Data and security impact

Release v31 adds four additive tenant-scoped tables: lead settings, capture
profiles, follow-up tasks, and sanitized source events. Composite tenant
foreign keys prevent a follow-up or event from referencing another tenant's
lead. Optimistic versions protect mutable settings and follow-ups. Templates
and adapter keys are server allowlists; message and event projections never
return secret material or raw adapter samples.

## Migration and rollback

The release is additive and idempotent. Application rollback may leave the
four tables in place so configured workflows and audit history are retained.
Database rollback follows the repository-wide restore-to-new-database and
traffic-switch procedure. No destructive in-place down migration is defined.

