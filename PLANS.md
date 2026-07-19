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
| 4 | TradeFlowKit state 5 | Phases 2-3 | Pending |
| 5 | TechDeck state 5 | Phases 2-3 | Pending |
| 6 | PulseDesk state 5 with healthcare-operations/PHI boundary resolved | Phases 2-3 | Pending |
| 7 | TorqueShed vehicle, maintenance, diagnostic, repair, and verification foundation | Phases 2-3 | Pending |
| 8 | Torque Assist deterministic adapter, safety controls, metering, and append-only token ledger | Phases 3 and 7 | Pending |
| 9 | TorqueShed marketplace and community | Phases 3, 7-8 | Pending |
| 10A | FaultlineLab state 5 | Phases 2-3 | Pending |
| 10B | Ninja Pool Hall state 5 | Phases 2-3 | Pending |
| 11A | BrandForgeOS state 5 | Phases 2-3 | Pending |
| 11B | SnapProofOS state 5 | Phases 2-3 | Pending |
| 11C | StudyForge AI state 5 | Phases 2-3 | Pending |
| 11D | Ninja Launch Kit state 5 after source/product alignment ADR | Phases 2-3 | Pending |
| 11E | CallCommand AI state 5 with consent, signed callbacks, and provider controls | Phases 2-3 | Pending |
| 12A | Canonical Ninjamation source/spec decision and state-5 implementation | Phases 2-3 | Pending; source unknown |
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
That direction permits Phase 4 source work; it does not authorize deployment,
production data mutation, promotion, or a production-ready label. Before any
public promotion, deploy the reviewed cumulative revision through `.replit`,
require 47/47 from the read-only verifier, and run authenticated deployed SSO,
return, persistence, deep-link, refresh, entitlement, tenant-isolation,
authorization, logout, provider, backup/restore, and module acceptance. Record
the exact deployed commit in `docs/CURRENT_RELEASE_GATE.md` and never weaken
the contract to make it pass.
