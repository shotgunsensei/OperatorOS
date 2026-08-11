# TorqueShed parity matrix

## Phase 28 current truth (2026-08-11)

The Phase 9 and Phase 20 sections below are retained as historical evidence
only. Phase 28 pins the clean source `main`/`origin/main` commit
`508b384b6f66a1eacd3d4cd8d9c5edd4bf47fe75` and replaces the former
125-blocker snapshot with the executable
`docs/parity/modules/torqueshed.json` ledger:

| Classification | Count |
| --- | ---: |
| `ACTIVE_NATIVE` | 473 |
| `ACTIVE_SHARED_EQUIVALENT` | 387 |
| `OWNER_WAIVED` | 0 |
| `BLOCKED` | 0 |
| Total | 860 |

The native target restores durable garage/history, community and privacy,
build journals/parts/costs, complete diagnostic evidence/reports, reconnecting
live bays, marketplace inquiry/moderation boundaries, notifications/search/
activity/settings, revocable shares, exports, deep links, and a responsive PWA
surface. Shared-equivalent records preserve the source outcome through
OperatorOS identity/tenant/entitlement, AI/usage, attachments/media scanning,
exports, secrets, notifications, and audit. Public projections are explicitly
allowlisted and never expose private tenant records or VINs. Marketplace
contribution reputation is not a transaction rating, payment, escrow,
shipping, protection, or guarantee claim.

Release v38, focused persistence/authorization tests, root quality gates, and
compiled exact-host SSO plus desktop/tablet/mobile browser acceptance pass
locally. Production providers, backup/apply, source-data reconciliation,
deployed verification, rollback, and cutover remain state-5 gates. The full
ledger and evidence are in
`docs/phase-28/TORQUESHED-WEB-API-PARITY-REPORT.md`.

## Historical Phase 20 truth notice (2026-08-08)

The matrix below is historical implementation evidence. Current release truth
is `docs/parity/modules/torqueshed.json`: 125 capabilities, 0 native, 0
shared-equivalent, 0 owner-waived, and 125 blocked. The imported Expo iOS/
Android product has its own native-mobile blocker; web evidence is
insufficient. See `docs/phase-20/PRODUCT-TRUTH-REPORT.md`.

Assessment date: 2026-07-18

## Provenance

The immutable quarantined snapshot is pinned to
`c33ade5cef525d62d371a63946b814c58a72a4a7` and contains 148 imported files
from 263 tracked source files with zero high-confidence secret findings. The
separate `C:\Dev\TorqueShed-Codex` checkout is read-only evidence: its local
`main` is `68da4548f665`, its already-present `origin/main` is
`508b384b6f66a1eacd3d4cd8d9c5edd4bf47fe75`, and the working tree contains
uncommitted user work. No fetch, pull, install, migration, server, or write was
performed there.

The newer committed reference adds a 602-line product schema, 722-line route
module, a persistent E2E workflow, and garage/diagnostic/build UI. Its useful
product concepts are design evidence, not runtime authority. Uncommitted
`garage.ts` and `operations.ts` are recorded only as non-deterministic design
input and are ineligible for migration provenance.

Phase 9 also inspected the committed standalone Marketplace and Community
schema declarations and the product audit. They are incomplete design
evidence: the standalone audit labels these surfaces simulated/local-only,
and no production Marketplace or Community route implementation exists there.
Mockup claims for protected checkout, shipping tracking, dispute windows,
seller ratings/sales counts, and a 3% fee are explicitly rejected. Nothing was
copied, installed, migrated, executed, or modified in the standalone checkout.

| Source capability | OperatorOS Phase 9 disposition | Evidence target |
| --- | --- | --- |
| Standalone users, sessions, orgs, memberships, credentials | Excluded; OperatorOS authority | Auth/tenant/module guards and negative tests |
| Vehicle profile, year/make/model/trim/engine/transmission/drivetrain | Namespaced vehicle record | CRUD, search/page, restart, tenant tests |
| VIN | Fingerprint + masked suffix only; plaintext discarded | API/DB no-plaintext assertions |
| Personal/team/public visibility | Owner plus private/tenant/public-build eligibility; no anonymous publishing in Phase 7 | Role/owner tests and ADR-0016 |
| Mileage history | Durable idempotent mileage events and current-mileage projection | Retry/count and persistence tests |
| Maintenance, repairs, inspections, modifications | One typed service record with parts, labor, vendor, and minor-unit costs | Full-chain and integer-cost tests |
| Vendors | Tenant/owner-scoped automotive vendor record; not platform billing | CRUD/tenant tests |
| Builds, stages, tasks, budgets, timeline | Versioned namespaced project build hierarchy | Stage/task/status/cost tests |
| Reminders and schedules | Date/mileage due records with recurrence fields | CRUD/dashboard tests |
| Diagnostic sessions | Concern, symptoms, conditions, states, cause, repair, verification, resolution | Transition/concurrency/restart tests |
| Trouble codes and freeze frame | Durable child records with bounded code state and JSON freeze frame | Full-chain timeline tests |
| Inspections, tests, measurements, hypotheses, cause, repair, verification | Typed diagnostic entries with text/numeric value, unit, reference range, outcome, metadata | Idempotency and timeline tests |
| Photos/documents | OperatorOS shared attachment storage, MIME/signature/hash/scan service | Attachment metadata/timeline test |
| Diagnostic templates | Private or tenant-shared reusable test plans | Role/list/create tests |
| Dashboard and `/diagnostics` deep routes | Real aggregate API and responsive native workspace | Static, production build, browser E2E |
| Torque Assist diagnostic context | Server reloads authorized vehicle, diagnostic, codes, freeze frame, observations, repair history, and bounded follow-up answers; no browser-supplied tenant/provider authority | Context preview, ownership/tenant, size/hash, and redaction tests |
| Torque Assist response | Strict facts/assumptions/ranked low-or-medium hypotheses/warnings/tests/follow-ups/disclaimer schema with high-risk escalation | Deterministic, malformed, unsafe-certainty, provider-failure, and UI tests |
| Provider execution | Shared server-selected adapter with bounded context, timeout, two attempts, user/tenant rate limits, tenant circuit, disabled state, and redacted errors | Domain/static contracts plus database workflow |
| Token purchase and credit | OperatorOS-owned package price/units, Stripe Checkout, signed raw-body webhook, test/live binding, duplicate-safe credit, failure and refund reversal | Signed payment/replay/mode/refund tests |
| Usage debit and balance | Append-only tenant/user/module ledger; computed balance; atomic accepted request plus exact one debit; no mutable authoritative balance | Exhaustion, replay, race, append-only, reconciliation, and restart tests |
| Marketplace listings | Tenant/user-owned draft/publish/sold/expired/archive lifecycle; categories, integer price minor units, safe locality, vehicle/build links, search/filter/sort/page, saved view, 30-day expiry/renewal | Domain/static contracts plus implemented DB workflow and browser acceptance |
| Marketplace contact | One conversation per listing/buyer; persistent in-app messages, bilateral blocks, rate/duplicate limits and reports | Implemented DB workflow, outbox and browser conversation UI |
| Marketplace media | Shared private JPEG/PNG/WebP storage, signature/hash/size validation, 20-image cap, scan-before-publication/visibility | Static contracts and implemented workflow; scanner runtime rerun pending |
| Community profiles/privacy | Tenant/private profiles with safe locality, specialties, notification preferences, follows and bilateral blocks | API/UI plus implemented DB workflow |
| Community content | Draft/publish/edit/archive posts; topics/tags; same-tenant/follower/private visibility; vehicle/build links; comments/replies, reactions and media | Domain/static/API/UI plus implemented DB workflow |
| Reporting/moderation | Listing/message/profile/post/comment reports; owner/admin/manager actions; append-only moderation ledger, audit and notifications | Static trigger/route contracts and implemented DB workflow |
| Transaction/protection claims | Explicitly excluded: checkout, escrow, shipping/tracking, taxes, payment protection, inspections, title verification, reputation, guarantees, disputes and refunds | ADR-0018, policy route, moderation policy and UI disclosure |
| Standalone billing/Stripe | Excluded; OperatorOS platform authority | No mounted child route/schema |
| Child runtime and migrations | Excluded | Root release manifest only |

## Completion boundary

The combined Phase 7/8/9 candidate can reach consolidation state 4 only after
isolated database apply, the complete foundation and Torque Assist payment/
ledger/provider/role/tenant/concurrency/restart tests, Marketplace/Community
persistence/isolation/media/moderation workflow, root typecheck/build/preflight,
local production readiness, and production-host SSO/deep-link checks pass.
State 5 additionally requires an approved cumulative deployment, current
public acceptance, and an approved standalone-data apply/cutover. A rendered
shell or older public deployment is not parity.
