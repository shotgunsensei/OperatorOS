# TorqueShed privacy and threat model

Assessment date: 2026-07-18

## Protected assets and boundaries

Protected data includes vehicle ownership, VIN-derived identity, mileage,
service/repair costs, vendors, private build work, diagnostic concerns,
freeze-frame values, hypotheses, confirmed causes, repairs, verification,
files, and audit history. OperatorOS owns authenticated identity, trusted
tenant, module access, roles, entitlements, billing, shared files, and audit.

| Threat | Control |
| --- | --- |
| Full VIN disclosure or public enumeration | Plaintext VIN never stored; validated fingerprint plus masked suffix; no VIN search/public endpoint |
| Public build leaks private maintenance/diagnostics | `public_build` is eligibility only; no anonymous Phase 7 projection; ADR requires an allowlist excluding costs/files/diagnostics |
| Cross-tenant access through guessed IDs | Trusted tenant predicate on every query; composite tenant foreign keys/indexes; foreign resources return 404 |
| Team user mutates another owner's private/published record | Server owner-or-manager write checks; module viewer denial; UI is not authorization |
| Lost updates or concurrent diagnostic corruption | Optimistic versions, affected-row conflict, explicit state transition graph, idempotency keys |
| Decimal/ambiguous money | Integer minor-unit columns and validation; dry-run cost reconciliation |
| Unsafe diagnostic document | Shared size/MIME/signature/hash/scan/private-storage controls; object ownership checked before create/list |
| Untrusted standalone auth/billing/migration runs | Source remains outside workspace and unmounted; authority arrays excluded; root release manifest only |
| AI presented as authoritative diagnosis | No Torque Assist route or result in Phase 7; Phase 8 requires its own safety/provider/ledger ADR |
| Repudiation or destructive loss | Activity event per mutation, archives instead of hard delete, additive release, verified backup/restore cutover |

## Residual risks

- VIN fingerprints may still be sensitive linkage data and require normal
  database access, retention, incident response, and backup controls.
- User-entered diagnostic narrative can contain personal/customer data;
  policy and retention review remain required before public publishing.
- `public_build` does not itself make a safe publication. A future public
  projection, moderation, takedown, consent, and indexing policy is required.
- Automotive diagnostic records support human decisions and are not a safety
  certification. Torque Assist remains unavailable until Phase 8 evidence.
