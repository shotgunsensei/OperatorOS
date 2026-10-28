# CallCommand MSP support intake — 28 October 2026

Status: isolated local implementation; fresh PostgreSQL and live acceptance remain open.
Base: `beaaf1dbccd2261bf57139e32104bf45d078627d`; branch
`codex/callcommand-support-oct28`. The frozen quality/Customer Workspace candidates,
current GitHub main and Replit history are preserved. This phase is not included
in the original quality pass's test totals. No migration is added.

## Supported journey and limits

The existing signed MSP inbound route still resolves an exact destination and
trusted originating line, then collects SupportLink by DTMF. Only the resulting
A1 organization/contact association can enter this new natural-voice path.
Caller-reported name/company/number never create or change Directory identity.
A1 association does not authorize device, identity, billing or privileged actions.

After successful association, the source can hand off to existing OpenAI Realtime
SIP when the existing tenant realtime setting, active profile/published flow,
server-configured support-email action, module entitlement, managed-number
health, lifecycle/billing and capacity gates all pass. Current organization,
contact and verified/cooldown-complete line are rechecked. Consent-required
transcription uses the existing signed consent route before SIP. This bounded
MSP slice does not initiate recording; recording-enabled configurations retain
the legacy fallback. Do not disable consent/recording controls to make a test pass.

The AI identifies itself as an AI assistant, asks one concise question at a time,
allows interruption, and collects name, company, callback with country code,
general technical issue and business impact. A refusal is represented explicitly.
Saving creates a bounded snapshot; caller-reported readback confirmation must
match that snapshot's revision. Corrections require another readback. This is
not independent audio confirmation or identity authentication.

`submit_support_request` records the existing tenant/organization/contact-bound
MSP local case and queues the server-selected email through the existing durable
outbox. Repeated tool IDs retain one local case and the existing per-call email
identity. The selected email path does not also enqueue BMS synchronization;
the local BMS status is BLOCKED, not a claimed external ticket. Existing legacy
BMS intake remains available through its original flow.

A human request bypasses further intake questions and uses the existing offered,
verified transfer alias. An early transfer attempt does not consume the primary
ticket email with partial details. Only a confirmed local MSP case can submit
that email. Incomplete/disconnected intake remains a local call/session record
for follow-up; automatic partial-case/email completion is not implemented here.
Unrecognized A0 callers retain the existing restricted callback/manual-support
route. They do not receive new natural-voice association or automatic actions.

## Corrections and trust boundaries

- MSP webhooks now reuse the existing tenant-aware Twilio verifier and known-call
  binding. Legacy unmapped channels retain that verifier's existing fallback.
- MSP realtime exposes intake, support submission and existing call control;
  generic CRM/task/webhook/Slack and all privileged automation are absent.
- New snapshots use existing live-session JSON and existing call fields. All SQL
  uses trusted tenant/call IDs; ownership, current authority and capacity fencing
  remain in place. No public route takes a model-selected destination.
- AI instructions prohibit collecting passwords, one-time codes, payment or
  patient details. Obvious credential disclosures in structured fields are
  rejected without echoing them. This is not a complete PHI/DLP or audio-redaction
  system; no automatic-redaction promise is made.
- Queueing, provider acceptance, mailbox receipt and PSA ticket creation remain
  distinct. A local reference proves local intake only. Neither email provider
  acceptance nor carrier REFER acceptance proves a ticket or a human answer.
- The existing A0 manual-support path no longer labels itself TRANSFERRED when
  no provider transfer took place. It records completed manual follow-up instead.
- General/sales/medical/field-service calls do not acquire a new structured-intake
  requirement. Existing product pricing, entitlements and module parity counts
  are unchanged.

## Verification receipt

Run the scoped sterile harness from the task workspace; exact commands, final
counts, failed baselines, file hashes and installed-package provenance are bound
in `evidence/callcommand-oct28/CANDIDATE.json` after final verification. It uses
existing installed assets, inherits no provider credentials and blocks network
access. The local dependency junction attempts were denied and were not retried;
the harness resolves existing installed modules without links or installation.

The DB-free suites include intake/confirmation, MSP gates, adapter composition,
Twilio number controls, realtime protocol and MSP/commercial domain/static
regressions. Strict test compilation, API project types, scoped zero-warning
lint and emitted API/SDK/profile/runner compilation are separate checks. They
are not a canonical dependency reinstall, complete platform release gate,
fresh SQL concurrency proof or real voice/PSA acceptance.

`callcommand-msp-realtime-db.test.ts` is prepared for the shared disposable-DB
guard and starts after existing signed MSP association. It uses actual registered
handlers/PostgreSQL and synthetic remote provider controls. It covers current
association/foreign-call admission, persistence, confirmation, case/email replay,
no BMS duplication and contact revocation. It is not claimed executed here.
Run it together with existing MSP DB, realtime-route and Twilio-webhook suites
on an explicitly disposable supported PostgreSQL instance. Preserve the real
ingress/signature, consent and carrier-result proofs as separate acceptance.

Final local receipts: **93 passed, zero failed/skipped**, strict compilation
(including the unrun PostgreSQL journey), zero-warning scoped lint, and full
API-project emitted compilation passed on identical runtime/test hashes.
Commands: `node evidence/callcommand-oct28/run.cjs unit frozen-final-unit`,
`strict frozen-final-strict`, `build frozen-final-build`, and `lint frozen-final-lint`
from the task workspace. These use the existing installed graph and explicit
resolution paths, not a new frozen-lockfile installation. Documentation counts
were reconciled afterward without changing the checked runtime/test source.

## Exact outstanding gates

1. Restore permitted access to a disposable PostgreSQL runtime and execute the
   new journey plus existing MSP, realtime-route, Twilio-webhook, outbox and
   concurrency regressions on this exact head. The retained Docker engine pipe
   permission failure was not retried. No canonical PostgreSQL binary is on PATH.
2. Resolve the separate OperatorOS source-publication rejection and held SSO/CI
   boundary. This local branch descends from the rejected frozen candidate; no
   alternative publication route, push, PR approval or deployment is attempted.
3. Reconcile the intended deployed source, preserved Replit commits and exact
   database/schema/recovery state. This patch has no migration, but its ancestor
   still carries an unapplied release boundary. Production database approval,
   recoverable backup and write pause remain separate.
4. Verify the intended existing MSP tenant/number, current Directory organization,
   eligible contact/SupportLink, trusted line, published email action and approved
   transfer target/hours. Decide whether the existing SupportLink-first/A0 fallback
   meets the first release; an A0 conversational receptionist is not implemented.
5. Privately verify existing Twilio account/routing and OpenAI project/model/key
   restrictions, webhook and SIP binding. Reuse existing resources; do not assume
   new credentials are required. Relevant names: `TWILIO_PUBLIC_BASE_URL`,
   `OPENAI_API_KEY`, `OPENAI_PROJECT_ID`, `OPENAI_WEBHOOK_SECRET`,
   `CALLCOMMAND_SIP_ROUTE_SECRET`, `CALLCOMMAND_REALTIME_MODEL`. Historical route
   secret containment/rotation evidence remains a separate owner security gate.
6. Confirm the support-ticket mailbox and its actual email-to-ticket behavior,
   approved Resend sender (`RESEND_API_KEY`, `EMAIL_FROM` or `INVITE_FROM_EMAIL`),
   recipient allowlisting and existing outbox worker. Never paste secret values
   into chat. Provider acceptance must be correlated with mailbox/PSA receipt.
7. Obtain action-specific approval for controlled owner calls/email and costs.
   Exercise interruption/correction, refusal, explicit human request, transfer
   failure/no-answer, duplicate callbacks, hangup and recovery. Capture durable
   local/outbox/provider/carrier IDs without secrets, passwords or patient data.

Last independently read GitHub main remained
`49b68ed638da1716545f056473a8f46fb593e3fd`. The last parent-observed OperatorOS
Replit deployment was source `00448f8b56605da56c78d735db66787952d98fec`, build
`a38b5882-804b-4075-8dd3-4072b1434459`; it is not a new live observation from
this phase. No source test proves the current production voice path.

## Provider references

- [OpenAI VAD](https://developers.openai.com/api/docs/guides/realtime-vad):
  explicit speech-to-speech response creation/interruption flags.
- [OpenAI SIP](https://developers.openai.com/api/docs/guides/voice-sip):
  accepting a call and carrier REFER are separate from downstream connection.
- [Realtime prompting](https://developers.openai.com/api/docs/guides/voice-prompting):
  concise speech, clear confirmation boundaries and explicit human escalation.

No provider/account/security configuration, real call, email, purchase,
production data change, migration, push, merge, PR approval or deployment occurred.
