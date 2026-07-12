# OutCall Threat Model

## Assets and trust boundaries

Sensitive assets are OperatorOS identity/tenant context, verified phone numbers,
private triggers, call scripts, trusted contacts, schedules, provider credentials,
billing state, and audit evidence. Trust boundaries exist between browser and
OutCall, OperatorOS and OutCall SSO, Twilio and public webhooks, Stripe and the
parent billing webhook, the HTTP process and worker, and application/database.

## Principal threats and controls

| Threat                             | Required controls                                                                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stolen/replayed SSO handoff        | Short expiry, fixed issuer/audience, HS256 allowlist, one-time persisted `jti`, current account/tenant/entitlement recheck, secure child session.                       |
| Cross-tenant or IDOR access        | Session-derived user/tenant, repository-layer ownership predicates, masked 404s, negative authorization tests.                                                          |
| SMS/voice webhook forgery          | Twilio signature on exact canonical URL and original parameters, receiving-number allowlist, unique provider ids, fail closed.                                          |
| Duplicate or concurrent delivery   | Unique MessageSid/CallSid/event constraints, transactional state changes, execution keys, `SKIP LOCKED`, provider idempotency and reconciliation.                       |
| Toll fraud/arbitrary calling       | Verified destinations only, owned/approved caller IDs, country/premium blocking, per-user/destination/global rate and concurrency limits, spend alerts/circuit breaker. |
| Trigger/phone disclosure           | AEAD encryption, independent HMAC lookup, key versions, masked UI/logs, reauthentication, least-privilege DB access.                                                    |
| OTP abuse/account probing          | Twilio Verify, send/attempt limits, generic responses, single-use/expiry, no OTP storage/logging, duplicate ownership policy.                                           |
| Unsafe impersonation               | Content policy and validation prohibit emergency, police, healthcare, school, or government impersonation; clear non-911 disclaimer.                                    |
| Queue manipulation/duplicate calls | Restricted internal API, database roles, signed internal jobs, leases, atomic claims, max retries, dead-letter review.                                                  |
| Billing bypass/double charge       | Parent entitlement is authoritative, append-only usage events, atomic reservations, unique callback keys, reconciliation.                                               |
| Trusted-contact abuse              | Verification, explicit consent, opt-out, quiet hours, bounded escalation, entitlement and audit.                                                                        |
| Sensitive telemetry                | Structured allowlisted metadata, log redaction tests, no SMS body/OTP/token/signature/trigger/full number.                                                              |
| Insider/admin abuse                | Scoped roles, time-limited support grants, reason codes, masked defaults, immutable audit, no raw phrase access.                                                        |
| Availability/provider outage       | Durable PostgreSQL queue, retries by error class, lease recovery, worker health, reconciliation, explicit delivery-failure messaging.                                   |

## Safety invariants

OutCall never calls an unverified arbitrary destination, spoofs caller ID,
records by default, contacts emergency services automatically, or claims to
replace 911. A user-provided script cannot override these invariants. Location
tracking is outside the MVP. Provider failure must never be represented as a
successful rescue or stopped escalation.

## Phase 1 open risks

- The existing parent `.replit` contains user-environment values and should be
  audited/rotated outside this module before production; secrets must move to
  Replit Secrets and never be committed.
- The existing CallCommand Twilio helper includes recording/transcription paths;
  it cannot be reused without removing those defaults and adding OutCall-specific
  canonical URL and messaging validation.
- Root deployment is Autoscale and cannot host the durable OutCall worker.
- No OutCall runtime, migrations, provider validation, abuse controls, or
  security tests exist yet. The registry therefore remains planned.
