# ADR-0039: CallCommand complete telephony and automation boundary

- Status: Accepted for source/local release candidate
- Date: 2026-08-13
- Decision owners: OperatorOS product and platform owners
- Supersedes: the CallCommand recording, transcription, live receptionist, flow, automation, switchboard, and provider-execution retirements recorded under the Phase 11E reduction

## Context

The pinned CallCommand source contains a complete call-intelligence and live-telephony product. Phase 11E retained a deliberately smaller consent-first call shell and treated recording, transcription, live AI intake, flow orchestration, action dispatch, and real transfer as product-boundary retirements. Under the owner-controlled literal restoration contract, a secure implementation must preserve the source user outcome rather than count removal as parity.

CallCommand also cannot regain child identity, billing, tenant, secret, or provider authority. It must use OperatorOS membership and entitlements, shared provider configuration, protected attachment storage, shared outbound webhooks, shared usage/audit, and one cumulative database release.

## Decision

Release v44 adds tenant-scoped CallCommand persistence for flow versions/traces, live sessions, ingestion tokens/events, upload intents, automation rules, generated work, action runs, transfers, reports, and usage counters. Existing Phase 11E call, event, consent, suppression, profile, channel, target, and follow-up records remain the stable audit spine.

Twilio voice callbacks verify signatures before processing and replay-protect provider events. Consent is explicit and recording-dependent; decline continues without recording, while no response ends the call. Business-hours and all source after-hours behaviors produce real TwiML. Recording bytes enter shared scanned storage, transcription uses a configured server-side provider, and missing providers return honest unavailable states.

Receptionist and analysis AI use schema-constrained shared provider calls. Deterministic intake and analysis are complete, auditable product paths and test fixtures; they are never represented as external provider delivery. Caller phone from Twilio remains authoritative over model extraction.

Flows are immutable-versioned graphs with validation, ordered traces, supported actions, and a fifty-step loop guard. Ticket, lead, task, assignment and priority actions persist locally. Email and signed webhook/Slack actions use shared adapters. Live transfer succeeds only when Twilio accepts the Calls API redirect.

OperatorOS remains the sole identity, tenant, role, entitlement, billing, provider-secret, usage, activity, and platform-admin authority. Child sign-in, billing, user ownership and raw integration secrets are shared-equivalent outcomes rather than duplicated systems.

## Consequences

- All 589 compiler-derived source facets can be active native or shared-equivalent with zero security-retirement credit and zero waiver.
- Production provider configuration, real call/transfer acceptance, backup/apply, deployed exact-host validation and rollback remain external release gates.
- Protected audio is never exposed through a provider URL or public object URL.
- Provider-dependent actions may fail or remain unavailable; they cannot report success without provider confirmation.
- Schema evolution remains cumulative, additive and immediately reapplicable.
