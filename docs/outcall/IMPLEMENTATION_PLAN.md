# OutCall Implementation Plan

## Phase 1 — completed foundation

- Discover parent architecture and integration contracts.
- Reserve `apps/modules/outcall` and add a data-only adapter.
- Initially reserve OutCall in the shared catalog/ecosystem pending the Phase
  12B product decision.
- Decide on shared PostgreSQL and a single Replit Reserved VM.
- Document SSO, data model, security, environment, deployment, and launch gates.

## Phase 12B source/local increment — completed

- ADR-0027 resolves the distinct/merge/cancel decision: OutCall is distinct.
- OperatorOS opaque-code SSO, entitlement, tenant, write-role, shared jobs,
  activity and append-only usage are reused.
- Safety acknowledgement, globally owned verified phone, encrypted private
  triggers, rescue profiles, verified-self scheduling, cancellation and
  history are persistent.
- The original call adapter is test-only and requires all three explicit test
  gates. Trusted contacts, check-ins, duress and location remain excluded.

## Phase 18 provider and product increment — completed in source

- Twilio Verify starts and confirms verified-self ownership.
- Signed inbound SMS performs exact normalized trigger matching and replay-safe
  durable scheduling.
- Voice placement uses the verified-self destination, recording off, dynamic
  signed status/DTMF callbacks, one-attempt submission, durable rate limits,
  safe events, and exactly-once usage.
- Profile/trigger editing, cancellation, history, private export, and
  password-confirmed deletion are available in the responsive workspace.
- Catalog, registry, SSO matrices, verifier, preflight, and release v33 treat
  OutCall as active while the provider still fails closed when unconfigured.

## Completed engineering slices

- Inbound messaging, durable calls, product UI, parent-owned billing/usage,
  security hardening, production preflight, tests, and release-schema work are
  implemented in the active shared runtime.
- Optional trusted contacts, check-ins, duress, location, arbitrary
  destinations, emergency claims, recording, impersonation, and autonomous or
  bulk dialing are deliberately outside the approved product.

## Remaining deployment and limited-launch gate

1. Commit and review the exact source candidate.
2. Back up the target database and apply/verify release v33 through the shared
   readiness-gated supervisor.
3. Configure the documented Replit protection/provider secrets, DNS/TLS, and
   exact inbound SMS callback; keep the test adapter absent.
4. Pass public health/readiness, release identity, 13-module exact-host SSO,
   denial, deep-link, return, and logout acceptance.
5. Run one controlled verified-self Verify/SMS/voice/DTMF/status sequence with
   replay, tamper, cancellation, export, deletion, outage, and recording-off
   evidence.
6. Confirm Twilio spend/fraud/geo/concurrency alerts, monitoring, backup,
   rollback, privacy review, and support procedures before a limited launch.

Production classification is not permitted from code inspection or local
test-adapter acceptance alone.
