# StudyForge AI Phase 11C migration and cutover

Status: deterministic dry-run planning only. No production apply, source write
freeze, deployment or traffic cutover is authorized.

## Source and mappings

- Source commit:
  `a607a9f34442b1d0f6bfffbf0293609529494825`
- `folders` -> reviewed subject/course organization
- `study_sets.notes` -> private source records
- `study_sets` -> source plus deck/quiz/plan records
- `flashcards` -> cards
- `quiz_questions` -> questions
- `quiz_attempts` -> attempts after OperatorOS user mapping
- `study_sessions` -> plan sessions
- `study_activity` -> recompute from accepted attempts, reviews and sessions

Users, password hashes, sessions, Stripe events, subscriptions, child roles
and admin authority are excluded.

## Repeatable dry run

Use:

```powershell
corepack pnpm import:studyforge:dry-run -- --file <authorized-export.json>
```

or the tenant-authorized
`POST /v1/modules/studyforge-ai/import/dry-run` route. Both require the pinned
source commit and produce a stable export hash, counts, mappings, exclusions
and blockers. No apply mode exists in Phase 11C.

## Future apply and cutover gate

1. Approve OperatorOS tenant/user mappings and freeze standalone writes.
2. Record source commit, schema version and final export SHA-256.
3. Back up OperatorOS using `docs/DATABASE_BACKUP_RESTORE.md`.
4. Import in dependency order with stable source references and per-batch
   transactions.
5. Reconcile folders, sets, cards, questions, attempts, sessions, timestamps,
   archived records and attachment byte hashes.
6. Regenerate no content during migration; retain original source/output
   provenance and require human review.
7. Run tenant isolation, role denial, SSO, return, deep-link, logout,
   persistence, AI-provider and health acceptance on the exact deployment.
8. Decide cutover or restore to a new database and switch traffic. Never use a
   destructive down migration.
