# OutCall Go-Live Checklist

The Phase 1 classification is **NOT READY**. The shared registry must remain
`planned` until every applicable item below has evidence attached to the launch
audit.

## OperatorOS integration

- [ ] Production SSO issuer/audience, one-time consume, session invalidation,
      suspension, MFA behavior, tenant isolation, and role changes pass tests.
- [ ] `resolveEntitlements` grants trial/paid/organization access and denies
      missing, expired, revoked, and suspended access.
- [ ] Parent Stripe webhook/catalog and usage rules are live; no duplicate
      customer or child billing authority exists.
- [ ] Registry status activation is a separate reviewed change.

## Safety and privacy

- [ ] Only verified destinations and owned/approved caller IDs can be used.
- [ ] Emergency/government/healthcare/school impersonation and automatic
      emergency-service contact are blocked.
- [ ] Non-911 and delivery-failure disclaimers are visible and accessible.
- [ ] Phone/trigger encryption, HMAC lookup, masking, reauthentication, export,
      deletion, and retention jobs are tested.
- [ ] Raw SMS, OTPs, trigger phrases, full numbers, tokens, and secrets are absent
      from logs, analytics, error telemetry, and browser history.
- [ ] Recording is disabled and location is absent from the MVP.

## Reliability and abuse

- [ ] Twilio signatures use the exact canonical URL and original parameters on
      every SMS/voice route; invalid/replayed callbacks fail closed.
- [ ] MessageSid, CallSid, webhook, job, and usage idempotency pass concurrent tests.
- [ ] PostgreSQL queue leases, retry classes, dead letters, recovery,
      reconciliation, cancellation races, and VM restarts cannot duplicate calls.
- [ ] Country/premium restrictions, per-user/destination/number/global limits,
      concurrency caps, circuit breaker, Twilio geo permissions, and spend alerts
      are configured and tested.
- [ ] Health, readiness, worker heartbeat, queue age, and failure alerts are live.

## Replit and providers

- [ ] Reserved VM, persistent database, locked migrations, backups, restore test,
      graceful SIGTERM, rollback, and cost limits are verified.
- [ ] `outcall.operatoros.net` DNS and TLS are verified; no production callback
      points at a preview/temporary domain.
- [ ] Replit Secrets contain every production secret; repository and Git history
      scans are clean; exposed legacy values are rotated.
- [ ] Twilio number supports required SMS/voice, Verify and Messaging services are
      configured, US messaging compliance is complete, and controlled real calls
      demonstrate DTMF/status callbacks without recording.
- [ ] Stripe production webhook and redirect URLs are verified.

## Product quality

- [ ] Install, formatting, lint, typecheck, unit, integration, E2E, dependency
      audit, and production build pass with exact totals.
- [ ] Onboarding, immediate/delayed/absolute calls, cancellation, history,
      privacy mode, billing, export/deletion, and admin support pass end to end.
- [ ] Mobile layouts, keyboard use, focus, labels, contrast, reduced motion, and
      screen-reader flows pass accessibility review.
- [ ] Incident response, secret rotation, data retention, provider outage,
      reconciliation, and customer support runbooks are approved.
