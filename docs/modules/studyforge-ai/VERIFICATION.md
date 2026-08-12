# StudyForge AI Phase 33 verification

Evidence date: 2026-08-12. All database and browser work used disposable local
infrastructure. No production environment or external AI provider was touched.

## Passing local evidence

| Gate | Result |
| --- | --- |
| Workspace TypeScript | PASS |
| Root lint | PASS |
| Phase 33 deterministic/static contracts | PASS 8/8 |
| Deterministic golden fixture | PASS; SHA-256 `f87e7295a49af81a0c18b6c84018a1f4d0962c43aa7a384ba285e2b84364eb1e` |
| Phase 33 PostgreSQL journeys | PASS 6/6 |
| Combined legacy plus Phase 33 StudyForge regression | PASS 28/28 |
| Shared integration aggregate | PASS 28/28 |
| Database release v42 clean apply and immediate reapply | PASS |
| Production web build | PASS |
| Compiled local exact-host Playwright | PASS 2/2 |
| Exact source ledger/report gate | PASS; 317/317 active/shared-equivalent |

The PostgreSQL suite proves transactional complete generation and replay,
failure cleanup, role and user/tenant isolation, archive/restore/delete,
quiz/flashcard/plan history, Free/Pro/Tutor gates, concurrent credit
exhaustion, activity/streak idempotency, exports, countdown/time-zone behavior,
and restart-visible records.

The compiled exact-host suite runs the production API and web artifacts behind
the canonical host proxy. It proves OperatorOS SSO, notes to every generated
artifact, flashcard and quiz completion, review/plan/export, persisted results,
source-compatible record routes, labels/accessibility, no placeholders, and no
horizontal overflow at 1440, 900, and 390 pixels.

## Honest aggregate status

The broad API aggregate is not green: 979 passed, 29 failed, and 6 skipped
across 1,014 tests. The failures are existing unrelated cross-product
contracts; the focused Phase 33 and shared integration suites pass. Phase 33
does not report the broad aggregate as a pass or silently alter unrelated
products to manufacture one.

## Remaining state-5 gates

- Freeze the exact reviewed commit/build and create a production database
  backup before applying cumulative release v42.
- Configure and accept the real shared AI provider when AI-required mode is
  enabled; local tests used deterministic and controlled provider adapters.
- Run deployed exact-host SSO, Free/Pro/Tutor limits, complete generation,
  learning, export, accessibility/mobile, restart, backup/restore, and rollback
  acceptance.
- Authorize and reconcile any standalone source-data import separately.
