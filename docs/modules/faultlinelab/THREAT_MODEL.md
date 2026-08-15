# FaultlineLab threat model

## Phase 39 platform-hardening overlay (2026-08-14)

Author approval, training-case redaction, immutable evidence/version history,
tenant/public visibility separation, and cross-module opt-in provenance are
release-gated by the platform threat model and [Phase 39 register](../../phase-39/THREAT-MODEL-REGISTER.md).

Assessment date: 2026-07-27

## Protected assets and boundaries

Protected assets include private and tenant challenge drafts, evidence,
diagnostic sessions, submitted commands, scoring state, author identity, and
audit events. The browser uses an OperatorOS module session; the API resolves
tenant, role, and entitlement before reaching FaultlineLab tables.

## Principal threats and controls

| Threat | Control |
| --- | --- |
| Cross-tenant challenge or session access | Trusted session tenant, tenant predicates on every lookup/update and masked foreign-resource responses |
| Unauthorized publishing or authoring | Server-side read/write/manage gates; viewers cannot publish, edit, or administer content |
| Arbitrary command execution | Diagnostic commands are compared with bounded challenge data; they are never passed to a shell or remote endpoint |
| Hidden-evidence or answer leakage | Role-appropriate response projections and server-controlled reveal transitions |
| Score or completion manipulation | Server computes transitions and score from persisted state; client-supplied totals are ignored |
| Stored XSS in challenges/evidence | Bounded validated text and no raw HTML rendering |
| Duplicate submissions or race conditions | Tenant/session predicates, transactions, uniqueness constraints and idempotent completion behavior |
| AI/provider prompt leakage | Shared server-only provider boundary, bounded prompts, safe errors and no prompt/secret logging |
| Malicious imported challenge data | Dry-run mapping, source fingerprints, validation and no child migrations/runtime execution |

## Residual risks

Challenge authors can still create misleading training material, so publishing
requires authorized human review. Adding real shell, endpoint, vehicle, or
network execution would be a new high-risk trust boundary and is prohibited
until separately designed, sandboxed, authorized, and audited.
