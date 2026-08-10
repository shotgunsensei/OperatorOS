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
| 5 | TechDeck state 5 | Phases 2-3 | Historical source/local state 4 baseline on `codex/techdeck-zero-gap-restoration`: its hand ledger classified 382 claims. Phase 26 supersedes that count with 354 pinned-source primary records and 1,309 exhaustive facets after removing 28 non-source claims. State 5 remains blocked on reviewed deployment, provider, and data-cutover evidence |
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
| 15 | Deployed acceptance, release decision, and state-5 certification matrix | All required prior gates | In progress; public commit `c29cbca` / build `25095fde5c3543a8aa748634` passes the current unpinned verifier 48/48. Current main `92ca0db` is newer and correctly returns 46/48 when pinned because its release identity is not deployed. Authenticated test-user, persistence, tenant, authorization, logout, provider, backup/cutover, and State 5 gates remain open. |
| 16A | Re-baseline TradeFlowKit against the restored full product and close recorded parity gaps | Phase 15 release evidence plus restored-source provenance | Complete source/local at state 4. The executable ledger classifies all 277 capabilities with 145 active, 58 shared replacements, 43 security retirements, 31 product-boundary retirements, zero unclassified, and zero gaps. The final increment adds privacy/consent-bound public lead capture, signed source adapters, and provider-gated Stripe Connect business payments with verified replay-safe settlement under ADR-0032. The full API aggregate passes 908/0/6 across 914 tests, typecheck/build pass, and release v32 applies cleanly/idempotently. No real standalone export, production apply, deployment, reviewed Connect onboarding/payment/refund, browser provider acceptance, rollback rehearsal, traffic cutover, or state-5 promotion is authorized. |
| 17 | Production truth and revenue release gate | Current cumulative `main` | Production-truth controls are merged and present on public commit `c29cbca`: complete release/DB-v29 identity and disabled OutCall assertions pass within the public 48/48 gate. Later main `92ca0db` is not deployed, and production-safe authenticated 3/3, provider, data, backup/rollback, and State 5 gates remain open. |
| 18 | OutCall live-capable source activation and customer experience closure | Phase 17 authority and Phase 12B product boundary | OutCall implementation merged to `main` at `d96c698`; release-candidate closure is on `codex/phase18-release-candidate-closure`. Explicit Twilio Verify/voice/SMS/DTMF, signed/replay-safe callbacks, durable rate limits, profile-bound triggers, privacy export/deletion, release v33, active registry/SSO coverage, and the ecosystem customer-copy sweep are source/local state 4. Focused 44/44, PostgreSQL 5/5, aggregate 914/0/6 across 920 tests, clean/idempotent v33, typecheck/build, strict compiled supervisor health, local exact-host matrix 12/12, and first-screen 2/2 pass. Deployment/real-provider/production backup-apply/rollback gates remain open. |
| 20 | Product truth reset and source recovery | Current `main`, imported source trees, Phase 17 and TechDeck restoration evidence | Baseline generated on `codex/phase-20-product-truth-reset`: 13 fingerprints, 6,646 stable capabilities, 276 native, 181 shared-equivalent, 0 owner-waived, 6,189 blocked, and 0 unclassified. The strict pointer check found 113 facets in the three old source ledgers whose claimed implementation paths are absent from the pinned imports. Phase 20 is not complete while any required item remains blocked. OutCall source recovery, exact source-to-target/evidence mapping, former-retirement review, FaultlineLab's 52 missing runnable cases, TradeFlowKit visual fidelity, and TorqueShed native mobile parity are explicit entry blockers for later restoration phases. |
| 21 | Executable parity compiler and fail-closed release gate | Phase 20 source manifest and module ledgers | Infrastructure implemented on `codex/phase-21-executable-parity-gate`: deterministic source/target discovery, compiled evidence/test IDs, per-module JSON/Markdown/HTML reports, negative fixtures, route/control and three-viewport visual contracts, root quality/release orchestration, and clean-checkout disposable-PostgreSQL CI. The gate is intentionally red: 6,289 strict parity failures, 74 static route/control failures, and 40 visual-contract failures. Typecheck, lint, 31/31 unit contracts, production build, v33 read-only plan, and core preflight pass; no full release pass or module completion is claimed. |
| 26 | TechDeck literal product restoration | Phase 22 shared services and pinned TechDeck source | Source/local implementation on `codex/phase-26-techdeck-literal-restoration`: corrected pinned-source inventory 354 primary records and 1,309 exhaustive facets; all 182 historical retirements reopened as 84 native and 98 shared-equivalent primary outcomes; zero TechDeck blockers, waivers, or strict compiler issues. Release v35, restored UI/API/public/headless surfaces, deterministic compliance ZIPs, isolated PostgreSQL, typecheck/lint/build, and local exact-host desktop/public/mobile/accessibility acceptance pass. The root strict gate remains red only on non-TechDeck inventory. Production backup/apply, live-provider delivery, deployed exact-host verification, data cutover, rollback, and deployment remain gates. |

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

Use the Phase 21 compiler output to triage the remaining non-TechDeck Phase 20 blocked inventory before
resuming deployment promotion or broad product work:

1. Resolve source authority for OutCall and the newer/divergent TorqueShed
   candidates without replacing the pinned snapshots blindly.
2. Review the highest-value `SOURCE_CAPABILITY_UNMAPPED` records and add exact
   OperatorOS targets plus automated compatibility evidence.
3. Review all remaining `BLOCKED_REVIEW` records individually. TechDeck's 182
   historical retirements are closed by Phase 26; implement a native/shared
   equivalent or obtain an exact owner waiver for other modules; do not waive
   categories.
4. Restore the 52 missing runnable FaultlineLab cases, TradeFlowKit's
   orange/navy visual contract, and TorqueShed's Expo product in scoped later
   phases with their required security, tenant, visual, and browser evidence.
5. Clear the 61 exact route-ID and 39 exact schema-ID gaps without replacing
   them with coarse file mappings.
6. Review and approve all three viewport baselines against pinned source only
   after the source-faithful screen is restored; never approve generated drift.
7. Keep the Phase 20 reproducibility check green and run the strict
   `corepack pnpm verify:parity` gate whenever an imported tree, target mapping,
   route, schema, test, or waiver changes. It is expected to remain red until
   every required Phase 20 blocker is resolved.

The Phase 18 deployment/provider checklist remains historical operational
evidence, but it cannot establish product parity while the Phase 20 ledger is
blocked.
