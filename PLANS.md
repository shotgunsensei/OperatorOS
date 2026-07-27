# OperatorOS completion plan

Status: current execution plan

Authority: `docs/IMPLEMENTATION_STATUS.md` records the latest evidence and
`docs/modules/MODULE_PARITY_INDEX.md` records module state.

## Release invariant

No module reaches consolidation state 5 until its approved product workflows,
data migration or initialization, tenant/RBAC/entitlement negatives, SSO,
deep links, persistence, production build/start, health, deployed browser E2E,
backup, and rollback gates pass. A host, entitlement, shell, or partial native
slice is not parity.

## Milestones

| Phase | Outcome | Dependencies | Current status |
| --- | --- | --- | --- |
| 0 | Execution framework, verified baseline, one status ledger, ADR index, and parity index | None | Complete locally on `codex/phase-0-baseline`; release gate remains closed |
| 1 | Reproducible canonical deployment, environment contract, deployed SSO/navigation gate, and backup/restore rehearsal | Phase 0 | Source/local accepted on `codex/phase-1-platform-deployment-gate`; public gate failed 32/47 pending authorized deployment |
| 2 | OperatorOS-owned shared Business Directory for organizations, contacts, sites, addresses, and module profiles | Phase 1 | Source/local accepted on `codex/phase-2-shared-business-directory` by explicit owner direction; not deployed |
| 3 | Shared attachments, notifications, providers, jobs/outbox, webhook idempotency, usage ledger, and activity timeline | Phase 2 | Source/local accepted on `codex/phase-3-shared-services` by explicit owner direction; public gate remains closed |
| 4 | TradeFlowKit state 5 | Phases 2-3 | Source/local state 4 candidate on `codex/phase-4-tradeflowkit-state-5`; state 5 blocked on deployed workflow/cutover evidence |
| 5 | TechDeck state 5 | Phases 2-3 | Source/local state 4 candidate on `codex/phase-5-techdeck-state-5`; state 5 blocked on deployment, provider, and data-cutover evidence |
| 6 | PulseDesk state 5 with healthcare-operations/PHI boundary resolved | Phases 2-3 | Source/local state 4 candidate on `codex/phase-6-pulsedesk-state-5`; state 5 blocked on deployed workflow, privacy-reviewed data apply, reconciliation and cutover evidence |
| 7 | TorqueShed vehicle, maintenance, diagnostic, repair, and verification foundation | Phases 2-3 | Source candidate implemented on `codex/phase-7-torqueshed-foundation`; typecheck/build/preflight and 15 focused contracts pass, but state 4 is blocked because Docker Desktop cannot start its daemon, so DB apply/workflow/runtime/SSO gates were not run |
| 8 | Torque Assist deterministic adapter, safety controls, metering, and append-only token ledger | Phases 3 and 7 | Source candidate implemented on `codex/phase-8-torque-assist`; 7/7 Phase 8 and 15/15 cumulative contracts, workspace typecheck, production build, core preflight, and 20-step read-only release plan pass. State remains 3 because Docker/database workflows, runtime and browser gates are unrun |
| 9 | TorqueShed marketplace and community | Phases 3, 7-8 | Source candidate implemented on `codex/phase-9-torqueshed-marketplace-community`; durable listing/contact/expiry and profile/post/comment/reaction/follow/block/media/report/moderation workflows, policy and native UI pass database-independent contracts/typecheck. State remains 3 because Docker/database/scanner/runtime/browser/deployed gates are unrun |
| 10A | FaultlineLab state 5 | Phases 2-3 | Source/local state 4 candidate on `codex/phase-10a-faultlinelab-completion`: four validated runnable cases, immutable challenge versions, authoring/publish, server-scored attempts, Chaos/daily modes, assignments, progress/badges, private proof, exports, dedicated persistent deep links, dry-run reconciliation, compiled 21-step runtime/health, and production-host SSO/workflow 3/3 pass locally. State 5 remains blocked on deployed acceptance and an authorized data cutover; no production-ready claim. |
| 10B | Ninja Pool Hall state 5 | Phases 2-3 | Source/local state 4 candidate on `codex/phase-10b-ninja-pool-hall-completion`: Free Shoot, CPU 8-ball, local hot-seat, persistent profiles/preferences, structured server-rules results/events, aggregates, recovery, deep links, zero-row dry-run reconciliation, clean/idempotent 22-step release, compiled runtime/health, and production-host SSO/gameplay 4/4 pass locally. Online relay and unsupported competitive claims are disabled. State 5 remains blocked on deployed acceptance and an authorized no-data cutover record; no production-ready claim. |
| 11A | BrandForgeOS state 5 | Phases 2-3 | Source/local state 4 candidate on `codex/phase-11a-brandforgeos-closure`: persistent brand/persona/campaign/copy/calendar/metrics/generation workflows, shared AI/usage, exact dry-run provenance, clean 23-step release, compiled health/readiness, and production-host browser matrix 5/5 pass locally. State 5 remains blocked on deployment and an authorized data cutover record. |
| 11B | SnapProofOS state 5 | Phases 2-3 | Source/local state 4 candidate on `codex/phase-11b-snapproofos-completion`: persistent evidence cases, private note/file capture, scanning/hashing, review, findings, append-only comments/custody, immutable reports, real exports, retention/legal hold/archive, deterministic dry-run provenance, clean 24-step release, aggregate 787/787, compiled health/readiness, and production-host browser matrix 6/6 pass locally. State 5 remains blocked on deployment and an authorized data reconciliation/cutover record. |
| 11C | StudyForge AI state 5 | Phases 2-3 | Source/local state 4 candidate on `codex/phase-11c-studyforge-ai-completion`: tenant-scoped subjects and private sources; source-grounded AI decks/quizzes/plans; editable draft/review/publish workflows; server grading; per-user spaced repetition and session completion; shared usage/idempotency/activity; real exports; deterministic dry-run provenance; clean/idempotent 25-step release; aggregate 801/801; compiled health/readiness; and production-host browser matrix 7/7 pass locally. State 5 remains blocked on deployment and an authorized data reconciliation/cutover record. |
| 11D | Ninja Launch Kit state 5 after source/product alignment ADR | Phases 2-3 | Source/local state 4 candidate on `codex/phase-11d-ninja-launch-kit-completion`: ADR-0024 resolves the BrandForgeOS boundary; tenant-scoped launches, phases, milestones, dependencies, reviewed artifacts, private assets, server readiness, shared AI/usage/activity, real exports, canonical deep links and deterministic no-apply provenance are implemented. Focused tests, aggregate 816/816, clean/idempotent 26-step release, typecheck/build/preflight/compiled health-readiness, focused browser retest 1/1 and full production-host matrix 8/8 pass locally. State 5 remains blocked on deployment and an authorized data reconciliation/cutover record. |
| 11E | CallCommand AI state 5 with consent, signed callbacks, and provider controls | Phases 2-3 | Source/local state 4 candidate on `codex/phase-11e-callcommand-ai-completion`: commit-pinned provenance; tenant-scoped channels, profiles, review-only transfer targets, consent/suppression, outbound calls, signed inbound DTMF intake, safe events, operator dispositions, reviewed follow-up drafts and persisted analytics; explicit test-only adapter; fail-closed Twilio boundary; replay-safe callbacks; forced-off recording privacy; deterministic no-apply provenance; clean/idempotent 27-step release; aggregate 825/825; compiled health/readiness; and production-host browser matrix 9/9 pass locally. State 5 remains blocked on deployment, authorized data reconciliation/cutover and approved live-provider acceptance. |
| 12A | Canonical Ninjamation source/spec decision and state-5 implementation | Phases 2-3 | Source/local state 4 candidate on `codex/phase-12a-ninjamation-completion`: AutomationPacks provenance is commit-pinned; AutoWorkFlowHub is explicitly excluded as discontinued; tenant-scoped reviewed automation scripts, immutable versions, static analysis, admin approval, audited downloads, shared AI drafts, canonical deep links and deterministic no-apply provenance are implemented. Clean/idempotent 28-step release, aggregate 836/836, compiled health/readiness, production-host matrix 9/9 and first-screen workflows 2/2 pass locally. Server/browser execution is deliberately absent. State 5 remains blocked on deployment and authorized reconciliation/cutover. |
| 12B | OutCall distinct/merge/cancel ADR and deliberate implementation or retirement | CallCommand boundary evidence | Pending; disabled |
| 13 | Repeatable dry-run imports, reconciliation, rollback-safe cutover, and standalone write freeze | Every targeted module parity schema approved | Pending |
| 14 | Cross-module security, privacy, performance, and reliability hardening | Functional parity and migration tooling | Pending |
| 15 | Deployed acceptance, release decision, and state-5 certification matrix | All required prior gates | Pending |

## Phase execution rules

1. Run phases in order. Do not run concurrent product migrations against shared
   schema/platform files.
2. Begin each phase by reading `AGENTS.md`, this plan, implementation status,
   the ADR index, the relevant parity rows, and current authority contracts.
3. Treat imported source as read-only evidence. Port only approved domain code
   into active OperatorOS boundaries.
4. Resolve ambiguous product/domain/security ownership with an ADR before
   broad implementation.
5. Use an isolated database, targeted tests, aggregate regression, configured
   production build/start, health, and browser evidence appropriate to the
   phase.
6. Update status/parity/migration/cutover documents before a scoped commit.

## Immediate next gate

The owner explicitly authorized source work to continue through later phases
on separate branches even while the public deployment gate remains failed.
Phase 12A's source/local state-4 gate is complete on its scoped closure branch
pending owner review. The next source phase is Phase 12B, the OutCall
distinct/merge/cancel decision and deliberate implementation or retirement.
That direction
permits later source work; it does not authorize deployment,
production data mutation, promotion, or a production-ready label. Before any
public promotion, deploy the reviewed cumulative revision through `.replit`,
require 47/47 from the read-only verifier, and run authenticated deployed SSO,
return, persistence, deep-link, refresh, entitlement, tenant-isolation,
authorization, logout, provider, backup/restore, and module acceptance. Record
the exact deployed commit in `docs/CURRENT_RELEASE_GATE.md` and never weaken
the contract to make it pass.
