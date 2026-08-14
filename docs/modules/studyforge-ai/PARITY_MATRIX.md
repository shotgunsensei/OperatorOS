# StudyForge AI Phase 33 parity matrix

Status: source/local complete; production release blocked.

## Executable truth

The pinned source commit
`a607a9f34442b1d0f6bfffbf0293609529494825` contains 298 tracked files and
224 bounded product files (924,929 bytes). The generated ledger at
`docs/parity/modules/studyforge-ai.json` contains 317 exact source facets:

| State | Count |
| --- | ---: |
| `ACTIVE_NATIVE` | 192 |
| `ACTIVE_SHARED_EQUIVALENT` | 125 |
| `OWNER_WAIVED` | 0 |
| `BLOCKED` | 0 |

Facet types are 33 API endpoints, 2 assets, 1 background process, 119
component actions, 83 database columns, 11 database tables, 20 integrations,
11 public flows, 19 UI pages, and 18 UI routes. The executable JSON ledger and
the generated Phase 33 report are authoritative if this summary drifts.

## Restored native outcomes

- onboarding preferences, dashboard KPIs, current/longest streak, activity,
  exam countdowns, and account usage;
- user-owned folders and complete study sets with course/exam metadata;
- transactional generation of summary, key terms, flashcards, MCQs,
  short-answer questions, review sheet, and personalized study plan;
- deterministic golden generation and validated shared-AI generation with
  explicit retry/fallback/provider provenance;
- flashcard sessions with keyboard/touch known/learning state and progress;
- authoritative quiz attempts, scoring, review, retry, history, and trends;
- edit, search/filter, archive/restore, delete, duplicate, regenerate, JSON,
  and entitlement-gated CSV export;
- source-compatible `/app`, `/sets`, `/sets/new`, `/sets/:id`, learning,
  `/exams`, `/account`, and `/admin` routes.

## Shared-equivalent outcomes

OperatorOS supplies identity, sessions, tenants, roles, module grants,
subscription billing, Free/Pro/Tutor entitlement projection, shared AI/provider
configuration, usage, idempotency, activity/audit, platform administration,
public pricing/legal/contact surfaces, and shared job/runtime controls. No
child auth, Stripe authority, demo account, or provider-secret store executes.
OperatorOS SSO is the only browser sign-in path. Stripe child billing is excluded;
subscription and entitlement state comes from OperatorOS.

## Deliberate source reading

The source contains a Tutor plan flag but no group table, API, route, or usable
group UI. Phase 33 therefore has no invented group workflow and no waiver.
ADR-0037 supersedes ADR-0023 only where the earlier decision narrowed complete
source outcomes; its central-authority and attribution protections remain.

## Release boundary

Additive release v42 and all local Phase 33 gates pass. Production backup,
release apply, live provider readiness, deployed exact-host acceptance,
source-data reconciliation, restore/rollback, and traffic cutover remain
owner-controlled. Zero ledger blockers does not claim deployed state 5.
