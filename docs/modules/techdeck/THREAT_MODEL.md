# TechDeck Phase 5 threat model

## Phase 39 platform-hardening overlay (2026-08-14)

API-token scopes, public validation/intake abuse controls, HMAC/SSRF-safe
webhooks, evidence/export integrity, tenant-safe topology, secret references,
and the no-host-execution runner boundary are governed by the platform threat
model and [Phase 39 register](../../phase-39/THREAT-MODEL-REGISTER.md).

Assessment date: 2026-07-18

## Protected assets

- OperatorOS identity, host sessions, tenant membership, and TechDeck grants.
- Directory organizations, contacts, and sites.
- Infrastructure inventory, topology, address plans, lifecycle dates,
  documentation, evidence metadata, reports, time entries, and audit history.
- Shared private attachments and their scanned blobs.

## Trust boundaries

1. Browser to exact TechDeck host using the OperatorOS host-only session.
2. Fastify authorization to tenant-scoped TechDeck and Directory tables.
3. Shared attachment API to private blob storage and scan jobs.
4. Dry-run importer reading an operator-selected export without mutating data.
5. External vault references, which are opaque non-secret identifiers only.

## Principal threats and controls

| Threat | Control |
| --- | --- |
| Cross-tenant object enumeration | Session-derived tenant, repeated tenant predicates, composite tenant foreign keys, masked 404 responses |
| Role escalation | Server-side module write and tenant-admin guards; UI hiding is not authority |
| Stale overwrite | Optimistic versions on mutable records and document transitions |
| Secret disclosure | No secret-value schema or reveal route; forbidden-field validation; redacted logs and exports |
| Stored XSS in documents | Bounded Markdown/text, dangerous HTML/URL sanitization, no raw HTML rendering |
| Unsafe file upload | Shared private attachment validation, randomized keys, signature/MIME checks, scan state, authorized downloads |
| Topology corruption | IP/CIDR/VLAN validation, site/organization pairing, same-tenant relationship endpoints, uniqueness constraints |
| Arbitrary remote execution | No execution/dispatch routes; ADR-0014 requires a separately approved signed agent boundary |
| Import confusion or authority overwrite | Dry-run only, source fingerprints, explicit authority exclusions, duplicate/reference errors, row-level reconciliation |
| Audit leakage | Activity and platform audit metadata omit document bodies, script text, attachment content, and secret-shaped input |

## Residual risks

- Documented topology can become stale because it is not discovery-backed.
- External vault references may point to deleted or inaccessible items; no
  availability claim is made.
- Production proxy, deployed SSO, provider, and browser acceptance remain
  unproven until the cumulative revision is deployed through the authorized
  release gate.

## Remote-action non-boundary

No endpoint agent exists in Phase 5. Adding one would materially change this
threat model and requires the controls listed in ADR-0014 before any code or
route can be enabled.
