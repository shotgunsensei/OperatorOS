# TorqueShed Marketplace and Community moderation policy

Assessment date: 2026-07-18

This policy applies to authenticated same-tenant Marketplace and Community
content. It does not create anonymous public publishing, transaction
protection, or a platform guarantee.

## Allowed scope

- Automotive parts, tools, manuals, fabrication services/items, wheels and
  tires, electronics, builder items, wanted listings, and trades.
- Evidence-first automotive discussion, diagnostics, maintenance, builds,
  fabrication, and tools.
- Locality, region, and country only. Exact addresses, precise coordinates,
  and private contact details belong in neither public listings nor posts.
- Safe vehicle/build labels may be linked only after tenant/owner validation.
  VINs, private diagnostics, costs, files, reminders, and vehicle fingerprints
  are never projected into social content.

## Prohibited content and claims

Stolen goods; VIN/title/identity plates or documents; credentials; weapons;
illegal drugs; explosives or hazardous materials; emissions-defeat devices;
counterfeit or recalled safety parts; fraud; harassment; spam; doxxing; stored
markup/script; deceptive condition or safety claims; and personal/contact data
in public fields are prohibited.

TorqueShed does not provide or claim checkout, escrow, shipping/tracking,
payment protection, tax handling, inspection, title verification, dispute
resolution, seller reputation, guarantees, or refunds. Marketplace prices are
informational integer minor-unit amounts. Members contact one another in-app
and arrange any payment and fulfillment off-platform at their own risk.

## Enforcement

- Any authenticated tenant member may report a listing, message, profile,
  post, or comment using a stable reason code and bounded plain-text details.
- A member cannot report their own content. Duplicate reports are rejected.
- Tenant owners/admins and TorqueShed managers may hide, remove, restore,
  warn/resolve, or dismiss. Target content is always resolved with the trusted
  tenant predicate.
- Every moderation action is appended to an immutable database log and to the
  platform activity audit. The database rejects update/delete of moderation
  actions.
- Content owners receive an in-app moderation notification when enabled.
- Blocks are bilateral for visibility/interaction and remove follow links.
  Foreign or blocked resources return not found rather than being enumerated.
- User and tenant write/message/report limits plus recent-content hashing
  reduce spam and replay.

## Media and retention

Only JPEG, PNG, and WebP images are accepted, up to the shared attachment size
limit and 20 live images per object. Signatures must match the declared MIME
type. Images use shared private storage and are not visible to other members
until the shared scanner records `clean`. Infected/error/pending content is not
served. Deletion is a retained soft delete under the shared attachment policy.

Moderation removals and owner deletes archive content; they do not erase audit
history. Legal hold, retention, appeal, and regulator-specific requirements
must be approved before a production launch in a jurisdiction that requires
them.
