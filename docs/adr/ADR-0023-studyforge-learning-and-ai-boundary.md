# ADR-0023: StudyForge learning and AI boundary

Status: accepted for Phase 11C source/local implementation, 2026-07-26.

## Decision

StudyForge AI is the OperatorOS learning-material and practice module. It owns
tenant-scoped subjects/courses, authorized source material, flashcard decks,
quizzes, study plans, learner attempts, spaced-repetition progress, generation
provenance and learning analytics.

OperatorOS continues to own identity, credentials, sessions, tenants,
memberships, roles, subscription billing, entitlements, module launch, shared
AI provider configuration, usage and platform audit. The standalone login,
signup, account, Stripe, admin-user and session surfaces are not migrated.

Generated material is a draft until a server-enforced review and publish
transition. Every generated card and question citation is an exact substring
of the tenant-authorized source stored with its source ID and content hash.
StudyForge does not generate or persist unverifiable URLs, authors,
publications or attribution. Document bytes remain private shared attachments
and are usable only after authorization, signature/MIME validation and clean
scan state.

## Consequences

- Courses are modeled as tenant subjects with an optional course code.
- Private notes and scanned text/CSV/JSON documents are supported sources.
- The shared AI adapter is deterministic only in test environments and is
  disabled outside test unless the server has a configured provider.
- A monthly per-user generation limit is enforced from the append-only shared
  usage ledger. Idempotent replay does not consume the limit twice.
- Dashboards and exports are derived from persisted records.
- Standalone templates and exam countdowns are represented through reviewed
  sources/plans and target dates rather than importing marketing fixtures.
- Contact, marketing, child billing and child administration remain excluded.
