# OperatorOS module parity index

- Assessment date: 2026-07-18
- Phase 5 base commit: `9ba9d09`

Rule: the state is the highest fully satisfied consolidation state, not the
number of native features currently visible.

States: **1 Registered**, **2 Source imported**, **3 Authority conformed**,
**4 Approved workflows fully migrated**, **5 Deployed and verified**.

| Module | State | Source commit/provenance | Active OperatorOS features | Missing parity | Data migration state | Production verification |
| --- | ---: | --- | --- | --- | --- | --- |
| TradeFlowKit | 4 | Recovered `C:\Dev\TradeFlowKit` commit `6d0c13df5e324f6aba9cdf2cf14a550d0cf0ca55`; 317 shared product files match the quarantined snapshot byte-for-byte | Lead conversion into shared Directory customers; numbered jobs and first-class dependent tasks; comments/tags/private attachments/activity; quotes/public decisions; idempotent invoices; partial manual and deterministic test-provider payments; customer portal/documents; shared messaging; settings; real analytics; CSV export; deep links | No approved source/local workflow gap; ADR-0010/0011 exclude projects and unsafe/duplicate authority surfaces. Production provider enablement and deployed acceptance remain gated | Deterministic dry-run planner, stable source mappings, authority exclusions, reference/count/financial reconciliation implemented; no production export applied and apply/cutover remains a separate human gate | TradeFlowKit-focused 29/29 and complete API 687 pass/0 fail/6 skip, full production build/runtime, 17-step DB apply, backup/restore, valid-token public-route smoke, and production-host SSO 2/2 pass locally; deployed TradeFlowKit workflow/public-document/cutover smoke not run, so not state 5 |
| TechDeck | 4 | Recovered clean `C:\Dev\Tech-Deck` commit `8125f8d89d8d39d60a50c8061a26133a0c917792`; 265 common files match the quarantined snapshot byte-for-byte, 36 were previously adapted, and 122 exist only in the recovered source | Directory-linked tickets/comments/time; typed configuration inventory; network/IPAM topology; lifecycle; versioned documentation/runbooks/backlinks; shared private attachments; evidence metadata; deterministic reports; real dashboards and deep links | No approved source/local workflow gap. Remote execution, secrets, duplicate authority/billing, anonymous intake, scheduling, and invoicing are deliberately excluded by ADR-0012/0013/0014 and the parity matrix; deployed acceptance/provider/cutover remain gated | Deterministic dry-run planner with stable fingerprints, mappings, authority exclusions, duplicate/reference/count reconciliation; fixture resolves 12/12 references with zero missing; apply/cutover remains a separate human gate | TechDeck-focused 16/16, new Phase 5 5/5, release/deep-link 6/6, dry-run CLI, typecheck/build/runtime, 18-step DB apply, anonymous deep-link smoke, and production-host SSO 2/2 pass locally; deployed workflow/public verification and data cutover not run, so not state 5 |
| PulseDesk | 4 | Recovered clean `C:\Dev\PulseDesk` commit `937849471e489ed23db2a263d04160a388402740`; 181 current tracked files match the quarantined snapshot byte-for-byte, 30 differ, and 17 newer source files are absent from it | PHI-minimized healthcare operations: shared Directory clients/facilities/requesters; departments; operational assets; numbered tickets; queues/teams/assignments; internal notes and requester replies; shared attachments; time/SLA; vendor, supply and facility coordination; knowledge/tags/saved views/preferences; real dashboards, bulk actions and deep links | No approved source/local workflow gap. ADR-0015 excludes EHR/clinical data, network/configuration/credential authority, identity, billing and unsafe provider surfaces; deployed acceptance and authorized data cutover remain gated | Deterministic privacy-review dry-run planner with stable source mappings and fingerprints, Directory consolidation, authority/provider/file exclusions, duplicate/reference/count reconciliation; fixture resolves 34/34 references with zero missing or privacy findings; apply/cutover remains a separate human gate | PulseDesk-focused 37/37, final API 706 pass/0 fail/6 skip, workflow restart persistence, dry-run CLI, typecheck/build/runtime, clean 19-step DB apply, eight path-preserving deep-link redirects and production-host SSO 2/2 pass locally; deployed workflow/privacy-reviewed data cutover not run, so not state 5 |
| TorqueShed | 3 | `c33ade5cef525d62d371a63946b814c58a72a4a7` | Tenant-scoped diagnostic-case workflow | Vehicles; maintenance; diagnostic sessions; codes/tests/measurements; repairs/verification; Torque Assist ledger; marketplace/community; diagnostic deep route | No standalone-data importer/reconciliation | Local build, DB, SSO pass; required E2E workflow/deep route fail; deployed target unverified |
| FaultlineLab | 3 | `46877aae35565149ccf4f4988dd94627fc6bb92b` | Tenant-scoped lab/evidence workflow | Full authored/published challenge and completion/evidence parity | No standalone-data importer/reconciliation | Local build/DB/SSO surface pass; deployed target unverified |
| Ninja Pool Hall | 3 | `62439c4018ec551ce2891800351200c8ab2cb9e7` | Free Shoot physics plus bounded persistent practice summaries | Approved game modes, progression/results, and remaining source parity | No standalone-data importer/reconciliation | Local build/DB/SSO surface pass; deployed target unverified |
| BrandForgeOS | 3 | `5e78bc2ee6c8086ddd589bb7416f1d4560ffbb4e` | Tenant-scoped campaign production board | Brands, content/assets, generation/review, exports, and full source parity | No standalone-data importer/reconciliation | Local build/DB/SSO surface pass; deployed target unverified |
| SnapProofOS | 3 | `26bded38c13b5b6361d407462c68052b0c30613d` | Tenant-scoped evidence/verification ledger | Secure capture/upload, chain of custody, integrity, reports/exports, retention, integrations | No standalone-data importer/reconciliation | Local build/DB/SSO surface pass; deployed target unverified |
| StudyForge AI | 3 | `a607a9f34442b1d0f6bfffbf0293609529494825` | Tenant-gated flashcard-session MVP | Courses/sources/decks/quizzes/plans/spaced repetition/AI citations/metering/import-export/analytics | No standalone-data importer/reconciliation | Local shared-runtime surface only; deployed target unverified |
| Ninja Launch Kit | 3 | `30bd1abc05846926e97bc7b26c5b7d6625e8f161` | Tenant-gated scaffold MVP | Product-boundary ADR; venture plans, milestones, artifacts/assets, readiness rules, exports, collaboration | No standalone-data importer/reconciliation | Local shared-runtime surface only; deployed target unverified |
| CallCommand AI | 3 | `d49434e1d641d62cc141591c7208539a7afbf11e` | Partial tenant-gated telephony workflow; signed Twilio callbacks use the shared verified receipt/deduplication/retry ledger | Consent/suppression, campaigns/queues, provider calls, recording controls, assistance, follow-up, complete analytics and abuse controls | No standalone-data importer/reconciliation | Local shared-runtime/provider-test surface only; deployed target unverified |
| Ninjamation | 1 | No canonical source observed | Tenant-gated native shell/API | Canonical source/spec, product-boundary ADR, approved persistent workflows, migration and complete verification | Not applicable until source/spec closure | Local shell only; no parity or deployed claim |
| OutCall | 1 | No canonical source; imported directory is placeholder evidence only | Registry reservation and fail-closed disabled callback | Distinct/merge/cancel ADR; no workload may be activated before decision and full implementation | None | Disabled locally and in registry; no production-readiness claim |

## Cross-cutting gaps

- TradeFlowKit, TechDeck and PulseDesk provenance is commit-pinned. Future
  parity work must recover or explicitly baseline the remaining standalone
  sources before accepting their state-4 scope.
- TradeFlowKit and TechDeck have deterministic dry-run planners, but no enabled
  module has an authorized standalone-data apply/cutover reconciliation.
- Local production-host SSO passes, but the deployed target has not been
  verified at this source revision.
- The 2026-07-18 Phase 3 backup/restore rehearsal includes the Phase 2 directory
  and Phase 3 shared-service schemas and matched all 10 shared tables. Public
  deployment and production provider acceptance remain open.
- The Phase 4 rehearsal restored 94 public tables, including all 17
  `tradeflowkit_*`, 9 Directory, and 10 shared-service tables, then accepted the
  full 17-step release on the restored database. This is disposable local
  recovery evidence, not a production cutover.
- The current Phase 5 release adds the ordered `techdeck_tables` step for 18
  total additive steps. Repeated apply and compiled runtime verification pass
  on disposable PostgreSQL 16; no production backup, apply, or cutover was
  attempted.
