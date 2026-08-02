# ADR-0031: TradeFlowKit restores bounded record imports and closes deterministic-scope gaps

- Status: Accepted
- Date: 2026-08-02
- Scope: TradeFlowKit Phase 16 record imports, scheduling, standalone tasks, and legacy provider ownership

## Context

The restored standalone TradeFlowKit source includes CSV job and invoice
imports, organization automations, reminder history, recurring-job series,
standalone task creation, and direct SendGrid, Twilio, and OpenAI references.
The canonical OperatorOS runtime already defines jobs as tenant customer work,
tasks as children of jobs, outbound communication as a shared outbox/provider
service, and TradeFlowKit as a deterministic lead-to-cash workflow.

Leaving all of these source references as undifferentiated gaps obscures two
different outcomes: record imports provide immediate customer value and can be
restored safely, while autonomous scheduling, orphan tasks, and module-owned
providers conflict with accepted platform and product boundaries.

## Decision

1. TradeFlowKit exposes authenticated job and invoice CSV imports through
   browser-parsed JSON. Each import is limited to 100 rows and 256 KB at the
   UI boundary, requires module write access and a valid `Idempotency-Key`,
   serializes per tenant, and uses shared replay/body-drift protection.
2. Job import resolves a unique active tenant customer by normalized name,
   validates status, priority, and schedule order, allocates canonical job
   numbers, suppresses deterministic duplicate sources, and records bounded
   activity metadata.
3. Invoice import groups repeated `invoiceRef` rows into at most 50 normalized
   line items, converts decimal input to exact integer cents/basis points,
   validates discounts and totals, allocates canonical invoice numbers, and
   suppresses duplicate references. Imported status is limited to `draft`,
   `sent`, or `void`; `paid` is rejected because payment state requires a
   first-class payment-ledger record.
4. Legacy autonomous automations, reminder loops, recurring-job generation,
   and their module-local persistence are excluded from TradeFlowKit. A later
   need requires a new ADR over OperatorOS shared leased-job semantics,
   timezone ownership, retry, cancellation, and operational monitoring.
5. Standalone tasks remain excluded. Canonical TradeFlowKit tasks require a
   tenant-owned active job under ADR-0010 and ADR-0028.
6. Module-owned SendGrid and Twilio clients are replaced by the OperatorOS
   shared provider adapters and replay-safe outbox. Legacy unreviewed lead AI
   behavior is excluded; provider-backed features must remain server-owned and
   operator-reviewed.
7. Anonymous lead intake and production business-payment activation are not
   decided here and remain explicit fail-closed gaps.

## Consequences

- Paying operators can migrate bounded job and invoice batches without
  restoring standalone identity, billing, provider, or scheduling authority.
- Fresh keys cannot duplicate an already imported job fingerprint or invoice
  reference, while exact same-key retries return the original safe result.
- Invoice imports cannot manufacture paid revenue without payment evidence.
- The Phase 16 ledger may classify the two import routes active, shared
  provider references as shared replacements, and the accepted deterministic
  exclusions as product-boundary retirements.

## Data, security, and privacy

All lookups and writes use the trusted server tenant. Foreign customers are
not enumerated. Import responses and shared idempotency records contain only
counts, row diagnostics, skip reasons, and created IDs. Batch activity does
not copy customer names, notes, line descriptions, or invoice references.
Source identifiers are SHA-256 fingerprints. Existing tenant/source unique
indexes, number sequences, foreign keys, document checks, and activity rows
remain authoritative.

## Migration and rollback

No schema migration is required; the canonical job, invoice, normalized line,
sequence, activity, and shared idempotency tables already provide the needed
constraints. Application rollback removes the routes and UI while retaining
valid imported records and their audit evidence. Production data import still
requires backup, reconciliation, reviewed samples, and explicit cutover
approval; this ADR does not authorize a production import.

## Superseded records

ADR-0028's temporary classification of standalone tasks and scheduling as
unresolved Phase 16 gaps is superseded. Its job-scoped task and no-executable-
automation decisions remain in force. No other accepted ADR is superseded.
