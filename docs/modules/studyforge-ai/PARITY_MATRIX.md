# StudyForge AI Phase 11C parity matrix

Assessment date: 2026-07-26

Candidate status: source/local state 4 accepted on
`codex/phase-11c-studyforge-ai-completion`. State 5 additionally requires the
exact revision deployed and accepted on the target environment.

## Provenance

The clean `C:\Dev\Study-Forge` checkout and quarantined snapshot resolve to
`a607a9f34442b1d0f6bfffbf0293609529494825`. The snapshot records 298 tracked
files, 224 retained files, 924,929 bytes and zero high-confidence secret
findings. Its runtime, dependencies and migrations are not executed.

## Capability disposition

| Source capability | Source reality | Phase 11C disposition |
| --- | --- | --- |
| Login, signup, users, sessions | Child email/password and session authority | Exclude; OperatorOS SSO, host-only session and tenant membership only |
| Stripe billing and limits | Child checkout, portal and subscription state | Exclude; OperatorOS billing/entitlement and shared usage limit |
| Admin users/stats | Child global role and user administration | Exclude; OperatorOS platform/tenant administration only |
| Folders, subjects, courses | User folders plus string subject/course fields | Tenant-scoped subjects with optional course code |
| Notes and source material | Notes stored directly on a study set | Private source records; notes or authorized scanned shared attachments |
| Study sets | Generated aggregate containing all learning material | Separate source, deck, quiz and plan records with composite tenant references |
| Flashcards | Persistent cards with simple new/learning/mastered status | Draft/review/publish decks, editable cards, exact source excerpts and per-user spaced repetition |
| Quizzes/attempts | Persistent questions and user attempts | Server-hidden correct answers, server-authoritative grading and persistent attempts |
| Study plan/sessions | Generated dated sessions and completion toggle | Draft/review/publish plan with versioned persistent completion |
| AI generation | Source server generation tied to child plan limits | Shared server adapter, fixed grounding prompt, exact-excerpt verification, idempotency and shared usage |
| Review sheet/key terms | Generated JSON inside aggregate | Approved material is represented through editable deck/quiz content; no unreviewed output is published |
| Dashboard/streak/score trend | Partially derived from persistent activity | Persisted attempts, completion and review due-state only |
| Import/export | Browser data-URL JSON export; no migration reconciliation | Server JSON/CSV export and deterministic pinned dry-run migration planner |
| Templates | Static examples | Exclude as product data; users may save real source/deck records |
| Exam countdowns | Persistent countdown metadata | Plan target date and sessions; no duplicate counter authority |
| Contact/marketing pages | Public product-site surfaces | Exclude from module workload |

## Completion boundary

OperatorOS SSO, tenant entitlement, viewer denial, cross-tenant
non-enumeration, persistent workflows, exact citation validation, uploaded
content authorization, provider idempotency, limits, migration dry run,
production build/start, health, deep links, return and logout are required for
local state 4. State 5 additionally requires deployed-target SSO, workflows,
health, persistence and approved data reconciliation/cutover.

Fresh local evidence is recorded in `VERIFICATION.md`: 14/14 focused tests,
801/801 clean API aggregate, clean and idempotent 25-step release, production
build and core preflight, compiled direct/proxied health and readiness, and
the complete production-host browser matrix at 7/7.
