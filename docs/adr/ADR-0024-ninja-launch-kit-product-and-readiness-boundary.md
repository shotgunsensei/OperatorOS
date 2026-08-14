# ADR-0024: Ninja Launch Kit product and readiness boundary

Status: accepted for Phase 11D source/local implementation, 2026-07-27.

## Context

The active OperatorOS surface currently exposes Ninja Launch Kit as a generic
code-scaffold generator. The commit-pinned standalone source at
`apps/modules/ninja-launch-kit/source` instead models a marketing launch kit:
one business brief produces landing-page copy, ads, email/SMS, social content,
FAQ, QR/flyer copy, a launch checklist, visual directions, brand profiles,
templates and exports. The scaffold surface is unfinished, has no worker that
can complete its queued jobs and is not product-aligned with the source.

The standalone source also contains child identity, sessions, administration,
plan/billing authority, anonymous/demo access and a legacy URL-token SSO flow.
Those surfaces conflict with OperatorOS authority and cannot be activated.
BrandForgeOS already owns reusable brand systems, personas, ongoing campaigns,
content calendars and campaign metrics, so Ninja Launch Kit must not become a
second general-purpose brand platform.

## Decision

Ninja Launch Kit is a tenant-scoped, time-bounded launch-execution workspace
for a product, service, venture, event or campaign release. It owns:

- the launch brief: audience, problem, positioning, offer, price, channels,
  tone, launch-specific colors and target date;
- plans, ordered phases, milestones, checklist tasks, owners, dependencies,
  due dates and completion state;
- persisted launch artifacts such as landing copy, ads, email/SMS, social
  content, FAQ, QR/flyer copy, launch checklists and visual creative briefs;
- launch-specific source assets, review/approval state, exports, generation
  provenance and a persisted activity trail; and
- a server-computed readiness result derived only from required brief fields,
  required task completion, required artifact approval and unresolved blockers.

Generated content is always persisted as editable `draft` content. It may move
to `review` and then `approved` only through server-enforced transitions.
Generated or manual artifacts count toward readiness only when approved. A
launch may move to `launched` only at 100 percent readiness. Readiness responses
must include their numerator, denominator and rule-level evidence; no random,
static or client-supplied score is permitted.

BrandForgeOS remains the authority for reusable brand identities, personas,
ongoing campaign planning, content calendars and performance metrics. Ninja
Launch Kit may retain a launch-specific brand snapshot or bounded reference,
but it does not modify BrandForgeOS records or claim ongoing campaign
authority.

OperatorOS remains the exclusive authority for identity, credentials,
sessions, tenants, memberships, platform roles, subscription billing,
entitlements, module launch, AI provider configuration, shared usage,
attachments, idempotency and platform audit. Ninja Launch Kit does not expose
login, signup, password reset, account-plan mutation, Stripe, module
administration, anonymous/demo access or a module-local SSO implementation.

AI generation uses the shared OperatorOS AI provider. A deterministic provider
is available only in test environments. Outside test, generation fails closed
when no approved provider is configured. Manual authoring, templates, planning,
review and export remain real persisted workflows without AI.

## Data and security consequences

- Every row and relationship carries the trusted server-session tenant ID.
  Composite tenant foreign keys prevent cross-tenant references.
- Client tenant values never grant authority. Owner assignments must reference
  an active membership in the current tenant.
- Module reads and writes require the OperatorOS entitlement and server-side
  module permission guards. UI visibility is never authorization.
- Task dependencies are same-tenant and same-launch, reject self-dependencies
  and cycles, and cannot be completed while an incomplete dependency remains.
- Optimistic versions protect mutable launch, plan, task and artifact records.
- Assets use private shared attachments with signature/MIME validation,
  scanning, hashes and authorized content retrieval. No public raw file URL is
  introduced.
- AI calls use shared idempotency and append-only usage/activity records.
  Prompts, artifact bodies, credentials and provider secrets are excluded from
  logs and audit metadata.
- Exports are produced from authorized persisted records, include a checksum
  and create an export/audit record. They do not contain attachment bytes.
- Soft deletion applies to mutable business records. Platform-authorized tenant
  deletion remains the only hard-delete path.

## Migration and rollback

The source snapshot is read-only evidence pinned to commit
`30bd1abc05846926e97bc7b26c5b7d6625e8f161`. Phase 11D provides dry-run
reconciliation only. It can count and map launch kits, brand profiles and
exports while explicitly excluding child users, credentials, sessions,
subscriptions, plan mutations, Stripe events, admin authority and legacy SSO.
Apply requires a separately approved tenant/user map, backup, reconciliation
thresholds, write freeze and cutover.

The existing `module_scaffolds` table is retained as historical data during
Phase 11D but removed from active Ninja Launch Kit routes and UI. Scaffold rows
are not silently converted because they describe code generation, not a
marketing launch. A future approved cleanup may archive or remove the legacy
table after confirming it contains no required records.

The database release is additive and idempotent. Rollback is the documented
restore-to-new-database and traffic-switch procedure; no destructive down
migration is introduced.

## Superseded records

This ADR supersedes the active scaffold-MVP product interpretation in
`docs/MODULE_CONSOLIDATION_STATUS.md` and
`docs/modules/MODULE_PARITY_INDEX.md`. It does not supersede the shared
OperatorOS authority, SSO or service contracts.
