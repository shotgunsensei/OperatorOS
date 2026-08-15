# Phase 39 threat-model register

Assessment date: 2026-08-14
Authority: [OperatorOS platform threat model](../security/OPERATOROS_PLATFORM_THREAT_MODEL.md)

This register binds every commercial module to its principal Phase 39 trust
boundary and executable evidence. It supplements, rather than replaces, each
module-owned threat model.

| Module | Principal Phase 39 boundary | Required control/evidence |
| --- | --- | --- |
| BrandForgeOS | AI/provider input, credits, reports and Launch Kit workflow | schema validation, metering/idempotency, secret references, tenant/destination entitlement and export hash tests |
| CallCommand AI | signed telephony ingress, recordings and automation dispatch | Twilio signature/replay/consent fixtures, bounded uploads, provider-honest transfer and cross-module destination denial |
| FaultlineLab | authored/private evidence becoming training content | opt-in, redaction-before-event, author approval, immutable version/provenance tests |
| Ninja Launch Kit | premium template/brief content and exports | server entitlement checks, locked-content non-disclosure, deterministic generation and artifact validation |
| Ninja Pool Hall | realtime room and host-authoritative simulation | membership, sequence/idempotency, impossible-shot, reconnect and frame/latency budgets |
| Ninjamation | untrusted imported/generated scripts | checksums/static analysis, no API-process execution, disabled production runner fallback and explicit isolated-gateway gate |
| OutCall | identity-linked phone verification and provider state | disabled until source/provider proof; encryption/HMAC, signature/replay, country/rate, DST and cancellation-race tests |
| PulseDesk | healthcare-adjacent operations and inbound email | PHI-minimizing telemetry, tenant alias/authenticity/idempotency, OAuth state, attachment quarantine and public abuse controls |
| SnapProofOS | field evidence, financial totals and public report shares | content/MIME/size scan, signed objects, immutable approved snapshot, hashed expiring/revocable share and rate tests |
| StudyForge AI | generated learning records, credits and tutor visibility | transactional generation/cleanup, validated provider output, deterministic provenance, atomic limits and learner/tutor negatives |
| TechDeck | MSP inventory/evidence, public validation and script references | tenant predicates, scoped token/revocation, HMAC/SSRF webhooks, deterministic export and no-host-execution gate |
| TorqueShed | private garage/native data versus community and marketplace | visibility projection, realtime membership, media scan, native secure token/replay, moderation and public/share rate tests |
| TradeFlowKit | shared business/money records and public intake | tenant/team guards, server money invariants, Stripe authority, replay-safe import/intake and SnapProof provenance tests |

## Platform boundaries added or refreshed

- Browser responses use a restrictive CSP, HSTS, COOP/CORP, framing/object and
  form/base restrictions. Next.js bootstrap compatibility currently requires
  inline script/style allowance; server validation/sanitization remains the
  primary XSS control while nonce migration is performance-tested.
- Production preflight requires `RUNNER_MODE=disabled`. Missing configuration
  cannot select local execution, and control endpoints return
  `RUNNER_GATEWAY_DISABLED` until an isolated, signed runner plane is approved.
- `/readyz` requires database access, a fresh successful worker heartbeat,
  non-stalled ready queues, release identity, SSO encryption and healthy live
  provider configuration. Health alone never authorizes traffic.
- Dependency exceptions are exact-GHSA and patch-bound. Malicious ICNS/JXL
  fixtures must pass before the audit exception is valid.
- Cross-module records remain destination-owned. Signed/idempotent events,
  tenant-bound references, hop limits, dead-letter repair and provenance links
  prevent synchronous distributed transactions and replay side effects.

## Review triggers

Any module-local login/billing authority, wildcard origin, parent-domain
cookie, raw secret storage, new public token, unbounded upload/list/export,
arbitrary URL fetch, unsigned provider callback, API-process execution, or
cross-tenant reference invalidates this register and blocks release.
