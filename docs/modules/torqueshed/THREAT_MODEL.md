# TorqueShed privacy and threat model

Assessment date: 2026-07-18

## Protected assets and boundaries

Protected data includes vehicle ownership, VIN-derived identity, mileage,
service/repair costs, vendors, private build work, diagnostic concerns,
freeze-frame values, hypotheses, confirmed causes, repairs, verification,
files, AI context/results, purchase intents, append-only token entries, provider
usage, and audit history. OperatorOS owns authenticated identity, trusted
tenant, module access, roles, entitlements, package prices, Stripe checkout,
signed payment events, provider configuration, shared files, and audit.

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
| Browser chooses AI provider, tenant, or diagnostic context | Server reloads trusted session/tenant/module/diagnostic context; no client provider key or tenant authority |
| AI presented as authoritative diagnosis | Strict structured facts versus assumptions, only low/medium hypotheses, mandatory disclaimer, test-first output, and unsafe-certainty rejection |
| High-risk automotive guidance causes injury or damage | Mandatory brake/steering/fuel-fire/high-voltage/SRS/lifting escalation plus test stop conditions and qualified-technician referral |
| Prompt injection or oversized diagnostic narrative | Structured server-authored prompt, 48,000-character cap, strict JSON output schema, no tool execution, and validation before persistence/debit |
| Provider outage creates duplicate charges | Shared idempotency lease, at most two provider attempts, tenant circuit, safe retry with same key, and debit only in final accepted transaction |
| Prompt/provider error leaks sensitive data | No full-prompt column or prompt logging; stored context hash/count/size and bounded safe error codes only |
| Client forges price, credit, or successful checkout | Server-owned packages and return URLs; signed raw-body webhook; stored purchase binding; amount/currency and test/live validation |
| Webhook replay creates duplicate credit/refund | Shared webhook receipts plus unique external event/idempotency references and cumulative append-only refund reversals |
| Concurrent usage overspends a balance | Balance derived from append-only entries and rechecked under tenant/user/module advisory lock before exact debit |
| Ledger tampering hides accounting history | Database trigger rejects update/delete; corrections are new reversal/adjustment entries; manager reconciliation flags mismatches |
| Repudiation or destructive loss | Activity event per mutation, archives instead of hard delete, additive release, verified backup/restore cutover |

## Residual risks

- VIN fingerprints may still be sensitive linkage data and require normal
  database access, retention, incident response, and backup controls.
- User-entered diagnostic narrative can contain personal/customer data;
  policy and retention review remain required before public publishing.
- `public_build` does not itself make a safe publication. A future public
  projection, moderation, takedown, consent, and indexing policy is required.
- Automotive diagnostic records and Torque Assist support human decisions and
  are not a repair authorization or safety certification.
- The database-backed provider/payment/refund/concurrency/append-only suite is
  implemented but unrun while Docker is unavailable; source controls alone do
  not prove their runtime enforcement.
- A signed refund after credits were consumed can produce a truthful negative
  balance. Reconciliation flags it and later usage is denied; an operational
  collections/correction policy is still required before launch.
