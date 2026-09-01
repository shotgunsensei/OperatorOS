# CallCommand AI Production Audit and Commercial Completion Report

**Audit date:** 2026-08-31
**Repository:** canonical OperatorOS repository
**Scope:** CallCommand general receptionist, complete Phase 35 product, Phase 37 paid-MSP overlay, shared OperatorOS services, and the current commercial-runtime working tree
**Release disposition:** **not production-ready; release remains blocked pending the external and deployed gates in section 13**

> **Release-v58 addendum:** the managed-number work completed after this audit's
> v57 baseline now implements local/toll-free search, separate number billing,
> durable acquisition/recovery, automatic onboarding/routing, health repair,
> reconciliation, payment grace, staged release, and fleet telemetry. The
> authoritative current evidence and controlled-live runbook are in
> `docs/callcommand/MANAGED_NUMBER_PROVISIONING.md`. Historical gap statements
> below describe the audit baseline and must not override the v58 addendum.

## 1. Executive outcome

CallCommand was not a mock or empty shell at the start of this run. It already had a large, persistent, tenant-scoped receptionist and automation product: signed Twilio voice callbacks, consent-aware Gather/recording flows, profiles, channels, versioned flow graphs, automation rules, calls, transcripts/analysis, work objects, external notifications, live-session operations, deterministic simulation, usage counters, and the separate Phase 37 MSP intake/assurance overlay.

The fine-tooth-comb audit nevertheless found commercial P0 defects and missing product infrastructure:

- a browser could self-assert that an external transfer destination was verified;
- duplicate signed inbound deliveries could create more than one active session;
- automation idempotency was recorded after a side effect rather than reserved before it;
- terminal provider status did not provide one path that finalized the call, wrote auditable usage, and released capacity;
- assignment targets were not consistently revalidated against active tenant membership;
- action configuration emitted by a flow was nested differently from what the dispatcher consumed;
- global Twilio credential presence was shown as tenant readiness;
- real persisted transcripts could be replaced from a fixture-style customer UI;
- phone-number inventory/provisioning, tenant provider-account isolation, concurrent-call entitlements/leases, webhook-driven lane quantity, and append-only commercial usage did not exist as one end-to-end product boundary;
- the working voice path was a signed Twilio/TwiML Gather loop, not the selected OpenAI Realtime SIP runtime.

The current working tree addresses the highest-confidence control-plane, persistence, security, billing, product-UX, and live-route portions of those P0/P1 gaps. It integrates tenant Twilio subaccounts, signed Programmable Voice ingress, an atomic database lane gate, fixed Twilio SIP/TLS to OpenAI Realtime SIP, the signed OpenAI incoming-call route, and per-call OperatorOS sideband tools. It also adds a provider-neutral number adapter, additive commercial schema, lane billing integration, provider-honest customer screens, server-observed transfer verification, reserve-before-effect action execution, and richer agent/business context.

That is substantial source progress, not live acceptance. The direct OpenAI SIP/media path is now source-integrated, but no real Twilio-to-OpenAI call, production provider account, real number acquisition, real transfer, real Stripe subscription lifecycle, deployed exact-host runtime, production database apply, reconciliation under real callback ordering/restarts, or observed unit economics has been proven in this run. CallCommand must remain behind a go-live gate until those gates pass.

## 2. Evidence model

This report keeps four evidence levels separate:

| Evidence | Meaning | Current use |
|---|---|---|
| **Source inspection** | Route, schema, service, UI, and test code exists and was reviewed | Supports the capability inventory and defect analysis |
| **Isolated local execution** | Tests or database gates ran against synthetic data/non-live adapters | Supports only the exact command and result recorded in section 11 |
| **Live provider acceptance** | Real Twilio/OpenAI/Stripe/email/Slack calls and callbacks | **Not performed unless expressly listed; no broad live-provider pass is claimed** |
| **Deployed acceptance** | Exact deployed revision through production supervisor/public hosts | **Not performed; no production-readiness or state-5 claim** |

Repository authority reviewed for this audit included `docs/CURRENT_RELEASE_GATE.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/FINAL_E2E_ACCEPTANCE_REPORT.md`, `docs/CROSS_MODULE_READINESS_REPORT.md`, `docs/modules/MODULE_PARITY_INDEX.md`, `docs/modules/callcommand-ai/PARITY_MATRIX.md`, `docs/modules/callcommand-ai/THREAT_MODEL.md`, the Phase 35 and Phase 37 reports, and ADRs 0039/0040. Where historical narrative conflicts with current routes, schema, tests, or release authority, the current source and release authority win.

Historical Phase 35 and Phase 37 reports are useful provenance, not a substitute for fresh current-branch verification. Historical records show Phase 35 focused and browser coverage and Phase 37 focused 14/14 plus complete CallCommand 80/80 on isolated PostgreSQL. This report does not silently carry those results forward as proof of the current diff.

## 3. Existing state at audit start

### 3.1 OperatorOS authority — COMPLETE in source/local boundary

- OperatorOS session, tenant membership, role, module-entitlement, Stripe customer/subscription, shared audit, secret-reference, outbound webhook, email, attachment, AI-provider, and provider-status services already existed.
- CallCommand authenticated routes used shared read/write/admin guards and tenant predicates.
- The canonical module stayed inside the OperatorOS workspace; the imported `apps/modules/callcommand-ai/source` snapshot remained read-only evidence.
- Exact-host SSO and host-only session rules remained parent-platform concerns; no child login or billing system was introduced.

### 3.2 General receptionist and call operations — COMPLETE or PARTIAL

The general and Phase 35 data model already persisted:

- channels/business lines, business hours, live behavior, after-hours behavior, consent and recording configuration;
- receptionist profiles with greeting, script, tone, intake schema, escalation, product mode, and default state;
- transfer destinations, purpose-specific consents, suppressions, calls, safe events, follow-up drafts, dispositions, and protected recording references;
- versioned flows, immutable flow versions/traces, live sessions, upload/ingestion intents and event deduplication;
- automation rules, tickets, leads, tasks, action runs, transfer logs, PDF reports, and usage counters.

The live voice routes validated Twilio signatures, supported in-hours/after-hours paths, explicit consent, multi-turn speech Gather, recording callbacks, provider status, live-session notes/urgency/end, and provider-confirmed Twilio redirect. Call processing persisted caller facts, deterministic or shared-AI analysis, intent, priority, sentiment, summary, entities, action items, flow trace, rules, and action outcomes.

Classification:

- **COMPLETE (source/local):** persisted tenant call configuration, flow validation/versioning, deterministic simulation, call detail/timeline, safe reporting, replay ledger primitives, consent/suppression, and shared outbound integration use.
- **PARTIAL:** the current Gather loop is functional telephony automation but not a low-latency speech-to-speech OpenAI Realtime SIP agent. Profiles exposed some behavior but did not model the complete simple business configuration requested by the commercial product.
- **PARTIAL:** transfer execution could redirect a provider call, but external target verification authority was unsafe and fallback/announce/no-answer orchestration was not a complete commercial transfer state machine.
- **PARTIAL:** usage counters were operational aggregates, not an immutable provider-reconcilable commercial ledger.

### 3.3 Workflow actions and integrations — COMPLETE with defects

Phase 35 dispatched persisted ticket, lead, task, webhook, Slack, email, assignment, and priority actions. Shared outbound webhook infrastructure provided signed delivery, SSRF protection, retry/dead-letter, and safe delivery records. Email and Twilio integrations returned honest provider-unavailable/failure results rather than fake success. Workflow templates and deterministic flows existed.

The audit found two material correctness issues:

1. a flow executor emitted `{ actionType, config }`, while the dispatcher read fields such as `endpointId`, `title`, and `enabled` at the top level;
2. action-run idempotency was checked before execution but inserted only after the effect, leaving a concurrent/retry window for duplicate work.

These were **BROKEN** for exactly-once commercial behavior even though normal-path demos could pass.

### 3.4 MSP intake and Automation Fabric — COMPLETE for its bounded Phase 1 source scope

The Phase 37 overlay remained a separate paid-MSP path with:

- exact signed Twilio `To` resolution;
- encrypted/HMAC-indexed trusted originating lines and display-once SupportLinks;
- Directory-backed organization/contact association and A0-A4 assurance vocabulary;
- redacted deterministic issue intake, local cases, one idempotent BMS outbox/test record, screen-pop, policy, hash-linked evidence, provider onboarding, and kill switches;
- server-forced-off privileged reset/RMM actions pending later provider phases.

This commercial run must not weaken that boundary. A general receptionist number and an MSP intake number have explicit routing modes. The generic route must not silently process an MSP destination. No live Kaseya, Datto, Microsoft Graph reset, or AD-broker capability is newly claimed.

### 3.5 Customer experience — PARTIAL

The Phase 50 route migration supplied stable CallCommand routes and a polished operations-oriented workspace, but commercial onboarding was still shaped like a technical control panel:

- no server-driven “Get a CallCommand Number” inventory/purchase route;
- manual E.164 entry rather than guided new/existing-number scenarios;
- provider credential availability presented too close to “ready”;
- no explicit base/additional/effective lane display or lane checkout;
- no one guided sequence from number to agent to workflow to transfer/alerts to test to go-live;
- call detail did not always fetch the complete record, and a fixture-like transcript field could reprocess a real provider call.

## 4. Defect and gap ledger

### P0 — money/core product

| Capability/finding | Audit state | Current-run disposition |
|---|---|---|
| Server-owned tenant/module authority | COMPLETE | Preserved; new commercial records remain tenant-owned |
| Cross-tenant assignment validation | SECURITY RISK | Target user is revalidated against tenant membership; foreign users are not enumerated |
| External transfer target verification | SECURITY RISK / BROKEN | Client verification flags are rejected; target starts pending and requires a bounded server-observed provider challenge |
| Flow action configuration | BROKEN | Action config is flattened to the dispatcher contract; managed email/Slack/webhook settings save independently per exact channel and `enabled=false` is honored without deleting configuration |
| Exactly-once action effects | BROKEN | Action run is reserved before the provider/local effect; generated work objects bind uniquely; only completed/delivered/queued/test-recorded states count as success, and expired uncertain reservations become fail-closed `outcome_unknown` |
| Duplicate inbound live session | BROKEN | Signed ingress now integrates one-call/one-session replay handling and body-conflict detection with database uniqueness protection |
| Provider account/number isolation | MISSING | Tenant telephony-account mapping and provider-neutral Twilio subaccount/number adapter added |
| Automated number search/provision/route/health | MISSING | Server/API/UI contracts added; number orders bind the exact phone/account/mode to a stable tenant idempotency key and reject changed-payload replay; real provider acceptance is still external |
| Agent business context | PARTIAL | Extended profile/knowledge data is compiled server-side into the live Gather and Realtime paths without placing knowledge in browser transcript mutation flows |
| OpenAI Realtime SIP path | MISSING | Signed Twilio ingress, fixed TLS SIP TwiML, signed OpenAI webhook acceptance, exact selected-line account/credential/number/route checks at ingress/consent/OpenAI acceptance, server-compiled session, 30-second leased replay/recovery states, eight-second sideband-open confirmation, controller registry/terminal close, and per-call sideband are source-integrated; live provider/deployed acceptance remains open |
| Atomic concurrent-call admission | MISSING | Signed ingress acquires the database lane before any Realtime leg; pending paid quantity never admits a call and saturation follows explicit overflow policy |
| Terminal usage and lane release | BROKEN / MISSING | Terminal callbacks, explicit end, setup/sideband failure, monotonic reconciliation, append-only usage, and lane release are integrated; real provider ordering/restart proof remains open |
| Stripe lane quantity | MISSING | Central Stripe feature-add-on handler, stable lookup key, tenant/Stripe idempotency, pending projection, period-end zero-lane cancellation, signed settlement, stale-ID clearing/fresh repurchase, and webhook-derived effective quantity added |
| Variable-cost protection | MISSING | Internal cost/usage fields and retail strategy defined; production overage catalog/meter acceptance remains a commercial gate |
| Complete live-transfer fallback state machine | PARTIAL | Verified active destinations and provider-confirmed redirect/SIP refer exist, but timeout, busy/no-answer, alternate destination, voicemail, and return-to-AI orchestration still need end-to-end provider-state implementation and tests |

### P1 — operational value

| Capability/finding | Audit state | Current-run disposition |
|---|---|---|
| Email, Slack, signed webhook | COMPLETE/PARTIAL | Existing real shared infrastructure retained; managed commercial rules are repeat-safe, independently saved, destination-validated, and filtered by the exact channel before tool binding/dispatch |
| Transfer verification | MISSING/SECURITY RISK | Verification challenge persistence and start/check UI/API contract added |
| General caller verification | PARTIAL/MISSING | Transfer-destination possession verification and MSP A0/A1 assurance are separate and preserved; general caller-ID/PIN/DTMF/OTP/custom-question workflow strategies are not yet a complete configurable action |
| Editable templates | PARTIAL | Receptionist, support, after-hours, and lead-capture templates exposed in plain language and remain editable |
| BYO-number onboarding | MISSING | Forwarding, Twilio-transfer, PBX/SIP, and port scenarios modeled honestly; external carrier/provider steps remain visible |
| Call detail/history | PARTIAL | Commercial UI fetches persisted call detail/timeline and makes real transcript read-only; simulation remains explicitly labeled |
| Integration health | PARTIAL | Tenant account/number/routing/capacity checks and go-live lock modeled; live provider checks remain unproven |
| Admin/system diagnostics | PARTIAL | Existing MSP/provider/admin records remain; a privacy-minimized global commercial operations surface is still a later hardening item |
| Action toggles | PARTIAL/BROKEN | Managed commercial alert actions retain disabled configuration and save independently; a comprehensive per-action simple/advanced workflow control surface is still incomplete |
| SMS workflow action | MISSING | Shared signed messaging/consent infrastructure exists, but a tenant-configured CallCommand SMS action is not exposed as a production workflow tool |
| Recording/transcription policy | PARTIAL | Realtime eligibility now evaluates hours/behavior before SIP; required DTMF consent precedes SIP, enabled recording must start, disabled recording is not left pending, and transcript persistence follows the stored policy. Jurisdictional/legal review and production deletion/hold acceptance remain open |

### P2 — polish and scale

These are real product backlog items, not mislabeled external blockers:

- a richer visual branch/condition workflow designer beyond the current structured graph and templates;
- reviewed website crawling and document knowledge ingestion through shared storage/scanning/import infrastructure;
- additional provider implementations behind the number/call-control abstraction;
- advanced cohort/cost/resolution analytics and capacity forecasting;
- more notification and scheduling/CRM integrations;
- queue wait estimation only after sufficient operational data;
- multi-region provider/runtime strategy and automated chaos/failover exercises;
- privacy-minimized super-admin fleet dashboards and support tooling;
- catalog-driven included-minute bundles and a customer-facing correction/reconciliation explanation.

## 5. Architecture selected

The selected primary flow is:

```text
Caller
  -> tenant-owned/connected business number
  -> tenant Twilio subaccount
  -> signed exact-destination OperatorOS ingress
  -> replay-safe call/session creation
  -> atomic paid-lane admission
  -> Twilio SIP/TLS to OpenAI Realtime SIP
  -> signed OpenAI incoming-call event
  -> server-compiled agent and sideband tool allowlist
  -> versioned CallCommand workflow
  -> verified transfer / email / Slack / webhook / OperatorOS action
  -> terminal reconciliation + append-only usage + lane release
```

Twilio Media Streams remains an exception for requirements that direct SIP cannot satisfy. The decision, trust boundaries, failure handling, observability, rollout, and official sources are detailed in `docs/callcommand/CALLCOMMAND_COMMERCIAL_RUNTIME_ARCHITECTURE.md`.

## 6. Database and domain changes

The additive commercial release adds or extends the following source contracts. The supported migration path remains the root ordered database release; this report does not authorize production apply.

### New tables

| Table | Purpose and material invariants |
|---|---|
| `callcommand_tenant_runtime_settings` | Tenant overflow policy, verified forward target, bounded lease duration, and realtime activation; tenant primary key |
| `callcommand_telephony_accounts` | Tenant provider/subaccount mapping, encrypted secret reference, lifecycle and health; tenant-composite keys |
| `callcommand_number_orders` | Idempotent search/purchase/configuration order, request-bound account/acquisition mode/phone, provider IDs, masked number, and terminal state; same-key/different-payload requests fail before provider work |
| `callcommand_capacity_entitlements` | Base/additional/pending lane quantities, generated effective lanes, billing state, Stripe mapping, event ordering/version |
| `callcommand_lane_leases` | One tenant/call lease, one active lane number, provider-call binding, expiry/release state, idempotency |
| `callcommand_usage_events` | Tenant/call/provider usage and cost event ledger with unique idempotency and append-only mutation guard |
| `callcommand_agent_knowledge` | Versioned bounded tenant/profile business context with source type and active state |
| `callcommand_transfer_verifications` | Bounded external-destination verification challenge, provider reference, attempts, expiry, and terminal state |

### Extended tables

- `callcommand_channels`: telephony account, acquisition mode, durable BYO `connection_type`, provider number SID/state, general/MSP/legacy routing mode, provisioning and health evidence.
- `callcommand_profiles`: business and department name, voice, personality, purpose, business description, FAQs, hours/holidays/languages, fallback, voicemail/after-hours behavior, data permissions, recording/transcription policies, retention, and advanced prompt.
- `callcommand_calls`: start/answer/end, provider sequence/outcome, billable duration, costs, AI token/audio counters, terminal reconciliation, and capacity lease.
- `callcommand_live_sessions`: unique active tenant/call and tenant/provider-call constraints close duplicate-live-session races.
- `callcommand_action_runs`: reservation/lease/attempt state supports reserve-before-effect execution.
- `callcommand_automation_rules`: optional `managed_key` plus a unique active `(tenant_id, managed_key)` index supports one repeat-safe commercial alert rule per channel while preserving disabled action configuration.
- `callcommand_tickets`, `callcommand_leads`, and `callcommand_tasks`: optional tenant-composite action-run relationship and unique generated-object-per-action invariant.

Core values use relational columns and constraints; JSON remains limited to bounded extensible configuration/details. Usage events are immutable; corrections are new events rather than destructive edits.

## 7. API, provider, and billing changes

### Authenticated commercial product contract

The customer client is wired to the following tenant- and role-guarded product routes:

- `GET /v1/modules/callcommand-ai/product/commercial/workspace`
- `POST /v1/modules/callcommand-ai/product/commercial/numbers/search`
- `POST /v1/modules/callcommand-ai/product/commercial/numbers/provision`
- `POST /v1/modules/callcommand-ai/product/commercial/numbers/connect`
- `POST /v1/modules/callcommand-ai/product/commercial/numbers/:id/health`
- `POST /v1/modules/callcommand-ai/product/commercial/numbers/:id/release`
- `PUT /v1/modules/callcommand-ai/product/commercial/channels/:channelId/alert-rule`
- `PATCH /v1/modules/callcommand-ai/product/commercial/runtime-settings`
- `POST /v1/modules/callcommand-ai/product/commercial/lane-checkout`
- `PATCH /v1/modules/callcommand-ai/product/profiles/:id`
- `GET /v1/modules/callcommand-ai/product/profiles/:id/knowledge`
- `POST /v1/modules/callcommand-ai/product/profiles/:id/knowledge`
- `PATCH /v1/modules/callcommand-ai/product/profiles/:profileId/knowledge/:id`
- `DELETE /v1/modules/callcommand-ai/product/profiles/:profileId/knowledge/:id`
- `PATCH /v1/modules/callcommand-ai/product/automation-rules/:id`
- `POST /v1/modules/callcommand-ai/product/transfer-targets/:id/verification/start`
- `POST /v1/modules/callcommand-ai/product/transfer-targets/:id/verification/check`

Number provisioning and billing endpoints require tenant-admin authority. Commercial workspace capabilities are derived server-side from the trusted tenant context and module access level; an explicit module viewer can read but receives `403` on mutation even when broader tenant membership exists. General-commercial mutations reject MSP profiles/channels. Provider secrets never appear in response projections. An environment without provider/catalog configuration returns an honest unavailable/action-required state; it does not fabricate inventory, readiness, checkout, or provider success.

### Public/provider contract

- Existing signed Twilio general and MSP routes are preserved. General signed ingress now creates one replay-safe call/session, verifies the exact selected line's provider account, credential, number ownership, callback route, active general agent, published general workflow, and Realtime readiness, acquires the atomic lane before provider/AI work, applies the tenant overflow policy on saturation, and emits fixed OpenAI TLS SIP TwiML with an HMAC bound to the internal call and exact Twilio Call SID when realtime is enabled.
- Tenant-specific telephony verification resolves the relevant provider secret server-side while retaining the legacy shared credential fallback for existing channels.
- The number adapter can create/inspect a tenant account, search voice inventory, provision, configure callbacks, inspect health, and release only with explicit confirmation.
- The registered `POST /v1/modules/callcommand-ai/openai/realtime/incoming` route verifies the exact raw body with the OpenAI webhook verifier, validates the call/SID-bound route token, deduplicates the event, requires active general-channel/profile/workflow/realtime/lane authority, accepts only allowlisted model/voice/tool configuration, and opens one isolated sideband controller for that call.
- An ingestion owner, attempt counter, and 30-second processing lease recover stale pre-accept work and reattach a provider-confirmed call that has lost its controller. Provider acceptance stays distinct from sideband readiness; the call is marked connected only after an eight-second socket-open confirmation. Construction/open failure closes or hangs up, persists failure, and releases capacity. A per-process registry prevents duplicate controllers, and signed terminal handling closes the owned controller before reconciliation.
- Server-compiled profile, knowledge, workflow actions, and closed tool schemas are supplied at acceptance. Managed email/Slack/webhook rules are bound to the exact channel condition before becoming Realtime tools, and dispatch revalidates the current-tenant endpoint. Sideband callbacks persist policy-permitted bounded transcript/usage/error/callback-failure health and audit evidence and use server authorization plus reservation-before-effect execution for actions. Only completed, delivered, queued, or test-recorded action states count as success; expired uncertain reservations are terminal `outcome_unknown`. Transfers resolve only server-held verified tenant targets.
- The commercial workspace requires the selected line's provider, credential, number ownership, routing, agent, workflow, and OpenAI Realtime configuration before Go Live. Guarded activation locks the exact channel/profile/flow/account/secret rows under a tenant advisory lock before writing `realtime_enabled=true`; signed ingress, consent continuation, and the OpenAI receiving route repeat the exact-line check. A generic channel update cannot activate an incomplete commercial line. This registered source path does not prove public webhook delivery, SIP negotiation, long-lived sideband operation, transfer, hangup, reconnect, or outage behavior in a deployed environment.

### Stripe contract

The existing canonical signed webhook, durable Stripe receipt, central customer/subscription mapping, and Stripe runtime gate are reused. Feature-add-on classification dispatches CallCommand lane events to a specialized handler without creating a second billing system.

The lane checkout path:

1. validates admin/module/tenant authority;
2. reserves a bounded tenant idempotency key under a PostgreSQL tenant advisory lock, replaying the same response and rejecting changed payloads;
3. resolves the existing OperatorOS Stripe customer/subscription where present;
4. creates a hosted subscription checkout or updates the existing licensed subscription-item quantity with a deterministic derived Stripe idempotency key;
5. writes only a pending local projection;
6. waits for a verified canonical webhook before changing effective capacity.

Quantity zero is separately confirmed and schedules period-end cancellation. It does not revoke settled lanes before Stripe's signed deletion event. That event removes paid capacity and clears the canceled subscription/item identifiers; a later positive quantity therefore starts a fresh Checkout instead of trying to update a canceled subscription. Positive quantity updates clear a previously scheduled cancellation.

Stable commercial metadata:

```text
operatoros_module=callcommand
feature=concurrent_call_lane
billing_type=quantity
entitlement=callcommand.concurrent_calls
lookup_key=operatoros_callcommand_concurrent_lane_monthly_v1
```

No Stripe product, Price, subscription, payment, or webhook was created or mutated in a live account during this audit.

## 8. Customer UI changes

The CallCommand route contract now separates:

- Set up CallCommand;
- Phone numbers;
- AI receptionists;
- Call workflows;
- Calls and history;
- Usage and billing;
- Health and readiness;
- the existing actions, provider, settings, MSP organization, and compliance/assurance surfaces.

The guided setup answers what the customer must do next:

1. choose a new or existing number path;
2. create/edit an AI receptionist from structured business fields;
3. choose and publish an editable workflow template and assign it to the number;
4. configure channel-scoped alerts and a pending transfer destination; alert changes save independently of workflow publication and disabled actions retain their settings;
5. verify the transfer destination through the provider challenge;
6. run an explicitly labeled no-external-call simulation;
7. unlock go-live only when tenant provider, number, route, agent, workflow, and server-side OpenAI Realtime facts are healthy; activation explicitly enables the persisted Realtime route.

Provider complexity is hidden behind business language. The UI does not submit `verified=true`, does not hardcode the $49 recommendation as provider truth, does not mark a global credential as tenant-ready, and does not edit/reprocess a real provider transcript. Go Live consumes the selected number's exact provider-readiness projection and trusted server capabilities. Usage and lane price are API/catalog-derived; commercial data absence is visible. Paid-lane quantity supports zero through one hundred, separates the destructive zero-lane confirmation from positive purchase confirmation, and explains that period-end cancellation leaves capacity active until signed settlement.

## 9. Pricing and profitability analysis

### 9.1 Official variable-cost anchors

Official US list-price facts refreshed on 2026-08-31:

| Cost | Official list-price anchor | Notes |
|---|---:|---|
| Twilio US local inbound | $0.0085/min | plus $1.15/month for a local number |
| Twilio SIP interface | $0.0040/min | direction/leg details must be confirmed for the final call topology |
| Twilio Media Streams | $0.0044/min | exception-path increment, not assumed for direct SIP |
| Twilio recording | $0.0025/min | plus storage; transcription is separately priced |
| GPT-Realtime-2.1 Mini audio input/output | $10/$20 per 1M audio tokens | actual per-minute cost varies with talk/listen mix, caching, silence, context, and tool traffic |
| GPT-Realtime-2.1 audio input/output | $32/$64 per 1M audio tokens | same variability; higher reasoning can increase usage/latency |
| Stripe US domestic card | 2.9% + $0.30/successful transaction | negotiated/international/other methods differ |
| Stripe Billing pay-as-you-go | 0.7% of Billing volume | current public US price; exclusions and custom plans apply |

Sources: [Twilio Voice pricing](https://www.twilio.com/en-us/voice/pricing/us), [GPT-Realtime-2.1 Mini](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini), [GPT-Realtime-2.1](https://developers.openai.com/api/docs/models/gpt-realtime-2.1), [OpenAI Realtime cost management](https://developers.openai.com/api/docs/guides/realtime-costs), and [Stripe US pricing](https://stripe.com/us/pricing).

### 9.2 Planning assumptions

For commercial planning—not provider invoicing—the initial model should reserve:

- approximately $0.0125/min for the US local inbound plus SIP legs before optional features;
- approximately $0.02-$0.04/min for Mini realtime audio under a representative balanced conversation;
- approximately $0.06-$0.12/min for full realtime under a representative balanced conversation;
- additional reserve for text/tool tokens, silence/context behavior, recording/transcription, transfer/conference legs, toll-free/international traffic, retries, storage, application infrastructure, support, refunds, fraud, and observability.

These ranges are deliberately conservative estimates from token/list-price inputs, not guarantees. Real invoices and captured OpenAI usage must calibrate them before final included-minute allowances or gross-margin claims.

### 9.3 Selected commercial guardrails

**Additional concurrent lane:** $49/month recommended default, billed as a licensed quantity, with no usage included by the lane itself.

The fee sells reserved simultaneous capacity and operational value. It cannot safely buy unlimited telephony/AI consumption. On a $49 domestic-card subscription increment, the public-list Stripe payment and Billing fees alone are approximately $2.06 before taxes/other fees; the remaining amount is capacity gross revenue, not a prepaid provider-cost pool.

Recommended initial usage retail:

- standard/Mini realtime: start at $0.15/minute beyond any explicitly priced inclusion;
- premium/full realtime: start at $0.35/minute beyond any explicitly priced inclusion.

At the planning ranges above, the standard price leaves roughly $0.0975-$0.1175/min before infrastructure/support/other reserves; premium leaves roughly $0.2175-$0.2775/min. These arithmetic ranges are not a promise of realized margin. They show why capacity and consumption must be separate and why an uncapped fixed-price voice plan is unacceptable before real utilization data.

Before launch, finance/product must choose the base subscription price, included minutes, overage rounding/minimums, taxes, international/toll-free rules, recording/transcription charges, abuse limits, and downgrade/proration policy. All values belong in the OperatorOS catalog/Stripe configuration rather than UI conditionals.

## 10. Environment and provider setup contract

New/current commercial variables must be documented without real values:

- `OPENAI_API_KEY`: existing server-only OpenAI API credential;
- `OPENAI_PROJECT_ID`: OpenAI project used in the TLS SIP URI and project header;
- `OPENAI_WEBHOOK_SECRET`: OpenAI incoming-call webhook signature secret;
- `CALLCOMMAND_SIP_ROUTE_SECRET`: independent high-entropy HMAC key binding the internal call to the Twilio SIP leg;
- `CALLCOMMAND_REALTIME_MODEL`: server allowlisted `gpt-realtime-2.1-mini` or `gpt-realtime-2.1`; recommended commercial default is Mini;
- `TWILIO_ACCOUNT_SID`: parent Twilio account authority;
- `TWILIO_AUTH_TOKEN`: primary Twilio auth token used for signature validation and applicable REST authentication;
- `TWILIO_FROM_NUMBER`: existing approved Twilio voice identity where shared compatibility behavior requires it;
- `TWILIO_PUBLIC_BASE_URL`: exact credential-free CallCommand HTTPS origin used to configure and validate callbacks; production contract is `https://callcommand-ai.operatoros.net`;
- `TWILIO_VERIFY_SERVICE_SID`: Twilio Verify service for external transfer-destination possession challenges;
- `SHARED_SECRET_ENCRYPTION_KEY`: base64-encoded 32-byte key used by the existing tenant secret vault;
- `SHARED_SECRET_ENCRYPTION_KEY_VERSION`: vault key-rotation label;
- `STRIPE_PRICE_CALLCOMMAND_CONCURRENT_LANE_MONTHLY`: existing Stripe Price ID for the licensed monthly lane product;
- `CALLCOMMAND_LANE_PRICE_CENTS`: configurable display/default price in whole cents; recommended default `4900`.

The persisted tenant runtime setting `realtime_enabled` remains false until an administrator enables a tenant after provider health is proven. It is configuration state, not a browser/environment shortcut around readiness.

Account-level actions that code cannot safely invent:

1. approve the Twilio parent account/use case, geographic permissions, regulatory bundles, number types, and spend/usage limits;
2. confirm subaccount webhook-signing credential behavior and rotate/store tenant credentials in the vault;
3. acquire/port/transfer numbers subject to ownership and local regulation;
4. create the OpenAI project webhook, capture its signing secret, confirm model availability/quota/data residency, and configure the TLS SIP URI;
5. create or reconcile exactly one active Stripe Product/Price for the stable lookup key and configure the signed webhook endpoint/events;
6. configure live email/Slack/webhook destinations and their provider approval where those actions are sold;
7. set production domains/DNS/TLS so canonical webhook URL validation matches provider configuration.

## 11. Security and verification findings

### Security repairs in the working tree

- rejected client-supplied transfer verification and replaced it with a provider challenge record;
- validated assignment targets against the active tenant without revealing global user existence;
- flattened/validated workflow action configuration and enforced enabled state server-side;
- reserved action runs before side effects and associated generated objects uniquely;
- introduced tenant telephony accounts and encrypted secret references instead of browser/provider-secret projection;
- added unique live-session/capacity indexes and replay/idempotency records;
- moved atomic lane admission ahead of the Realtime SIP leg and made every saturated call use an explicit tenant overflow policy;
- bound the Twilio SIP route to the internal call and exact Twilio SID with HMAC, then required an exact raw-body OpenAI webhook signature plus the active tenant/channel/profile/workflow/lane facts before acceptance;
- compiled tenant profile/knowledge/tool policy only on the server, used closed tool schemas and fixed provider endpoints, and reserved control/action effects before execution;
- evaluated business-hours/live/after-hours eligibility before SIP, required consent before consent-scoped Realtime audio, started enabled recording before the SIP handoff, and enforced transcript-persistence policy;
- added leased webhook processing/recovery, per-call sideband ownership, a bounded open-confirmation gate, failure cleanup, and safe callback-failure telemetry;
- treated stale provider/action outcomes as unknown or failed instead of retrying blindly or fabricating success;
- made usage append-only and tenant/provider keyed;
- separated general/MSP/legacy number routing modes;
- changed provider UX to distinguish credential presence from tenant number/route readiness;
- made commercial capabilities server-derived, enforced explicit module-viewer write denial, and rejected general/MSP profile/channel crossover;
- persisted BYO connection type separately from mutable provider health reasons and bound number-order idempotency to account/mode/phone request facts;
- replaced publish-time/global alert creation with one managed, channel-scoped, independently saved rule; validated tenant endpoint ownership/event support and rechecked the exact channel at Realtime binding and dispatch;
- moved selected-line readiness into the locked activation transaction and repeated exact account/secret/number/route checks at signed ingress, consent continuation, and OpenAI acceptance;
- made lane quantity changes exactly-once across OperatorOS and Stripe, required separate zero-lane confirmation, retained paid capacity through period end, and cleared terminal subscription identifiers so repurchase creates a fresh checkout;
- made real provider transcripts read-only in the commercial customer path;
- retained shared signed outbound webhooks, SSRF protections, secret redaction, audit, and provider-honest failure results.

### Required threat tests before live activation

- forged, stale, duplicate, reordered, and conflicting-body Twilio/OpenAI/Stripe webhooks;
- tenant A read/write/execute attempts against tenant B account, number, agent, flow, call, integration, transfer target, lane, and usage IDs;
- model/caller prompt injection requesting disabled tools, foreign data, configuration changes, privilege escalation, or fabricated action success;
- DNS rebinding, redirect, private-address, metadata-service, oversized-body, slow-response, and secret-exfiltration webhook destinations;
- lane races across multiple API processes and release on hangup, failure, timeout, transfer, restart, and missed callback;
- transfer verification brute force, expiry, replay, destination changes after verification, and no-answer/busy fallbacks;
- recording/transcript consent, retention, deletion, legal hold, private retrieval, and admin content-minimization.

### Verification results from this run

The pre-change current-branch CallCommand baseline passed **84/84** tests on an isolated PostgreSQL 16 database with synthetic data and explicit test-only secrets. The first attempt without a running database produced expected `ECONNREFUSED` environment failures and is not acceptance evidence. After all commercial and Realtime integration edits settled, the final cumulative API gate superseded the interim aggregate counts.

| Gate | Exact result | Scope boundary |
|---|---|---|
| Final cumulative CallCommand API gate | **149 passed, 0 failed, 0 canceled, 0 skipped, 0 todo** across all 20 `apps/api/test/callcommand*.test.ts` files; 43.062 seconds | isolated PostgreSQL at `127.0.0.1:55439`, `APP_ENV=test`, `NODE_ENV=test`, `--test-concurrency=1`; synthetic/local adapters, not live providers |
| Realtime SIP adapter subset | 11 passed, 0 failed, 0 skipped | included in the 149; strict readiness, HMAC call binding, signed raw-body unwrap, fixed REST controls, per-call isolation, bounded `waitUntilOpen`, callback-failure reporting, exactly-once allowlisted tools, bounded transcripts/usage/errors, and secret-safe failures |
| Realtime public-route PostgreSQL subset | 4 passed, 0 failed, 0 skipped | included in the 149; signed acceptance/replay/conflict, exact provider readiness, channel-filtered managed tools, hidden server destinations, tenant-bound transcript/usage, inactive/lane gates, stale-claim recovery, accepted-call reattach, sideband-open failure cleanup, and policy-disabled transcript suppression; fake provider only |
| Phase 35 lifecycle PostgreSQL subset | 12 passed, 0 failed, 0 skipped | included in the 149; exact selected-line readiness, MSP/general separation, BYO durability, channel-scoped alert ownership, module-viewer write denial, concurrency, consent, terminal usage, and replay-safe lane release |
| Phase 35 -> Realtime handoff PostgreSQL subset | 2 passed, 0 failed, 0 skipped | included in the 149; encrypted tenant Twilio test credential, consent-before-SIP, one tenant-bound consent, recording-disabled accuracy, fixed SIP handoff after consent, and flow/hours/behavior eligibility exclusions; fake/provider-local only |
| Lane settlement PostgreSQL subset | 5 passed, 0 failed, 0 skipped | included in the 149; exactly-once pending projection, tenant customer isolation, zero-lane period-end cancellation, signed deletion settlement, stale-ID clearing, and fresh checkout after cancellation |
| Expired action-reservation recovery subset | 1 passed, 0 failed, 0 skipped | included in the 149; a stale claimed business-action reservation becomes `CALLCOMMAND_ACTION_OUTCOME_UNKNOWN`, clears its lease, remains single-write, and does not replay the side effect |
| Database plan | v57, 57 ordered steps, final step `callcommand_commercial_runtime`, non-destructive | read-only release contract |
| Disposable database apply/reapply | clean v57 apply passed in 20.078 seconds and immediate reapply passed in 1.912 seconds | fresh `operatoros_callcommand_final` database in the isolated PostgreSQL 16 container; no production data |
| Workspace typecheck | passed | `corepack pnpm typecheck`; API, runner gateway, web, and TorqueShed native |
| Commercial web contract | 6 passed, 0 failed, 0 skipped | route/client coverage, selected-line activation, independently saved alerts, provider honesty, server capability and confirmation boundaries |
| Production environment contract | 11 passed, 0 failed, 0 skipped | CallCommand provider/Realtime/verification/lane requirements and secret-safe preflight output |
| Production build | passed | deployment-scope verification, FaultlineLab 4/4, all four workspace typechecks, API/runner/Next builds, and 35/35 generated Next pages; existing edge-runtime static-generation warning only |
| Real production readiness profile | failed closed as expected | absent production database/session/SSO/shared-secret/domain/proxy inputs plus OpenAI, Twilio Verify/credentials/public host, and Stripe lane Price were named; no secret values printed |

The cumulative command materialized all 20 `apps/api/test/callcommand*.test.ts` paths and executed them with `corepack pnpm --dir apps/api exec tsx --test --test-concurrency=1`. The glob was materialized explicitly because PowerShell does not expand it for the child process. This is source/local evidence only. A compiled production start through the unified supervisor, live Twilio/OpenAI/Stripe tests, authenticated deployed browser acceptance, production database apply, backup/restore, and production monitoring were not performed; therefore they are not claimed here. This repository has no authoritative lint script, so no lint result is claimed.

## 12. Manual acceptance plan

Use authorized provider test accounts, a non-production Stripe catalog, and an isolated tenant/database first:

1. Create Tenant A and Tenant B, assign owner/admin/member/viewer roles, and entitlement states.
2. Enable CallCommand for Tenant A; prove Tenant B cannot enumerate or mutate any Tenant A object.
3. Create or inspect Tenant A's Twilio subaccount; confirm credentials are encrypted and never returned/logged.
4. Search an approved area code, provision one voice number, automatically configure callbacks, and run number health.
5. Connect a second existing-number scenario and confirm the UI clearly identifies the required external carrier step.
6. Create an AI receptionist with business facts, FAQ, hours, language, fallback, recording/transcription policy, and retention.
7. Create/publish an editable receptionist workflow; toggle email/Slack/webhook actions off and on without losing configuration.
8. Add an external transfer destination. Confirm it remains unusable until the real challenge is approved; test wrong, expired, replayed, and changed-number cases.
9. Run the no-cost simulator. Confirm it is labeled simulation, persists a call/timeline/actions, and does not contact Twilio/OpenAI/recipients.
10. Place one consented real inbound call. Confirm exact signed tenant resolution, lane 1, OpenAI SIP acceptance, sideband server tool authorization, correct business answer, summary, and immutable usage.
11. Ask for a human. Confirm the verified transfer executes, busy/no-answer fallback works, and no success is announced before provider confirmation.
12. Confirm configured email/Slack/webhook actions execute exactly once under duplicate/replayed terminal events.
13. Open call history/detail. Confirm provider facts, timeline, transcript/recording policy, workflow traces, action outcomes, usage, and errors are tenant-scoped.
14. Start calls simultaneously through every purchased lane. Confirm isolated transcripts/tools/state and accurate active/available counts.
15. Start one more call. Confirm the configured overflow path runs without starting an unentitled AI session or creating AI usage.
16. Terminate calls through hangup, transfer, provider failure, AI failure, timeout, and process restart. Confirm each lane is released/reconciled exactly once.
17. In Stripe test mode, request +3 lanes. Confirm pending quantity does not admit calls; complete payment and confirm the webhook raises effective capacity from 1 to 4.
18. Test quantity downgrade, payment failure, cancellation, old event delivery, and webhook replay. Confirm effective lanes follow verified entitlement only.
19. Compare Twilio/OpenAI usage with CallCommand events and cost rollups; append corrections rather than editing history.
20. Run exact-host desktop/mobile/accessibility, production supervisor health/readiness, backup/apply/reapply/restore, monitoring/alert, rollback, and a bounded canary before traffic promotion.

## 13. Legitimate remaining external blockers

Only dependencies that require credentials, account ownership/approval, regulatory action, production authority, or observed external state belong here:

1. **Twilio account and telephony approval:** funded parent account, approved use case/geographies, regulatory bundles/address requirements, subaccount limits/credentials, numbers/ports/transfers, public callback URLs, and controlled live signed-call acceptance.
2. **OpenAI project and realtime approval:** funded project, model/quota/region availability, webhook signing secret, public webhook, TLS SIP route, sideband connection, and controlled live accept/refer/hangup/outage acceptance.
3. **Stripe catalog/account setup:** reconcile one Product/licensed recurring Price for `operatoros_callcommand_concurrent_lane_monthly_v1`, set its real Price ID, configure signed webhook events, decide proration/tax/downgrade policy, and run test/live account acceptance.
4. **Production database/release authority:** approved backup, restore rehearsal, exact additive release plan/apply/reapply, data/provider mapping reconciliation, rollback decision, and production migration approval.
5. **Deployment/DNS/TLS authority:** deploy the exact reviewed revision through the unified supervisor, configure public exact hosts and callback URLs, then perform authenticated/deployed browser and provider acceptance.
6. **Legal/compliance and operational policy:** approved recording/transcription consent language, retention/deletion/legal-hold policy, international/toll-free/porting rules, emergency messaging, provider terms, support/incident runbooks, and observability ownership.
7. **Commercial decision and measured economics:** approve base plan, included usage/overage, negotiated provider rates, margin reserve, abuse/spend limits, and validate them against real invoices and call-mix data.
8. **Live notification destinations:** approved email sender/domain, Slack app/workspace/channel, and tenant webhook destinations for end-to-end delivery acceptance.

Advanced workflow design, richer knowledge ingestion, additional integrations, and analytics are deliberately listed as P2 product backlog in section 4. They are not disguised here as external blockers.

## 14. Final production gate

CallCommand should remain marked **source/local commercial candidate, release blocked** until an exact revision proves the entire paid journey:

```text
subscribe
  -> choose/connect number
  -> create agent
  -> publish/assign workflow
  -> verify transfer/alerts
  -> test
  -> go live
  -> handle entitled simultaneous calls
  -> execute real actions and transfer
  -> inspect history/usage/health
  -> upgrade/downgrade capacity from canonical Stripe state
  -> reconcile provider usage and recover failures
```

Passing a simulation, rendering a dashboard, or having a provider credential is insufficient. Production readiness requires real provider behavior, deployed tenant/RBAC isolation, accurate billing/usage, graceful saturation/failure, monitoring, backup/restore, and rollback evidence without developer intervention.
