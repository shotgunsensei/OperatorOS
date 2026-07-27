# OutCall Implementation Plan

## Phase 1 — completed foundation

- Discover parent architecture and integration contracts.
- Reserve `apps/modules/outcall` and add a data-only adapter.
- Initially reserve OutCall in the shared catalog/ecosystem pending the Phase
  12B product decision.
- Decide on shared PostgreSQL and a single Replit Reserved VM.
- Document SSO, data model, security, environment, deployment, and launch gates.

## Phase 12B source/local increment — implemented

- ADR-0027 resolves the distinct/merge/cancel decision: OutCall is distinct.
- OperatorOS opaque-code SSO, entitlement, tenant, write-role, shared jobs,
  activity and append-only usage are reused.
- Safety acknowledgement, globally owned verified phone, encrypted private
  triggers, rescue profiles, verified-self scheduling, cancellation and
  history are persistent.
- The call adapter is test-only and requires all three explicit test gates.
- Live provider, trusted contacts, check-ins, duress and location remain
  fail-closed or absent, never presented as working.

## Next provider increment — identity verification and inbound messaging

Complete Twilio Verify, signed inbound SMS, deterministic trigger parsing,
rate/circuit controls, status callbacks, DTMF and real-number acceptance. Do
not enable live calls merely because local test-adapter acceptance passes.

## Phase 3 — inbound messaging

Add raw form capture, canonical Twilio signature validation, verified sender and
receiver resolution, deterministic normalized trigger matching/time parsing,
transactional MessageSid idempotency, discreet replies, rate limits, circuit
breaker, and immediate raw-body purge.

## Phase 4 — durable calls

Add versioned migrations, job claim/lease/retry/dead-letter logic, worker
heartbeat, reconciliation, verified-destination enforcement, Twilio Voice/TwiML
and DTMF, callback idempotency, graceful shutdown, health/readiness, and restart
tests. Keep recording off.

## Phase 5 — product UI

Build accessible mobile-first onboarding, dashboard, schedules, trigger/profile
settings, call history, masked privacy mode, error/empty states, and documented
safety disclaimer using OperatorOS design tokens where applicable.

## Phase 6 — billing and usage

Extend parent Stripe catalog/webhook and entitlement resolver. Add append-only
usage events, atomic reservation/reconciliation, plan/organization enforcement,
and billing UI. Never create an unrelated Stripe customer.

## Phase 7 — optional safety workflows

Behind feature flags and entitlements, add consented trusted contacts and
transactional check-ins. Duress remains separately gated. Location stays off.

## Phase 8 — deployment and operations

Create Reserved VM configuration, locked migrations, domain/TLS, Replit Secrets,
Twilio/Stripe callback configuration, metrics/alerts, backups, rollback, and
idempotent scheduled reconciliation.

## Phase 9 — hardening

Perform the requested deep security scan, fix validated issues, add abuse and
privacy tests, rotate exposed credentials, complete incident/retention/secret
runbooks, and conduct dependency review.

## Phase 10 — limited launch audit

Run automated, manual, and controlled real-provider tests against approved
numbers. Activate first for a limited beta only after every critical gate is
evidenced. Production classification is not permitted from code inspection
alone.
