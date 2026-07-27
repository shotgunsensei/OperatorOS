# CallCommand AI threat model

Assessment date: 2026-07-27

## Protected assets and boundaries

Protected assets include verified phone ownership, consent and suppression
evidence, call profiles, encrypted phone data, provider identifiers, usage,
recording state, and audit history. Trust boundaries exist between the browser,
OperatorOS, Twilio callbacks, the shared worker, and PostgreSQL.

## Principal threats and controls

| Threat | Control |
| --- | --- |
| Toll fraud or arbitrary destinations | Verified destinations, approved purposes, suppression checks, bounded rate/concurrency and fail-closed provider configuration |
| Missing or expired consent | Tenant-scoped consent record and purpose/date validation before call creation |
| Webhook forgery or replay | Twilio signature over canonical URL/form values, provider identifier uniqueness and idempotent state transitions |
| Cross-tenant call access | Session-derived tenant, tenant predicates and non-enumerating foreign-resource responses |
| Duplicate calls | Tenant/idempotency uniqueness, unique provider call SID and transactional state changes |
| Recording/privacy violation | Recording defaults off and API validation rejects enablement until jurisdiction-specific policy is approved |
| Phone or transcript disclosure | Encrypted/masked phone handling, no raw provider payload/recording URL import, redacted structured logs |
| Role escalation | Server-side module permission and tenant administration checks |
| Provider outage or retry storm | Durable bounded worker, leases, retry classification, dead-letter visibility and safe failure state |

## Residual risks

Live calling, carrier behavior, country/premium restrictions, provider spend
limits, callback routing, and consent language require target-environment
acceptance. Recording and transcription remain disabled. They must not be
enabled by configuration alone without privacy, retention, jurisdiction, and
deletion controls plus a new review.
