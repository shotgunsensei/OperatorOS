# OutCall Go-Live Checklist

Current classification: **active source/local release candidate; deployment
acceptance open**. Catalog and launch activation are implemented in the current
candidate. Do not call OutCall production-ready until every unchecked target
gate below is evidenced on the exact deployed revision.

## Completed in the candidate

- [x] OperatorOS owns identity, host sessions, tenant selection, roles,
      entitlements, add-on billing, registry, navigation, audit, jobs, and usage.
- [x] OutCall is active in the catalog, deployment registry, SSO matrix,
      launcher, production verifier, and add-on readiness checks.
- [x] Calls can target only the server-recovered verified-self number.
- [x] Phone and trigger values are independently encrypted/fingerprinted;
      projections are masked and private phrases are never returned.
- [x] Emergency/government/healthcare/school impersonation, recording, caller-
      ID spoofing, arbitrary destinations, location, and emergency contact are
      excluded or rejected.
- [x] Immediate, delayed, absolute scheduling, cancellation, history, profile
      and trigger management, password-confirmed export, and deletion exist.
- [x] Twilio Verify, voice, DTMF, status, and inbound SMS paths verify the exact
      canonical public signature and use replay-safe shared receipts.
- [x] Tenant/user-scoped persistent rate limits, job idempotency, provider-ID
      uniqueness, one-attempt live submission, and exactly-once usage are wired.
- [x] Release v33 is additive, ordered, idempotent, and verifies all OutCall
      product tables.
- [x] The UI uses customer-facing safety, privacy, scheduling, history, and
      account controls without exposing provider/developer diagnostics.

## Replit and provider acceptance

- [ ] Set every variable in `docs/outcall/ENVIRONMENT.md` as a Replit Secret or
      reviewed server configuration; confirm `OUTCALL_TEST_ADAPTER` is absent.
- [ ] Confirm `outcall.operatoros.net` DNS/TLS and that every Twilio callback
      resolves through the public `/api/modules/outcall/webhooks/...` path.
- [ ] Confirm the owned Twilio number supports voice and inbound SMS, Verify is
      active, geo permissions match the allowlist, and messaging compliance is
      complete.
- [ ] Run one controlled real Verify, voice, DTMF, status, inbound SMS, retry-
      avoidance, and cancellation acceptance sequence with recording absent.
- [ ] Configure Twilio spend alerts, concurrency limits, fraud controls, and an
      incident stop procedure; record the account/number evidence without
      storing secret values.
- [ ] Confirm `STRIPE_PRICE_ADDON_OUTCALL` is a valid live-mode recurring price
      and exercise add-on checkout, grant, cancellation, and replay behavior.

## Deployed OperatorOS acceptance

- [ ] Deploy the exact reviewed commit and pin the release identity.
- [ ] Apply release v33 only through the supported release supervisor after a
      backup; verify health, readiness, release identity, and rollback target.
- [ ] Pass exact-host SSO issue/exchange, deep links, return navigation, local
      logout, global logout, suspension, role change, and entitlement removal.
- [ ] Pass authenticated primary workflow, viewer/write denial, and second-
      tenant non-enumeration on the deployed host.
- [ ] Verify queue heartbeat, callback failures, provider outage, rate-limit,
      spend, and call-failure alerts in the production monitoring path.
- [ ] Complete backup/restore rehearsal, rollback decision record, customer
      support runbook, privacy/retention review, and controlled launch approval.

## Product quality

- [ ] Record final committed install, focused/full tests, typecheck, production
      build/start, health/readiness, and browser totals in the implementation
      status (the repository has no lint/format command, so none is claimed).
- [ ] Pass mobile, keyboard, focus, labels, contrast, reduced-motion, and screen-
      reader review on the deployed OutCall experience.
- [ ] Confirm customer copy, help text, error recovery, account export/deletion,
      and non-emergency disclaimers with a product/privacy reviewer.
