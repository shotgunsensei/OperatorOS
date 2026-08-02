# OutCall Threat Model

## Assets and trust boundaries

Sensitive assets are OperatorOS identity/tenant context, verified phone numbers,
private triggers, call scripts, schedules, provider credentials, billing state,
and audit evidence. Trust boundaries exist between browser and
OutCall, OperatorOS and OutCall SSO, Twilio and public webhooks, Stripe and the
parent billing webhook, the HTTP process and worker, and application/database.

## Principal threats and controls

| Threat                             | Required controls                                                                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stolen/replayed SSO handoff        | Exact callback, opaque 60-second single-use code, state, nonce, PKCE S256, current account/tenant/entitlement recheck, and host-only session.                         |
| Cross-tenant or IDOR access        | Session-derived user/tenant, repository-layer ownership predicates, masked 404s, negative authorization tests.                                                          |
| SMS/voice webhook forgery          | Twilio signature on exact canonical URL and original parameters, receiving-number allowlist, unique provider ids, fail closed.                                          |
| Duplicate or concurrent delivery   | Unique MessageSid/CallSid/event constraints, transactional state changes, execution keys, `SKIP LOCKED`, provider idempotency and reconciliation.                       |
| Toll fraud/arbitrary calling       | Verified-self destination only, owned caller ID, controlled `+1` launch boundary, persistent tenant/user rate limits, one-attempt live submission, and deployment-gated Twilio spend/fraud controls. |
| Trigger/phone disclosure           | AEAD encryption, independent HMAC lookup, key versions, masked UI/logs, reauthentication, least-privilege DB access.                                                    |
| OTP abuse/account probing          | Twilio Verify, send/attempt limits, generic responses, single-use/expiry, no OTP storage/logging, duplicate ownership policy.                                           |
| Unsafe impersonation               | Content policy and validation prohibit emergency, police, healthcare, school, or government impersonation; clear non-911 disclaimer.                                    |
| Queue manipulation/duplicate calls | Guarded browser routes, tenant-bound shared jobs, atomic state claims, unique provider call IDs, replay-safe receipts, and no automatic retry after an uncertain live submission.              |
| Billing bypass/double charge       | Parent entitlement is authoritative, append-only usage events, atomic reservations, unique callback keys, reconciliation.                                               |
| Trusted-contact abuse              | Trusted contacts and escalation are excluded from the approved product boundary; adding them requires a new reviewed ADR and consent model.                                  |
| Sensitive telemetry                | Structured allowlisted metadata, log redaction tests, no SMS body/OTP/token/signature/trigger/full number.                                                              |
| Insider/admin abuse                | Scoped roles, time-limited support grants, reason codes, masked defaults, immutable audit, no raw phrase access.                                                        |
| Availability/provider outage       | Durable PostgreSQL queue, lease recovery, worker health, safe failure state, explicit customer status, and no duplicate-risk retry for an unknown live-call outcome.       |

## Safety invariants

OutCall never calls an unverified arbitrary destination, spoofs caller ID,
records by default, contacts emergency services automatically, or claims to
replace 911. A user-provided script cannot override these invariants. Location
tracking is outside the MVP. Provider failure must never be represented as a
successful rescue or stopped escalation.

## Phase 18 open risks

- The existing parent `.replit` contains user-environment values and should be
  audited/rotated outside this module before production; secrets must move to
  Replit Secrets and never be committed.
- The OutCall provider is independent from CallCommand and forces recording
  off, but the exact deployed callback path and Twilio primary-token signature
  must still be accepted on the public host.
- Source/local Verify, voice, SMS, DTMF, signature, replay, rate, export, and
  deletion tests pass; real-number/provider, restart, exact-host, and deployed
  evidence must be repeated on the exact committed release.
- Twilio spend alerts, fraud controls, geo permissions, concurrency limits,
  monitoring, and an incident stop procedure remain deployment tasks.
- The controlled code boundary accepts North American `+1` numbers. Widening
  or narrowing by actual numbering-plan country requires a reviewed lookup
  design rather than prefix inference.
