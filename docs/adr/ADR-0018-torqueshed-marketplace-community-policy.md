# ADR-0018: TorqueShed marketplace, community, and moderation policy

Status: Accepted
Date: 2026-07-18

## Context

The standalone TorqueShed reference contains draft marketplace/community
tables and polished simulated screens, but no production routes, uploads,
moderation, notifications, payment, protection, shipping, reputation, or abuse
controls. Its mockup mentions protected checkout, shipment tracking, disputes,
seller ratings, sales counts, and a platform fee. Presenting those claims in
OperatorOS without real legal/provider operations would be unsafe and false.

TorqueShed also contains private VIN-derived, service, cost, file, and
diagnostic data that must not leak through a listing or post.

## Decision

Marketplace and community are authenticated, tenant-scoped member services.
`public` community visibility means visible to authenticated TorqueShed members
inside the trusted tenant; it never means anonymous Internet publication.
Private content remains author-only, and follower visibility is limited to
same-tenant followers who are not blocked.

The marketplace supports automotive parts, tools, manuals, fabrication,
builder-made items, and wanted/trade listings. It prohibits stolen goods,
VIN/title/identity plates or documents, credentials, weapons, illegal drugs,
hazardous materials, emissions-defeat devices, counterfeit or recalled safety
parts, deceptive claims, harassment, and personal/contact data in public
fields. Location is limited to locality/region/country; street address,
coordinates, and precise postal address are rejected.

Price is informational integer minor-unit data. Buyer and seller may open a
rate-limited in-app conversation, but fulfillment and any payment occur
off-platform at their own discretion. TorqueShed does not provide or claim
escrow, checkout, payment protection, buyer/seller protection, shipping,
tracking, taxes, title/identity verification, inspection, dispute adjudication,
reputation verification, guarantees, or refunds. OperatorOS subscription and
Torque Assist token billing remain entirely separate.

Only safe vehicle/build labels may be linked. Publishing a listing or public
post cannot expose plaintext VIN, VIN fingerprint, exact address, private
vehicle/build data, costs, attachments, reminders, or diagnostic records.
Media uses the shared private attachment/scanning service and is visible only
after a clean scan.

Profiles, listings, posts, comments, reactions, follows, favorites,
conversations, reports, blocks, preferences, moderation actions, expiry, and
renewal are tenant-bound and durable. Text is stored/rendered as bounded plain
text. User and tenant rate limits, recent duplicate-content rejection, blocked
user filtering, owner/manager authorization, archive policy, and platform
audit are server-enforced. Tenant managers may hide/remove content and resolve
reports; moderation actions are immutable evidence and never silently rewrite
the original author.

## Consequences

- The product delivers discovery and safe contact, not commerce processing.
- Cross-tenant discovery, anonymous publishing, public exact location, and
  unscanned media are unavailable.
- Source mockup protection/reputation/sales claims must not appear in the
  active UI.
- Moderation is explicit operational work; managers need a report queue and
  documented appeal/correction process before public launch.
- `public_build` eligibility remains distinct from an automatically public
  community post.

## Data, migration, and rollback

Phase 9 may import approved content only through deterministic user, tenant,
vehicle/build, file, tag/category, and moderation mappings. Child identities,
sessions, payments, ratings, fabricated counters, precise locations, and
unscanned files are excluded. No source apply or cutover is authorized in this
phase.

The root release is additive and tenant-indexed. Before any persistent apply,
take a verified backup, run the clean-database abuse/privacy workflow, and
approve moderation ownership. Rollback restores to a new database and switches
traffic; moderation and audit records are not destructively deleted.
