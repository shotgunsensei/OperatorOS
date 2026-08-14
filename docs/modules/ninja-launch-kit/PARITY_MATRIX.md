# Ninja Launch Kit parity matrix

## Phase 20 truth notice (2026-08-08)

The matrix below is historical implementation evidence. Current release truth
is `docs/parity/modules/ninja-launch-kit.json`: 336 capabilities, 0 native, 0
shared-equivalent, 0 owner-waived, and 336 blocked pending exact target/test
mapping. See `docs/phase-20/PRODUCT-TRUTH-REPORT.md`.

Status: Phase 11D implementation contract. The imported source is read-only
migration evidence, not an executable child application.

## Provenance

| Evidence | Value |
| --- | --- |
| Standalone checkout | `C:\Dev\Ninja-Launch-Kit` |
| Pinned commit | `30bd1abc05846926e97bc7b26c5b7d6625e8f161` |
| Remote | `https://github.com/shotgunsensei/Ninja-Launch-Kit.git` |
| Imported snapshot | `apps/modules/ninja-launch-kit/source` |
| Manifest | `apps/modules/ninja-launch-kit/source/SOURCE_SNAPSHOT.json` |
| Snapshot inventory | 331 tracked files; 256 retained files; 1,173,062 bytes |
| High-confidence secret findings | 0 |
| Authority decision | `docs/adr/ADR-0024-ninja-launch-kit-product-and-readiness-boundary.md` |

## Product parity

| Standalone capability | Source evidence | OperatorOS target | Phase 11D acceptance |
| --- | --- | --- | --- |
| Launch brief | Builder inputs and `launch_kits.input` | Tenant launch workspace with audience, problem, positioning, offer, price, channels, tone, colors and target date | Persisted CRUD, validation, tenant/RBAC negatives and refresh persistence |
| Generated launch kit | Deterministic generator and optional Anthropic enhancement | Shared-AI generation of persisted draft artifacts with provider/model provenance | Idempotent generation; disabled provider fails closed; drafts require review |
| Landing copy | Generated `landingPage` content | Versioned `landing` artifact | Editable draft/review/approved lifecycle |
| Facebook/Google ads | Generated ad content | Versioned `ads` artifact | Persisted and readiness-eligible only when approved |
| Email and SMS | Generated campaign content | Versioned `email_sms` artifact | Persisted and exportable |
| Social content | Generated social posts | Versioned `social` artifact | Persisted and exportable |
| FAQ | Generated FAQ | Versioned `faq` artifact | Persisted and exportable |
| QR/flyer copy | Generated flyer/QR section | Versioned `qr_flyer` artifact; no fake QR service | Persisted copy with clear text-export semantics |
| Visual directions | Nine source visual-promo briefs | Versioned `visual_briefs` artifact containing the nine bounded directions | Persisted draft and explicit approval |
| Launch checklist | Generated checklist | Ordered phases, milestones and required/dependent tasks | Real completion state and dependency enforcement |
| Niche templates | 20 source templates across free/pro/agency labels | Versioned server catalog that instantiates a real workspace; access remains OperatorOS-entitlement based | All 20 identities available without child-plan authority |
| Brand profiles | Standalone reusable brand profiles | Launch-specific snapshot/reference only | Does not duplicate or mutate BrandForgeOS authority |
| Saved kits | Dashboard and `/kits/:id` | Tenant workspace list/detail/deep links | Real pagination, refresh and direct URL behavior |
| Exports | Export records and downloads | Server-rendered JSON/Markdown/CSV summary with checksum and audit row | Output derives only from authorized persisted data |
| Assets/documents | Limited standalone export/brand assets | Private shared attachments bound to a launch or artifact | Scanned, hashed, tenant/module/object authorized |
| Collaboration | Limited standalone ownership | Tenant members as owners plus append-only activity | Active-member validation and auditable changes |
| Readiness | Source checklist/dashboard presentation | Rule-level server computation | No static/random score; launch transition requires 100 percent |

## Explicit exclusions

| Excluded source surface | Reason |
| --- | --- |
| Login, signup, password reset, child sessions and child users | OperatorOS is the sole identity/session authority |
| Anonymous/demo authentication and demo plan mutation | Bypasses identity, entitlement and audit controls |
| Child plans, Stripe checkout/webhooks and subscription administration | OperatorOS is the sole platform billing/entitlement authority |
| Child admin/user management | OperatorOS owns tenants, memberships, roles and platform administration |
| Legacy URL-token SSO consume flow | Conflicts with exact-host opaque-code SSO v1 and leaks replayable authority into URLs |
| Client-supplied plan/tier gates | Entitlement is resolved from the trusted OperatorOS session |
| Public raw asset/export URLs | Files and exports require an authorized tenant/module session |
| Automatic publish or “AI approved” claims | Generated content requires explicit human review |
| Active `module_scaffolds` API/UI | Unfinished worker-backed code generation is product-misaligned |
| Fake reach, conversion, readiness or revenue counters | No persisted source of truth exists |

## Threat model and controls

| Threat | Required control and negative evidence |
| --- | --- |
| Cross-tenant launch enumeration | Trusted session tenant in every predicate; foreign IDs return the same not-found response |
| Client tenant override | Ignore request tenant authority; revalidate any requested tenant selection against membership |
| Unauthorized owner assignment | Server checks active current-tenant membership before write |
| UI-only permission | Read/write guards on every API; direct API tests cover reader/write denial |
| Cross-launch or cyclic task dependency | Composite tenant/launch checks plus server cycle detection and transaction |
| Inflated readiness | Server computes rule evidence; client score is not accepted or stored |
| Approving missing/generated content | Lifecycle validation requires non-empty persisted body and expected version |
| Launching incomplete work | `launched` transition requires server-computed 100 percent readiness |
| Duplicate AI charges/content | Shared idempotency plus atomic generation/artifact/usage transaction |
| Provider or prompt leakage | Server provider selection; no secrets or artifact body in logs/audit metadata |
| Unsafe asset access | Shared attachment validation/scanning and tenant/module/object-bound content retrieval |
| Export data leak | Re-query inside tenant boundary; no attachment bytes; checksum and audit record |
| Open redirect/token leakage | Shared SSO/return contract only; no module-local auth or URL credentials |
| Legacy authority import | Dry-run allowlist and explicit exclusions; no apply mode in Phase 11D |

## Persistence and transaction plan

The additive schema owns launches, phases, milestones, tasks, artifacts,
generation provenance and exports. Every entity has tenant predicates,
constraints, indexes, audit timestamps and optimistic versions where mutable.
Composite tenant foreign keys enforce launch ownership. Launch creation from a
template, AI generation, task dependency updates, launch transitions and
exports use explicit transactions so readiness and audit evidence cannot
partially commit.

Soft delete is used for launches, plan records and artifacts. Generation and
export provenance is append-only. Attachment storage remains in the shared
platform service. Tenant hard deletion uses the existing platform-authorized
deletion transaction and is table-presence safe for isolated tests.

## Reconciliation and cutover gate

Phase 11D accepts only a descriptor whose `sourceCommit` equals the pinned
commit. Dry run reports a stable export checksum, row counts, mappings,
exclusions and blockers. It performs no writes.

Apply/cutover remains blocked until all of the following are approved and
recorded:

1. OperatorOS tenant and user mapping.
2. Backup and restore rehearsal for the target database.
3. Standalone write freeze and final export checksum.
4. Row-count and sampled-content reconciliation thresholds.
5. Collision, ownership and deleted-record policy.
6. Post-cutover SSO, tenant, authorization, persistence and rollback evidence.

## Completion evidence required

- Focused API/domain/import/UI contracts pass.
- Clean and idempotent disposable-database release passes.
- Aggregate API regression passes without skipped core Ninja Launch Kit cases.
- Production typecheck/build and core preflight pass.
- Compiled runtime readiness, database/auth/AI/attachment health pass.
- Browser SSO, entitlement, CRUD, review/readiness, export, persistence,
  deep-link, direct-host, tenant isolation, authorization and logout pass
  locally on production artifacts.
- Deployed-host acceptance and an authorized cutover record are still required
  for consolidation state 5.
