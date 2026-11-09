# StudyForge replay intent binding, 2026-11-09

## Scope and source

The isolated `codex/studyforge-replay-nov09` candidate starts at frozen
`b79961f8e2bfe6d3ad277388d212de3c7d07f1d2`. The release candidate and separate
upgrade-rehearsal worktree are not changed. Runtime changes are confined to
`apps/api/src/routes/studyforge-phase33-routes.ts`; no client, dependency,
schema, ordered-release manifest or provider configuration changes are needed.
Source still requires the existing 68-step release. Production database state
has not been measured or changed by this repair.

Three existing tenant/user-scoped mutation keys now bind their target and intent:

- Quiz attempt: `quiz_id` and the normalized `{questionId, selectedIndex}`
  projection in existing `answers` JSONB. The existing advisory transaction
  lock and unique index remain. Answer array/object-key order and irrelevant
  extra properties do not change graded intent. Original validated answer
  order/properties remain stored and returned. Distinct valid question IDs and
  safe integer selections 0-5 are required; the pre-existing integer helper
  already rejected numeric strings. Existing VARCHAR identifiers remain
  case-sensitive. New malformed/duplicate entries fail 400 before replay.
- Flashcard session: `study_set_id` and server-controlled
  `session_type='flashcards'`. The actual `ON CONFLICT DO UPDATE WHERE` binds
  both fields atomically. No returned row means conflict, including for a
  competing insertion. Exact retry returns the same session and its current
  counters/completion state; it does not reset progress or reopen a session.
- Session card review: `session_id`, `card_id` and `learning_state`. Only a
  successful first insert updates progress/session counters. A conflicting
  insert is followed by a separate tenant/user/key SELECT, which can see a
  previously uncommitted winner under PostgreSQL READ COMMITTED. Any missing
  or mismatched binding fails closed.

Mismatches return only generic 409 `STUDYFORGE_IDEMPOTENCY_CONFLICT`, never
another request's stored result. Existing successful response shapes/statuses
remain: quiz 201/200 with `replayed`, session 201, card review 200 with
`replayed`. Request/session/module/write authority remains OperatorOS-owned.

## Ownership, lifecycle and legacy behavior

Quiz/session creation revalidates and SHARE-locks the currently owned,
nondeleted parent inside the transaction before returning an accepted result.
Quiz replay never reads current questions, rescores a revised quiz, consumes
another allowance or records another daily/shared event. Valid legacy answer
projections replay; malformed stored bindings return 409 without rewriting or
deleting history. Unkeyed legacy attempts remain unrelated to keyed retries.

Card review first locks the current owned, nondeleted set, then validates and
UPDATE-locks its session with an explicit binding to that parent. This keeps
the parent-before-session lock order consistent with session creation. Both
queries use inner joins; no nullable join side is locked. Completion is
rechecked after the session lock. Missing/foreign/deleted sets or cards and
completed sessions retain 404; a key cannot bypass those lifecycle checks.

The shared usage-event deduplication contract remains tenant/module/operation/
key, without user. New quiz events now use the server-derived bounded key
`studyforge.quiz_attempt:<persisted attempt ID>` and retain the same attempt ID
as their external reference. Two users reusing one client key therefore receive
distinct events. Active-source inspection found no consumer depending on the
old raw quiz key in shared events. No historical event is rewritten or backfilled:
previously coalesced history stays unchanged, and an accepted legacy retry does
not emit a new event. User-scoped request keys remain unchanged on attempt rows.

## Verification and provenance

Fresh local checks use Node 24.16.0 and only the canonical installed graph in
the unchanged `operatoros-dependency-nov09` sibling. Explicit external test
loader and TypeScript paths select that graph; there is no install, link,
fallback to older dependencies, downloaded package or lockfile change. Test
processes use an allowlisted environment without inherited database/provider
credentials and a process-local network blocker.

From the repair worktree, the exact external orchestration commands are:

```powershell
node ../evidence/studyforge-replay-nov09/run-check.cjs tests committed-tests
node ../evidence/studyforge-replay-nov09/run-check.cjs types committed-types
node ../evidence/studyforge-replay-nov09/run-check.cjs lint committed-lint
node ../evidence/studyforge-replay-nov09/run-check.cjs sql committed-sql
git diff --check
```

- **51/51 DB-free tests, zero failed/skipped**, across eight StudyForge files.
  Seventeen new actual-handler cases cover normalized/exact retries, mismatched
  intent/targets, malformed and legacy inputs, original result/payload retention,
  ownership/deletion/access/lifecycle, quota rollback, unchanged accounting and
  modeled simultaneous requests and two-user attempt-specific shared events.
  The fixture executes the real route module,
  write guard, usage reservation and daily helper. Identity/entitlement and
  persistence remain explicit synthetic boundaries, not signed-session proof.
- **Expanded strict types pass:** all API source plus both new regression
  files and their dependencies, using forward-slash include paths and no emit.
  Normal API project typing does not include tests; this expanded check does.
- **Scoped zero-warning lint passes** on the changed route and both tests.
- **Six exact session-upsert SQL checks pass** on disposable in-memory SQLite.
  The handler-generated INSERT/ON CONFLICT statement is executed unchanged;
  target lookup is synthetic. Frozen source reproduces both cross-target and
  changed-type acceptance, while the candidate rejects them with 409 and
  preserves counters and separate tenant/user keys. This is not PostgreSQL
  locking or concurrency evidence and uses no database service.
- Independent read-only source review found no remaining blocker after parent-
  before-session locking, response-payload preservation and prepared fixture
  corrections. Review does not substitute for unrun integration acceptance.

External `evidence/studyforge-replay-nov09` retains exact commands, resolved
compiler paths, source/test SHA-256 values, timestamps, logs and receipts.
Initial loader recursion/builtin resolution and transitive lint-resolution
failures remain alongside corrected successful runs; no checks were weakened.

## Explicit remaining gates

`studyforge-replay-binding-db.test.ts` has seven guarded PostgreSQL cases for
true concurrent quiz/session/card mutations, invisible conflict winners and
both session completion/review lock orderings and two-user shared-event keys.
The invisible-winner fixture
uses separate sessions and observes blocking at the INSERT, not an earlier FK
row lock. These tests are **TYPECHECKED ONLY, NOT EXECUTED**. Their setup invokes
the shared captured-pool URL disposable-target guard before any DDL or fixtures.

Real PostgreSQL syntax/locking/races, full aggregate release gates, production
build/start, deployed authenticated browser journeys, migrations, providers,
publication and deployment remain unperformed. No parity state is promoted to
production-ready. Rollback of this source-only patch requires no data rewrite;
it would restore the original unsafe replay behavior and is not a data repair.
