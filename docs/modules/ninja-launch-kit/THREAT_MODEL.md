# Ninja Launch Kit threat model

## Phase 39 platform-hardening overlay (2026-08-14)

Entitlement-safe template/brief projection, locked-content non-disclosure,
generation idempotency, export limits and hashes, soft-delete recovery, and
BrandForgeOS prefill provenance are release-gated by the platform threat model
and [Phase 39 register](../../phase-39/THREAT-MODEL-REGISTER.md).

Assessment date: 2026-07-27

## Protected assets and boundaries

Protected assets are tenant launch plans, phases, milestones, tasks, artifacts,
exports, AI-generation inputs/results, usage events, and audit records. The
shared OperatorOS host session and entitlement gate are authoritative; AI
providers are server-side dependencies and never receive platform secrets.

## Principal threats and controls

| Threat | Control |
| --- | --- |
| Cross-tenant launch access | Session-derived tenant, tenant-scoped reloads and mutations, composite relationships and masked 404 responses |
| Unauthorized plan mutation | Server-side module write/manage gates; UI hiding does not grant authority |
| Dependency or ordering corruption | Same-launch tenant checks, validated phase/milestone links and transactional position changes |
| Duplicate AI charges/results | Tenant-scoped idempotency key, input digest, transactionally persisted result and shared usage event |
| Prompt injection or fabricated business claims | Fixed provider instructions, bounded allowlisted inputs, structured response validation and explicit prohibition on invented reach, conversion, approval or publication |
| Provider key or prompt leakage | Provider keys remain server-side; logs store safe metadata rather than prompt/result bodies or credentials |
| Export leakage or formula injection | Tenant-scoped export source, bounded formats, escaped cells and no authority/provider secrets |
| Stored XSS in artifacts | Bounded text and safe rendering; no generated script or markup execution |
| Fake execution status | Persisted tasks and artifacts are distinct from external publication; the UI cannot claim provider action without evidence |

## Residual risks

Generated plans require human review and do not prove legal compliance,
publication, delivery, or campaign performance. Any future remote publishing
integration requires explicit destination allowlists, OAuth scope review,
webhook verification, idempotency, and a revised threat model.
