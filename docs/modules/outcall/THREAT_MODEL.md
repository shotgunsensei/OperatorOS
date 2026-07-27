# OutCall threat model

Assessment date: 2026-07-27

## Protected assets and boundaries

Protected assets are OperatorOS identity and tenant context, verified phone
numbers, private triggers, scripts, trusted contacts, schedules, provider
identifiers, usage state, and audit evidence. Boundaries exist between the
browser, OperatorOS SSO, public Twilio callbacks, the durable worker, and
PostgreSQL.

## Principal threats and controls

| Threat | Control |
| --- | --- |
| Stolen or replayed SSO handoff | Exact callback, opaque short-lived single-use code, state, nonce, PKCE S256 and host-only module session |
| Cross-tenant or IDOR access | Session-derived user/tenant, tenant predicates, ownership checks and masked 404 responses |
| SMS/voice webhook forgery | Twilio signature on canonical URL and original parameters, receiving-number allowlist, unique provider IDs and fail-closed handling |
| Duplicate or concurrent delivery | Tenant idempotency keys, unique provider identifiers, transactional state transitions and worker leases |
| Toll fraud or arbitrary calling | Verified destinations only, approved caller identities, rate/concurrency/spend controls and provider circuit breaker |
| Trigger or phone disclosure | Encryption and one-way lookup where applicable, masking, least privilege and no secret/full-number logs |
| Unsafe impersonation or emergency use | Content policy forbids emergency/government impersonation and makes the non-911 boundary explicit |
| Recording/privacy violation | No recording by default; consent, jurisdiction, retention and deletion approval required before enablement |
| Provider outage | Durable queue, bounded retries, lease recovery, health reporting and explicit failed-delivery status |
| Billing bypass | OperatorOS entitlement authority, append-only usage events, atomic reservations and reconciliation |

## Safety invariants and residual risk

OutCall never calls an unverified arbitrary destination, spoofs caller ID,
records by default, contacts emergency services automatically, or represents
provider failure as successful assistance. Live Twilio Verify, callbacks,
DTMF, spend/country controls, rate behavior, and real-number acceptance remain
deployment gates. The fuller design history remains in
`docs/outcall/THREAT_MODEL.md`.
