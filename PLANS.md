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
| 5 | TechDeck state 5 | Phases 2-3 | Source/local state 4 zero-gap rebaseline on `codex/techdeck-zero-gap-restoration`: executable ledger classifies 382/382 source capabilities with zero gaps; focused, isolated PostgreSQL, release, compiled-runtime, and exact-host browser gates pass. State 5 remains blocked on reviewed deployment, provider, and data-cutover evidence |
| 6 | PulseDesk state 5 with healthcare-operations/PHI boundary resolved | Phases 2-3 | Source/local state 4 candidate on `codex/phase-6-pulsedesk-state-5`; state 5 blocked on deployed workflow, privacy-reviewed data apply, reconciliation and cutover evidence |
| 7 | TorqueShed vehicle, maintenance, diagnostic, repair, and verification foundation | Phases 2-3 | Complete in the cumulative source/local State 4 candidate on `codex/torqueshed-state4-acceptance`: the foundation PostgreSQL workflow, release v29, compiled runtime/health, exact-host diagnostics/deep-link browser path, and tenant/ownership guards pass locally |
| 8 | Torque Assist deterministic adapter, safety controls, metering, and append-only token ledger | Phases 3 and 7 | Complete in the cumulative source/local State 4 candidate: the signed test-payment, provider safety, append-only accounting/refund/concurrency workflow and exact one-credit/one-debit browser path pass locally. Live Stripe/OpenAI and deployed acceptance remain State 5 gates |
| 9 | TorqueShed marketplace and community | Phases 3, 7-8 | Complete in the cumulative source/local State 4 candidate: listing/post publication, comments/reactions, reports/moderation/isolation workflows, native UI, mobile, return/relaunch and logout pass locally. Deployed acceptance and authorized data/rollback/cutover remain State 5 gates |
| 10A | FaultlineLab state 5 | Phases 2-3 | Source/local state 4 candidate on `codex/phase-10a-faultlinelab-completion`: four validated runnable cases, immutable challenge versions, authoring/publish, server-scored attempts, Chaos/daily modes, assignments, progress/badges, private proof, exports, dedicated persistent deep links, dry-run reconciliation, compiled 21-step runtime/health, and production-host SSO/workflow 3/3 pass locally. State 5 remains blocked on deployed acceptance and an authorized data cutover; no production-ready claim. |
| 10B | Ninja Pool Hall state 5 | Phases 2-3 | Source/local state 4 candidate on `codex/phase-10b-ninja-pool-hall-completion`: Free Shoot, CPU 8-ball, local hot-seat, persistent profiles/preferences, structured server-rules results/events, aggregates, recovery, deep links, zero-row dry-run reconciliation, clean/idempotent 22-step release, compiled runtime/health, and production-host SSO/gameplay 4/4 pass locally. Online relay and unsupported competitive claims are disabled. State 5 remains blocked on deployed acceptance and an authorized no-data cutover record; no production-ready claim. |
| 11A | BrandForgeOS state 5 | Phases 2-3 | Source/local state 4 candidate on `codex/phase-11a-brandforgeos-closure`: persistent brand/persona/campaign/copy/calendar/metrics/generation workflows, shared AI/usage, exact dry-run provenance, clean 23-step release, compiled health/readiness, and production-host browser matrix 5/5 pass locally. State 5 remains blocked on deployment and an authorized data cutover record. |
| 11B | SnapProofOS state 5 | Phases 2-3 | Source/local state 4 candidate on `codex/phase-11b-snapproofos-completion`: persistent evidence cases, private note/file capture, scanning/hashing, review, findings, append-only comments/custody, immutable reports, real exports, retention/legal hold/archive, deterministic dry-run provenance, clean 24-step release, aggregate 787/787, compiled health/readiness, and production-host browser matrix 6/6 pass locally. State 5 remains blocked on deployment and an authorized data reconciliation/cutover record. |
| 11C | StudyForge AI state 5 | Phases 2-3 | Source/local state 4 candidate on `codex/phase-11c-studyforge-ai-completion`: tenant-scoped subjects and private sources; source-grounded AI decks/quizzes/plans; editable draft/review/publish workflows; server grading; per-user spaced repetition and session completion; shared usage/idempotency/activity; real exports; deterministic dry-run provenance; clean/idempotent 25-step release; aggregate 801/801; compiled health/readiness; and production-host browser matrix 7/7 pass locally. State 5 remains blocked on deployment and an authorized data reconciliation/cutover record. |
| 11D | Ninja Launch Kit state 5 after source/product alignment ADR | Phases 2-3 | Source/local state 4 candidate on `codex/phase-11d-ninja-launch-kit-completion`: ADR-0024 resolves the BrandForgeOS boundary; tenant-scoped launches, phases, milestones, dependencies, reviewed artifacts, private assets, server readiness, shared AI/usage/activity, real exports, canonical deep links and deterministic no-apply provenance are implemented. Focused tests, aggregate 816/816, clean/idempotent 26-step release, typecheck/build/preflight/compiled health-readiness, focused browser retest 1/1 and full production-host matrix 8/8 pass locally. State 5 remains blocked on deployment and an authorized data reconciliation/cutover record. |
| 11E | CallCommand AI state 5 with consent, signed callbacks, and provider controls | Phases 2-3 | Source/local state 4 candidate on `codex/phase-11e-callcommand-ai-completion`: commit-pinned provenance; tenant-scoped channels, profiles, review-only transfer targets, consent/suppression, outbound calls, signed inbound DTMF intake, safe events, operator dispositions, reviewed follow-up drafts and persisted analytics; explicit test-only adapter; fail-closed Twilio boundary; replay-safe callbacks; forced-off recording privacy; deterministic no-apply provenance; clean/idempotent 27-step release; aggregate 825/825; compiled health/readiness; and production-host browser matrix 9/9 pass locally. State 5 remains blocked on deployment, authorized data reconciliation/cutover and approved live-provider acceptance. |
| 12A | Canonical Ninjamation source/spec decision and state-5 implementation | Phases 2-3 | Source/local state 4 candidate on `codex/phase-12a-ninjamation-completion`: AutomationPacks provenance is commit-pinned; AutoWorkFlowHub is explicitly excluded as discontinued; tenant-scoped reviewed automation scripts, immutable versions, static analysis, admin approval, audited downloads, shared AI drafts, canonical deep links and deterministic no-apply provenance are implemented. Clean/idempotent 28-step release, aggregate 836/836, compiled health/readiness, production-host matrix 9/9 and first-screen workflows 2/2 pass locally. Server/browser execution is deliberately absent. State 5 remains blocked on deployment and authorized reconciliation/cutover. |
| 12B | OutCall distinct/merge/cancel ADR and deliberate implementation or retirement | CallCommand boundary evidence | Source/local bounded candidate on `codex/phase-12b-outcall-rebuild`: ADR-0027 selects a distinct verified-self safety product; persistent onboarding, encrypted phone/trigger data, rescue profiles, durable test-adapter scheduling, cancellation/history, usage and native UI pass the clean 839/839 aggregate, 29-step release, compiled health, 9/9 production-host and 2/2 first-screen gates. Live Twilio, export/deletion UI and deployed evidence remain gated, so state 4/5 is not claimed. |
| 13 | Repeatable dry-run imports, reconciliation, rollback-safe cutover, and standalone write freeze | Every targeted module parity schema approved | Source/local rehearsal complete; production exports, backup/restore, write freeze, apply, deployed acceptance, and cutover remain human-gated |
| 14 | Cross-module security, privacy, performance, and reliability hardening | Functional parity and migration tooling | Local candidate: zero known dependency vulnerabilities; shared headers/bounded DB shutdown/fail-closed disabled billing; threat models; tenant/role negatives; production build; loopback load baseline; and disposable backup/restore pass. Deployment/provider/monitoring gates remain blocked for Phase 15. |
| 15 | Deployed acceptance, release decision, and state-5 certification matrix | All required prior gates | In progress; merge `c249a753` is deployed as build `2eb701089a539d9e6da5af80` and the contract-corrected public verifier passes 48/48. Authenticated test-user, persistence, tenant, authorization, logout, provider, backup/cutover, and State 5 gates remain open. |
| 16A | Re-baseline TradeFlowKit against the restored full product and close recorded parity gaps | Phase 15 release evidence plus restored-source provenance | In progress. The executable source ledger has zero unclassified items and 57 explicit gaps after three real increments: Workflow Studio/team work management, persistent revenue-document mutations, and bounded Directory-reconciled customer CSV import. Destructive customer bulk delete/restore is retired under ADR-0011. No real standalone export, production apply, deployment, or state-5 promotion is authorized. |
| 17 | Production truth and revenue release gate | Current cumulative `main` | Candidate on `codex/phase-17-production-truth`: complete Git/build/lock/build-time/deploy-time/DB-v29 identity; commit-pinned public verifier; planned/disabled OutCall alignment; idempotent DB, build/supervisor and focused 3/3 browser gates pass locally. Current public baseline is `48b8691`, build `932f83cb0d7c15ce994eb04e`; strengthened verifier is expected red at 45/48 until reviewed merge, Replit deployment, public 48/48, and production-safe authenticated 3/3. No deployment or state-5 claim. |

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

Close Phase 17 without starting Phase 18 on this branch:

1. Review and merge the Phase 17 draft pull request.
2. Confirm the provider-managed database backup.
3. Deploy merged `main` through the checked-in Replit autoscale workflow.
4. Set `OPERATOROS_EXPECTED_RELEASE_COMMIT` to the merged commit and require
   48/48 from `corepack pnpm verify:production`.
5. Provision the two synthetic acceptance accounts and require 3/3 from
   `corepack pnpm --dir apps/web test:e2e:phase17-deployed`.
6. Record the deployment/build IDs and exact evidence in the Phase 17 report.

Do not claim deployment, promotion, module state 5, or begin Phase 18 until
those human-gated actions pass.
