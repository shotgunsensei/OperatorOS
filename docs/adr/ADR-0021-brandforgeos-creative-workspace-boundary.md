# ADR-0021: BrandForgeOS creative-workspace boundary

Status: Accepted for Phase 11A source/local implementation  
Date: 2026-07-23

## Context

The pinned BrandForgeOS source at
`5e78bc2ee6c8086ddd589bb7416f1d4560ffbb4e` contains real PostgreSQL CRUD for
brands, personas, campaigns, copy assets, and calendar items plus OpenAI-backed
copy/strategy/idea generation. It also duplicates Replit OIDC, tenants,
memberships, plans, billing, feature flags, usage balances, and platform
administration. Several advertised surfaces are not trustworthy product
workflows: analytics and integration-sync counters use `Math.random`, and the
template marketplace mixes content with child pricing.

## Decision

Phase 11A promotes the durable creative-workspace boundary:

- tenant-owned brand kits and audience personas;
- campaigns with explicit lifecycle, channels, dates, budget in integer minor
  units, and optimistic versioning;
- copy assets linked to a tenant-valid brand/campaign, with draft/review/
  approved/published/archived lifecycle;
- content-calendar entries linked to tenant-valid records;
- real dashboards and CSV/JSON exports derived only from persisted records;
- server-side AI copy, strategy, and campaign-idea generation through the
  OperatorOS provider adapter, with bounded structured output, idempotency,
  append-only generation records, and shared usage accounting.

OperatorOS remains the only identity, session, tenant, membership, role,
entitlement, subscription, add-on billing, provider configuration, usage, and
platform-audit authority. Module sessions derive tenant/user/module scope from
the validated server session. BrandForgeOS never accepts a browser tenant ID.

Source onboarding is represented by BrandForgeOS workspace settings and may
not rename or mutate the OperatorOS tenant. Source members/settings link to the
shared ecosystem header and OperatorOS administration rather than duplicate
member or plan controls.

## Excluded or disabled

- Replit OIDC, mobile bearer sessions, child login/logout, tenant creation,
  memberships, billing, plan changes, credits, feature flags, and child admin;
- random/sample analytics, fake content scores, fake integration connection or
  sync, and static counters;
- template-marketplace pricing/purchases and any child checkout;
- background exports whose files are not actually generated;
- arbitrary remote logo URLs, unscanned uploads, autonomous publication, and
  provider credentials stored in module rows.

Excluded destinations must fail closed or be clearly described as unavailable;
they may not render placeholder dashboards or inactive primary actions.

## Consequences

All BrandForgeOS tables use OperatorOS tenant/user foreign keys, scoped unique
constraints and indexes, audit fields, soft deletion where user-authored
records can be retired, and transactions for dependent writes. Foreign or
deleted resources return the same 404. Viewers are read-only. AI generation
fails safely when the provider is disabled and never consumes usage before a
successful, validated result is committed.

The source is migration evidence only. Its server, migrations, auth, billing,
and provider integrations are not executed. State 5 still requires deployment,
deployed SSO/return/logout/health/browser acceptance, and an authorized frozen
data reconciliation/cutover.

## Rollback

The release is additive. Rollback freezes writes and restores the verified
pre-release database into a new target according to
`docs/DATABASE_BACKUP_RESTORE.md`; no destructive down migration is provided.
