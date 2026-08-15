# TradeFlowKit threat model

## Phase 39 platform-hardening overlay (2026-08-14)

Tenant-shared business records, server-derived money and invoice invariants,
public-intake abuse controls, Stripe authority, export/import idempotency, and
SnapProof attachment/provenance reconciliation are governed by the platform
threat model and [Phase 39 register](../../phase-39/THREAT-MODEL-REGISTER.md).

Assessment date: 2026-07-27

## Protected assets and boundaries

Protected assets are tenant customers, contacts, leads, jobs, tasks, quotes,
invoices, payment records, public-document capabilities, attachments, and
audit history. Requests cross the registered TradeFlowKit host into the shared
OperatorOS session and then into tenant-scoped PostgreSQL tables. Platform
billing remains separate from TradeFlowKit business-payment records.

## Principal threats and controls

| Threat | Control |
| --- | --- |
| Cross-tenant customer or job access | Session-derived tenant, repeated tenant predicates, tenant-aware foreign keys and masked 404 responses |
| Viewer mutation or status escalation | Server-side module permission checks on every write; UI controls are only presentation |
| Quote/invoice relationship corruption | Tenant-scoped parent reloads, validation, constraints, transactions and optimistic versions where mutable |
| Public document enumeration | High-entropy bounded capability identifiers, exact public route shape, no sequential IDs or tenant metadata leakage |
| Payment replay or platform-billing confusion | Idempotent business-payment recording; OperatorOS alone owns subscriptions and entitlements |
| Stored XSS in customer or line-item text | Bounded text, server validation, React text rendering and no raw HTML execution |
| Unsafe attachments | Shared private upload validation, scan state, randomized storage key and authorized download |
| Fake revenue dashboards | Totals derive from persisted tenant rows; mock counters and simulated payments are prohibited |
| Bulk export leakage | Export queries retain the trusted tenant predicate and omit secrets/internal authority data |
| Concurrent duplicate work | Unique constraints, idempotency keys where retries are expected, and transactional multi-row transitions |

## Residual risks

Public document links are bearer capabilities and must be rotated if disclosed.
Live payment-provider settlement is not inferred from a local business-payment
record. Deployment-host SSO, browser acceptance, load baselines, and restore
evidence remain release gates rather than assumptions.
