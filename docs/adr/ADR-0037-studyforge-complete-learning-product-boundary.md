# ADR-0037: StudyForge complete learning product boundary

Status: accepted for Phase 33 source/local implementation, 2026-08-12.

Supersedes ADR-0023 where that decision represented folders, aggregate study
sets, complete artifact generation, exam countdowns, streaks, templates, plan
state, and account limits through narrower substitutes. ADR-0023's identity,
tenant, billing, provider, attribution, and private-source protections remain in
force.

## Context

The pinned StudyForge source at
`a607a9f34442b1d0f6bfffbf0293609529494825` contains complete persisted
learning outcomes beyond the Phase 11C deck/quiz/plan slice. Security and
product-boundary retirements cannot count as parity when a safe OperatorOS
implementation can preserve the source user outcome.

## Decision

StudyForge owns user-scoped folders and study sets inside an OperatorOS tenant.
A set may retain raw authorized notes, course and exam metadata, a summary, key
terms, flashcards, multiple-choice questions, short-answer questions, a review
sheet, and a personalized dated study plan. It also owns flashcard learning
sessions, authoritative quiz attempts and review, score history, exam
countdowns, activity/streak aggregates, archive/restore/duplicate/regenerate,
and real JSON or entitlement-gated CSV exports.

Set creation and regeneration are transactional. One idempotency boundary
covers the business set, all generated children, and its usage debit. Advisory
locks and conditional counter updates enforce active-set, generation, and quiz
limits without race overrun. Failed generation leaves no orphaned artifacts.

Generation supports a deterministic local implementation and the shared
OperatorOS AI provider. Provider output must match the strict artifact schema
and every cited excerpt must exist in the authorized source. Auto mode may use
the deterministic fallback and records the failed provider attempt plus
fallback provenance; AI-required mode fails honestly. Prompt/version and usage
evidence may be retained, but sensitive note bodies are not logged.

Free, Pro, and Tutor behavior is projected from OperatorOS entitlements and
server-side usage. OperatorOS remains the only authority for identity,
sessions, tenants, roles, module access, subscription billing, credits,
providers, platform administration, shared activity, and audit. StudyForge has
no child authentication, Stripe authority, demo-account dependency, or local
plan override.

The pinned source exposes a Tutor plan flag but no group table, route, or usable
group workflow. Phase 33 therefore does not invent tutor groups. A future group
product requires source evidence or a separate approved product decision.

## Consequences

- Tenant guards and user ownership prevent cross-tenant and same-tenant
  cross-user enumeration of private learning records.
- Date-only countdown calculations use the persisted IANA learner time zone;
  daily activity and streak updates are idempotent and concurrency-safe.
- Source-compatible record routes resolve the real persisted set rather than a
  dashboard substitute.
- Static templates are reviewed generation starting points, not a fabricated
  marketplace.
- Additive database release v42 is required before the Phase 33 runtime may be
  promoted.

## Migration and rollback

The imported application stays read-only evidence. Any production source-data
move requires an authorized frozen export, explicit OperatorOS tenant/user
mapping, hashes and row reconciliation, a target backup, and a separate apply
decision. Rollback restores into a new database and switches traffic; Phase 33
does not add a destructive down migration.

## Release gates

Source/local completion does not authorize deployment. The owner must freeze
the exact commit/build, back up and apply release v42, verify configured shared
AI behavior, run deployed exact-host SSO and complete learning journeys for
Free/Pro/Tutor, prove restart persistence and backup/restore, and record a
rollback decision before state 5.
