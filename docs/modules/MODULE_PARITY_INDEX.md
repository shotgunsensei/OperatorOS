# OperatorOS module parity index

- Assessment date: 2026-07-18
- Baseline code commit: `ae48d6b200164051528f4d03fe2ee035a3c3ad19`

Rule: the state is the highest fully satisfied consolidation state, not the
number of native features currently visible.

States: **1 Registered**, **2 Source imported**, **3 Authority conformed**,
**4 Approved workflows fully migrated**, **5 Deployed and verified**.

| Module | State | Source commit/provenance | Active OperatorOS features | Missing parity | Data migration state | Production verification |
| --- | ---: | --- | --- | --- | --- | --- |
| TradeFlowKit | 3 | Legacy import; upstream commit was not recorded (provenance gap) | Leads; shared organizations/contacts/sites with customer profiles; jobs; quotes; invoices; manual payments; native deep links; private job attachments through shared scan/idempotency/usage/activity/outbox services | Projects/tasks; source-approved messaging/public payments/analytics and remaining route parity | Directory mapping documented; no standalone-data importer/reconciliation | Local build, DB, SSO, directory persistence/isolation, and shared attachment proof pass; deployed target unverified |
| TechDeck | 3 | Legacy import; upstream commit was not recorded (provenance gap) | Tickets; shared organizations/contacts/sites with managed-client profiles; assets; derived alerts; approval-gated runbooks; operations deep links | VLAN/subnet/network topology; documents/evidence; signed agent execution boundary; remaining source parity | Directory mapping documented; no standalone-data importer/reconciliation | Local build, DB, SSO, directory browser persistence/deep links/isolation pass; deployed target unverified |
| PulseDesk | 3 | Legacy import; upstream commit was not recorded (provenance gap) | PHI-minimized departments/requests plus shared organizations/contacts/sites with PHI-restricted service-client profiles | Asset/ticket/note/reply/time/SLA terminology and workflows require healthcare-domain ADR and implementation | Directory mapping documented; no standalone-data importer/reconciliation | Local build, DB, SSO, directory browser persistence/isolation pass; deployed target unverified |
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

- Core legacy imports lack immutable upstream source commit metadata. Phase 0
  records this as a provenance defect; future parity work must recover or
  explicitly baseline the source before claiming complete migration.
- No enabled module has a rehearsed standalone-data importer and reconciliation
  report.
- Local production-host SSO passes, but the deployed target has not been
  verified at this source revision.
- The 2026-07-18 Phase 3 backup/restore rehearsal includes the Phase 2 directory
  and Phase 3 shared-service schemas and matched all 10 shared tables. Public
  deployment and production provider acceptance remain open.
