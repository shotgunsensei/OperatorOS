# ADR-0035: BrandForgeOS complete product and parent-authority boundary

- Status: Accepted for source/local Phase 31
- Date: 2026-08-11
- Source: `5e78bc2ee6c8086ddd589bb7416f1d4560ffbb4e`

## Context

Phase 11A retained a safe reduced BrandForgeOS workspace and retired templates,
integrations, asynchronous reports/exports, child credits, and platform-admin
outcomes. Phase 31 requires every source outcome to receive a fresh decision;
security and product boundaries may change implementation authority but may not
erase the user's marketing workflow.

## Decision

Restore BrandForgeOS-owned marketing work product natively: brands, personas,
offers, campaigns, tasks, comments, copy, landing content, calendar, metrics,
guided workflows, templates, recommendations, leads, reports, export state, and
product-specific integration projections.

Keep these authorities in OperatorOS and expose shared equivalents inside
BrandForgeOS:

- identity, sessions, tenants, memberships, roles, module access, and audit;
- plans, billing, add-ons, entitlements, feature flags, and credit limits;
- provider credential references, OAuth/webhook readiness, and connector health;
- AI provider selection, safe unavailable/test behavior, usage, and redacted logs;
- background execution, retries/dead letters, notifications, and activity;
- platform-admin tenant mutation and integration-health control.

Premium templates are visible but usable only when the tenant has the required
OperatorOS entitlement. Integrations store no raw credential. A live secret
reference without callback and adapter health is not ready. Reports and
recommendations derive only from persisted records. Monthly generation credits
are reserved atomically, released on provider failure, and not charged again on
idempotent replay.

## Consequences

- There is one billing, identity, tenant, provider-secret, and platform-admin
  authority across the ecosystem.
- Phase 11A retirements are superseded by active native or shared-equivalent
  outcomes; no retired label counts as parity.
- Additive release v40 may be rehearsed locally, but production promotion,
  source-data apply, live providers, exact-host acceptance, backup/restore,
  rollback, and cutover remain explicit owner gates.
