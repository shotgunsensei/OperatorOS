# ADR-0025: CallCommand AI, OutCall, consent, and provider boundary

Status: accepted for Phase 11E source/local implementation, 2026-07-27.

## Context

The commit-pinned CallCommand AI source contains useful inbound receptionist,
intake, channel, transfer, call-record and follow-up concepts. It also contains
standalone identity, billing, integration credentials, ingestion tokens,
deterministic demo AI, simulated email delivery, unimplemented SIP adapters and
user/queue transfer placeholders. The prior OperatorOS shell exposed only an
outbound Twilio test-call MVP. When Twilio was absent it persisted a fake
completed stub call, and its API/UI exposed a provider recording URL.

OperatorOS also reserves an `outcall` module. Without a product boundary,
CallCommand AI could become an unrestricted autodialer or duplicate a future
campaign product. Calling and recording have consent, suppression, privacy,
abuse, cost and jurisdiction risks that require server authority.

## Decision

CallCommand AI is the consent-first call-operations and assisted-reception
module. It owns tenant channels, receptionist/intake profiles, bounded intake
fields, review-only external or voicemail transfer-target configuration,
consent evidence, do-not-call suppression, inbound/outbound call records, safe
provider events, operator dispositions, reviewed follow-up drafts and analytics
derived from persisted records. Transfer execution remains disabled until
ownership verification and destination authorization have a reviewed contract.

The shared OperatorOS Directory remains authoritative for business contacts.
CallCommand does not duplicate contact lists or expose list/campaign dialing.
Its bounded inbound receptionist accepts only signed Twilio callbacks, selects
an active tenant profile from the dialed tenant line, records a masked call
record, and accepts one DTMF purpose choice. It does not collect or store caller
speech, transcript content, recording data, or raw provider payloads.

Phase 11E outbound contact is restricted to support, appointment and requested
service-callback purposes. Before every provider request, the server resolves
the tenant and entitlement from the OperatorOS session, requires an active
same-purpose consent record, checks the tenant suppression ledger, validates an
active channel/profile, applies a per-tenant/user rate limit and enforces an
idempotency key. Suppression always wins over consent.

The former `OutCall` reservation in this decision is superseded by ADR-0027.
OutCall is a separate verified-self exit-assistance and personal-safety
product, not an outbound campaign product. Bulk dialing, purchased lists, cold
outreach, predictive dialing, autonomous campaigns and consent inferred from
client input are not CallCommand AI or OutCall features.

Twilio is the only approved live provider in Phase 11E. Production fails closed
when it is not configured. The deterministic adapter is enabled only when both
`APP_ENV=test` and `CALLCOMMAND_TEST_ADAPTER=enabled`; it never contacts an
external number and is labeled as a local acceptance adapter.

Provider callbacks use the exact configured public base URL, Twilio signature
verification and the shared verified webhook receipt/deduplication/retry
ledger. Safe callback projections exclude raw provider payloads, phone numbers,
transcripts, recording URLs and credentials. Provider recording URLs are never
stored or returned. Phase 11E recording callbacks are replay-audited and
rejected into a safe event; they cannot activate recording storage or retain a
recording SID. Any future playback/download requires a separately approved
jurisdiction policy, explicit consent evidence, retention enforcement and an
authorized server proxy.

Recording is forced off per channel. Requests to enable it fail closed.
Transcription, AI assistance, transfer execution and message delivery are not
claimed complete until separate provider-backed, reviewed implementations pass
acceptance. Follow-ups in Phase 11E are real persisted drafts, not simulated
sends.

OperatorOS remains the sole authority for identity, sessions, tenants,
memberships, roles, entitlement, billing, module launch, provider credentials,
shared usage, audit and global logout. CallCommand AI exposes no child login,
password reset, billing, subscription, admin or integration-secret surface.

## Data and security consequences

- Every table and relationship carries the trusted session tenant ID.
  Composite tenant foreign keys reject cross-tenant relationships.
- Raw E.164 numbers are server-only operational data. API responses expose a
  masked value and omit the fingerprint and raw number.
- Consent and suppression changes are audited. Consent can expire or be
  revoked; suppression is independently durable.
- Server authorization protects every first-party read/write. Provider
  callbacks are the only unauthenticated routes and accept only signed input.
- Call events and webhook receipts are append-oriented. Mutable operational
  state uses constrained status values and timestamps.
- Provider errors are bounded and scrubbed. Credentials, full provider
  responses and message/transcript bodies are excluded from logs.
- Medical and automotive profiles may coordinate administrative intake only;
  they may not diagnose, prescribe or represent emergency services.

## Migration and rollback

The source snapshot is read-only evidence pinned to
`d49434e1d641d62cc141591c7208539a7afbf11e`. Phase 11E provides a deterministic
dry-run plan only. It maps reviewed channels, profiles, review-only external
targets and consent-reconciled call records while excluding target execution,
child authority, credentials, raw payloads, recordings/transcripts, demo output,
simulated delivery and unimplemented providers.

Apply requires an approved tenant/user map, consent and suppression
reconciliation, recording-retention/jurisdiction review, backup, source write
freeze, row/hash thresholds and a rollback rehearsal. The additive idempotent
release keeps the legacy `module_call_logs` table as historical data but removes
it from active CallCommand routes and UI. No silent conversion occurs.
Rollback uses restore-to-new-database and traffic switching.

## Superseded records

This ADR supersedes the partial telephony-MVP interpretation in the module
status documents and the stub-call/recording-URL behavior formerly active in
the shared shell. It does not activate or define the reserved OutCall module.
