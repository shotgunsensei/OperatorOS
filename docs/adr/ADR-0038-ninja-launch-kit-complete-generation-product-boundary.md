# ADR-0038: Ninja Launch Kit complete generation product boundary

Status: accepted for Phase 34 source/local implementation, 2026-08-12.

Supersedes ADR-0024 where that decision narrowed the product to launch
execution, reviewed artifacts, and evidence-based readiness. ADR-0024's
OperatorOS authority, reviewed-output, readiness, and BrandForgeOS separation
remain in force.

## Context

The pinned Ninja Launch Kit source at
`30bd1abc05846926e97bc7b26c5b7d6625e8f161` contains a complete persisted
launch-generation SaaS beyond the Phase 11D execution slice: 20 niche
templates, nine visual-promo creative briefs, business briefs, generated
campaign packages, reusable brand profiles, plan gates, export history, public
marketing/legal routes, and product administration. A safe OperatorOS
implementation can preserve these user outcomes, so their earlier security or
product-boundary retirement cannot count as parity.

## Decision

Ninja Launch Kit owns user-scoped launch kits and brand profiles within an
OperatorOS tenant. A short business brief produces persisted landing copy,
offer stacks, paid-ad copy, Google ads, email and SMS sequences, social posts,
FAQ, calls to action, QR/flyer copy, and a launch checklist. Kits support
preview, create, edit, duplicate, regenerate, archive, restore, soft-delete
undo, immutable revisions, and source-compatible record routes.

The 20-template catalog and nine visual-promo definitions are compiled from
the pinned read-only source. CI fails if either source count changes or the
generated catalog is stale. Template metadata remains visible for discovery,
but a locked template's builder prefill is not returned. Each visual brief
contains source dimensions, tools, a deterministic composition, accessible
palette, and production instructions. A locked visual brief returns no brief
body; entitled briefs cannot be blank.

Free, Pro, and Agency-equivalent limits are projected from OperatorOS module
features or active tenant entitlements. The source contract remains: Free gets
two kits per month, zero brand profiles, TXT-only watermarked exports, and the
Facebook visual brief; Pro gets unlimited kits, five brands, TXT/Markdown/JSON,
all briefs, AI refinement, and no watermark; Agency adds unlimited brands and
white-label/client delivery. Conditional counter updates enforce monthly and
brand caps before generation or persistence.

Generation is deterministic by default and is always available. Pro and
Agency auto mode may request the shared OperatorOS AI provider. AI output must
match the complete nonempty artifact schema; invalid, unavailable, or failed
provider output uses the deterministic fallback and records exact provenance.
Prompts exclude secrets and do not assert performance, publication, approval,
or provider actions. Usage is recorded through OperatorOS's shared meter and
idempotency boundary.

TXT, Markdown, and JSON export bytes are generated from the persisted kit and
unlocked briefs, stored with MIME type, filename, byte length, checksum,
watermark state, white-label state, and an idempotency key. Replay returns the
original business export row and exact bytes.

OperatorOS remains the only authority for identity, sessions, tenants,
memberships, roles, module access, subscription billing, credits,
entitlements, AI-provider configuration, audit/activity, platform
administration, and exact-host SSO. The source child authentication, Stripe,
local plan field, provider secrets, and independent admin authority are not
activated. BrandForgeOS continues to own reusable cross-campaign brand and
marketing operations; the Ninja Launch Kit brand profile is a bounded launch
rendering input and does not replace BrandForgeOS.

## Consequences

- Tenant guards and user ownership prevent cross-tenant and same-tenant
  cross-user enumeration of briefs, kits, brands, revisions, and exports.
- Public landing, pricing, contact, terms, and privacy pages are available on
  the exact module host; login and signup route into canonical OperatorOS SSO.
- Existing launch execution, review, tasks, readiness, assets, and audited
  release proof remain available beside the restored generation product.
- The dark graphite/crimson tactical identity is scoped to Ninja Launch Kit
  and includes responsive desktop/tablet/mobile controls and honest empty,
  loading, error, locked, and unavailable states.
- Additive database release v43 is required before Phase 34 runtime promotion.

## Data and security impact

Product tables store tenant/user identifiers, business briefs, generated
campaign content, visual instructions, brand colors/voice, revisions, export
bytes, hashes, and counters. They do not store passwords, provider secrets,
payment credentials, Stripe authority, or raw entitlement overrides. Composite
tenant foreign keys protect related records. Approved/exported history is
retained independently of current mutable kit state.

## Migration and rollback

The imported application remains read-only evidence. Any production source
data migration requires an authorized frozen export, explicit OperatorOS
tenant/user mapping, content hashes, row reconciliation, a target backup, and
a separate apply decision. Release v43 is additive and idempotent with no
destructive down migration. Rollback restores into a new database and switches
traffic to the reviewed prior release.

## Release gates

Source/local completion does not authorize deployment. The owner must freeze
the exact commit/build, back up and apply cumulative release v43, verify live
shared-provider and entitlement behavior, run exact-host SSO/logout and the
complete Free/Pro/Agency launch journeys, validate exported bytes and
checksums, prove desktop/tablet/mobile accessibility and restart persistence,
rehearse backup/restore, and record the rollback decision before state 5.
