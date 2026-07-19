# ADR-0011: Approved TradeFlowKit scope and legacy feature disposition

- Status: Accepted
- Date: 2026-07-18
- Scope: TradeFlowKit standalone-to-OperatorOS consolidation

## Context

The standalone repository combines field-service workflows with duplicate
identity, organizations, memberships, 2FA, subscription checkout, add-on
billing, Stripe Connect onboarding, Call Recovery, AI lead scoring, public
capture forms, review requests, reminder automation, vendor-specific exports,
and permanent trash purge. Activating the server wholesale would violate the
OperatorOS authority and shared-service contracts.

## Decision

The approved OperatorOS TradeFlowKit product is lead-to-cash field operations:
manual lead intake and conversion, shared-directory customers/contacts/sites,
jobs and tasks, quotes and controlled public decisions, invoices, manual
customer-payment records, secure customer documents/portal, notes, tags,
attachments, shared notifications, persisted analytics, business defaults,
canonical CSV export, and repeatable standalone-export dry-run planning.

The following standalone surfaces are intentionally excluded:

1. Local users, passwords, recovery codes, sessions, 2FA, organizations,
   memberships, invitations, platform roles, subscriptions, plan checkout,
   entitlements, and processed platform Stripe events. OperatorOS owns them.
2. Call Recovery subscription/AI conversation features. They overlap the
   CallCommand product boundary and require its later consent/provider ADR.
3. Standalone Stripe Connect OAuth and direct invoice checkout creation.
   Production customer payment processing remains disabled until an approved
   centralized tenant provider-account adapter and verified webhook contract
   exist. A deterministic adapter is available only in `NODE_ENV=test`.
4. AI lead scoring/qualification. It is not needed for deterministic
   lead-to-cash operation and may not silently make customer decisions.
5. Public unauthenticated lead-capture adapters and capture-form management.
   Manual/operator intake is approved; public intake requires a later
   abuse-rate-limit, consent, privacy, and retention review.
6. Autonomous recurring-job/invoice generators and legacy reminder cron
   loops. Durable scheduling must use shared leased jobs and needs explicit
   recurrence/timezone/cancellation semantics before activation.
7. Permanent trash purge and bulk destructive routes. OperatorOS archive and
   retention controls remain authoritative.
8. Vendor-specific QuickBooks IIF and Xero schemas. Tenant-scoped canonical
   customer/invoice/payment CSV exports are supported; vendor mappings need a
   versioned integration contract before becoming release promises.
9. A dedicated review-request table. Approved outbound review/reminder
   communication uses the shared notification/outbox service and audit trail.

## Consequences

The imported server remains quarantined evidence. Intentional exclusions do
not appear as inactive buttons or mock dashboards. Provider configuration is
reported honestly; test-provider success is not production delivery evidence.
Future approval of any excluded item requires a superseding ADR or a scoped
decision that preserves OperatorOS authority.

## Data and security impact

No standalone password, session, membership, subscription, or customer secret
enters the migration plan. Public document access stores only SHA-256 token
hashes and returns raw opaque tokens once. Public responses are non-cacheable
and expose bounded customer-facing projections. Money uses integer cents and
payment/conversion retries are idempotent.

## Migration and rollback

The dry-run importer inventories excluded authority separately, fingerprints
source records, preserves source IDs in mapping plans, validates references,
and reconciles quote/invoice/paid totals. Apply remains a separately approved
cutover action. Database rollback is restore-to-new-database and traffic
switch; standalone writes stay enabled until the cutover checklist is
explicitly authorized.
