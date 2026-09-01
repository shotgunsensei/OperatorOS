# CallCommand Commercial Runtime Architecture

**Decision date:** 2026-08-31
**Status:** Selected architecture and source/local implementation contract; not a production-readiness declaration
**Product:** CallCommand AI, an OperatorOS child module

> **Managed-number release note:** release v58 completes the provider/billing
> lifecycle described here with separate local/toll-free licensed quantities,
> pre-provider billing gates, ambiguous-acquisition recovery, routing repair,
> provider/Stripe/database reconciliation, payment grace and suspension, and a
> staged cancelable release. Current operational detail and acceptance steps
> are in `docs/callcommand/MANAGED_NUMBER_PROVISIONING.md`.

## 1. Decision summary

CallCommand's production target is a tenant-isolated, provider-abstracted voice runtime with this primary call path:

```text
Caller
  -> tenant business number in a tenant Twilio subaccount
  -> signed Twilio Programmable Voice ingress at OperatorOS
  -> exact destination/tenant resolution and replay-safe receipt
  -> atomic CallCommand concurrent-lane gate
       -> admitted: Twilio SIP over TLS to OpenAI Realtime SIP
       -> saturated: the tenant's explicit queue, message, voicemail,
          forward, or refuse policy
  -> signed OpenAI incoming-call event
  -> server-compiled agent configuration and server-side tool allowlist
  -> OpenAI Realtime call plus OperatorOS sideband control WebSocket
  -> verified transfer and/or tenant workflow actions
  -> terminal reconciliation, append-only usage event, and lane release
```

Twilio Media Streams is an exception path, not the default. It is appropriate only when CallCommand needs audio processing or a provider feature that cannot be delivered by the direct SIP integration. The direct SIP route avoids owning a custom bidirectional audio bridge, codec conversion, jitter buffering, and another WebSocket failure boundary.

This selection is supported by the current official [OpenAI Realtime SIP guide](https://developers.openai.com/api/docs/guides/realtime-sip), [OpenAI server-side controls guide](https://developers.openai.com/api/docs/guides/realtime-server-controls), [Twilio Media Streams overview](https://www.twilio.com/docs/voice/media-streams), and [Twilio bidirectional Stream documentation](https://www.twilio.com/docs/voice/twiml/stream).

The working tree establishes both the commercial control-plane model and the source-integrated live-call route. Signed Twilio ingress resolves the tenant and number, creates one replay-safe call/session, acquires the atomic lane, and emits only the fixed OpenAI TLS SIP destination with a call-and-Twilio-SID-bound HMAC route token. The registered OpenAI incoming-call route verifies the exact raw body through the OpenAI webhook verifier, validates that route token, rechecks the active lane/channel/profile/workflow/realtime authority, accepts a server-compiled session, opens one per-call sideband connection, and persists bounded transcript, usage, error, and control-action evidence. The same working tree includes the provider adapter, number lifecycle, capacity entitlement, lane lease, agent-business-context, transfer-verification, Stripe add-on, and customer-workspace contracts. A real Twilio-to-OpenAI SIP call, production deployment, production database migration, and real Stripe catalog/webhook acceptance remain separate external gates. No such live evidence is implied by this document.

## 2. Authority and product boundaries

OperatorOS remains the sole authority for:

- identity, credentials, host-only sessions, tenant selection, and membership;
- platform and tenant roles;
- module access and CallCommand entitlement;
- Stripe customer, subscription, add-on, and webhook processing;
- tenant audit and shared integration/secret infrastructure;
- module registry, launch policy, and exact-host SSO.

CallCommand owns only its tenant-scoped product data and runtime behavior: phone-number mappings, voice-agent configuration, call workflows, call/session state, workflow execution, transfer destinations, commercial capacity leases, and usage evidence. It does not create a second account system, accept browser-supplied billing authority, or widen an OperatorOS role.

The browser may request a tenant selection through the established OperatorOS flow. Every API operation resolves the trusted tenant from the validated server session and revalidates membership and role. A browser-supplied tenant identifier never becomes authority by itself.

OperatorOS platform billing and module business payments remain separate. The concurrent-lane add-on is an OperatorOS subscription feature. Any future payment a tenant collects from its own caller is a different business-payment domain and must not be routed through entitlement logic.

## 3. Architecture alternatives considered

| Concern | Twilio Programmable Voice -> OpenAI Realtime SIP | Twilio Media Streams -> custom bridge -> OpenAI Realtime |
|---|---|---|
| Audio plumbing | Provider-to-provider SIP media path | CallCommand owns Twilio WebSocket messages, audio framing, conversion, timing, and the OpenAI socket |
| Latency/failure boundaries | Fewer application media hops | Additional public WebSocket and bridge process |
| Server-side tools | OpenAI incoming-call webhook plus sideband WebSocket | Available, but coupled to the custom bridge lifecycle |
| Transfer | OpenAI SIP refer and/or Twilio transfer/conference primitives | Bridge must coordinate media teardown and transfer state |
| Observability | Provider call/SIP identifiers correlated to CallCommand call and lane | Rich raw-media visibility, but substantially more operational surface |
| Fit | Primary production path | Exception for custom media processing or unsupported SIP scenarios |

The chosen path is SIP because it has fewer failure points for a business receptionist while retaining server-side session control and tool execution. Media Streams remains behind a provider capability boundary; selecting it for one integration must not change tenant, workflow, entitlement, or billing logic.

The existing signed Twilio/TwiML speech-Gather implementation remains a compatibility and deterministic acceptance path while tenants migrate. A tenant's persisted `realtime_enabled` setting selects the SIP path only after deployment readiness is satisfied. Leaving realtime disabled is not evidence that the paid realtime product is active, and it must not be advertised as equivalent low-latency speech-to-speech service.

## 4. Tenant and provider isolation

### 4.1 Twilio account model

The preferred provider hierarchy is:

```text
OperatorOS Twilio parent account
  +-- Tenant A subaccount
  |     +-- numbers
  |     +-- calls
  |     +-- provider usage
  +-- Tenant B subaccount
        +-- numbers
        +-- calls
        +-- provider usage
```

Twilio documents subaccounts as independently identifiable accounts managed through a main account; see the official [Subaccounts API](https://www.twilio.com/docs/iam/api/subaccounts) and [Twilio account/subaccount introduction](https://help.twilio.com/articles/360011132374-Getting-Started-with-Twilio-Accounts-and-Subaccounts).

The CallCommand mapping is tenant-owned and contains only safe provider metadata such as provider, account mode, provider account SID, lifecycle state, health state, and timestamps. Provider credentials are stored in the OperatorOS encrypted secret-reference system. They are input-only and are never returned to the browser, embedded in a generated onboarding instruction, written to an audit payload, or logged.

Existing manual/platform numbers remain compatible through explicit acquisition and routing modes. Migration is additive: an existing number can stay on the legacy/general route until its provider mapping, routing health, and rollback path are confirmed. No migration should silently release, port, or reconfigure a live number.

### 4.2 Exact destination resolution

Inbound routing resolves the tenant from the exact destination number and active provider mapping after signature verification. `To`, provider account SID, number SID, and routing mode must agree. Routing modes distinguish general receptionist traffic, MSP intake, and legacy compatibility so the commercial route cannot accidentally consume an MSP number.

Provider identifiers are globally unique where the provider guarantees that property; CallCommand also maintains tenant-composite keys and foreign keys for all business relationships. A failed lookup returns a generic provider response and must not enumerate another tenant's number, account, agent, call, or workflow.

### 4.3 Provider abstraction

Provider-specific code is confined to a telephony-number adapter and normalized contracts for:

- tenant account creation/inspection;
- voice-capable number search;
- number provisioning;
- inbound routing updates;
- number inspection and health;
- explicit confirmed release;
- SIP-dial configuration;
- realtime-session configuration validation;
- transfer-target validation.

The rest of CallCommand consumes normalized provider results. A future provider implementation can therefore replace number and call-control primitives without rewriting OperatorOS tenant authority, workflow execution, commercial capacity, or the usage ledger.

## 5. Phone-number onboarding and management

### 5.1 Get a CallCommand number

The customer path is intentionally expressed in business language:

1. Determine or select country, area code, and locality.
2. Search provider inventory for voice-capable numbers through the server.
3. Display masked/normalized number, capabilities, locality, and provider-returned cost facts when available.
4. Create a replay-safe number order scoped to tenant and provider account.
5. Purchase the selected number in the tenant provider subaccount.
6. persist the provider number SID, tenant channel, acquisition mode, and provisioning state;
7. configure the signed CallCommand inbound and status callback routes through the provider API;
8. assign the selected AI receptionist and published workflow;
9. inspect provider routing and run a health check;
10. unlock go-live only after provider, number, and route health are confirmed.

Twilio's official number resources are the [Available Local Number API](https://www.twilio.com/docs/phone-numbers/api/availablephonenumberlocal-resource), [Incoming Phone Number API](https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource), and [Global Available Numbers Catalog](https://www.twilio.com/docs/phone-numbers/global-catalog/api/available-numbers).

A retry with the same tenant idempotency key returns the existing order/result; it must not buy a second number. The order durably binds the requested phone number, tenant telephony account, and acquisition mode before provider work. Reusing the key for a different request fails with `CALLCOMMAND_NUMBER_IDEMPOTENCY_CONFLICT` instead of replaying the first purchase result. A partially completed order remains diagnosable. Release requires an authorized administrator, a specific current provider mapping, explicit confirmation, and a provider-confirmed result before local state becomes released.

### 5.2 Use an existing business number

Bring-your-own-number is scenario-specific rather than a single false promise:

- **Forward an existing business number:** CallCommand gives the tenant a provisioned destination and provider-specific forwarding instructions. The carrier/PBX owns completion.
- **Transfer an existing Twilio number:** supported only through the applicable Twilio account transfer process and subject to account ownership.
- **Connect a PBX/VoIP system:** provide the exact tenant SIP endpoint and authentication/routing facts required by the supported trunk path.
- **Port a number:** a provider/regulatory workflow with documents and lead time; it cannot be represented as instant API completion.

The product stores a durable `connection_type`, status, tenant-safe instructions, verification state, test result, troubleshooting status, and disconnect instructions. A later provider health result may update health reason/state, but it cannot erase the selected connection plan. Any token, password, or provider secret stays in server-side secret storage. A connected number is not marked healthy from a browser assertion; provider inspection and a controlled routing check are required.

### 5.3 Number operations surface

The customer workspace separates setup, phone numbers, AI receptionists, workflows, calls, usage/billing, and health. Number rows are expected to derive their values from persisted/provider facts: assigned agent/workflow, acquisition and provisioning state, enabled state, route, active calls, lane usage, period minutes, and health. Buttons that depend on a provider remain disabled or explicitly unavailable when the provider is not configured.

## 6. Agent configuration and knowledge

The tenant configures structured business facts instead of writing an unrestricted system prompt. The commercial profile extends the persisted agent with department, voice, personality, purpose, business description, FAQs, hours, holidays, languages, fallback/voicemail/after-hours behavior, data-collection permissions, recording/transcription policy, retention, and an optional advanced prompt.

Knowledge entries are tenant- and profile-scoped, versioned, bounded, and typed. Initial supported sources are structured business facts, FAQ entries, and reviewed text. Website crawling and document ingestion remain separate capabilities until the shared import/storage/security pipeline is explicitly connected; the UI must not imply they work merely because the schema can model them.

Before a call is accepted, the server compiles these fields into the agent instructions. Mandatory server rules are appended independently of tenant text:

- identify the configured business and purpose;
- do not invent facts;
- state uncertainty and use the configured fallback;
- collect only allowed fields;
- do not expose another call or tenant's context;
- do not claim an action succeeded until the server tool returns success;
- never change configuration, permissions, verification, or billing;
- only offer server-authorized workflow tools for the current call.

Advanced tenant text may narrow or personalize behavior but cannot override these rules.

## 7. Workflow and tool execution

The existing Phase 35 workflow model remains authoritative: a versioned graph has condition, action, AI-decision, and route nodes; publishing creates an immutable active version; channels select a published flow; traces and action runs record execution. Prebuilt receptionist, support-desk, after-hours, and lead-capture templates are editable starting points.

Optional automation rules and actions preserve configuration when disabled. Commercial alert settings are a channel-owned managed rule with a stable `managed_key`, a tenant/channel advisory lock, and a unique tenant/key database constraint. Saving email, Slack, or webhook settings upserts that rule independently of workflow publication; disabled actions remain configured but cannot execute. Destination policy validates bounded email addresses or an enabled, non-archived, current-tenant CallCommand endpoint with the required event type. Both Realtime tool binding and dispatch re-check the rule's exact channel condition, so a rule for one phone number cannot fire for another.

The runtime checks `enabled` immediately before reservation/execution. An enabled action is not model authority by itself: the server derives available tools from trusted tenant, exact channel, agent, published workflow, current call, verified destinations, and member role.

Action execution uses reserve-before-effect idempotency:

1. create or claim the tenant/call/idempotency-key action run;
2. return the existing run on replay;
3. execute only if the reservation is owned and its lease is valid;
4. persist the terminal outcome, safe provider reference, and bounded error;
5. associate generated ticket, lead, or task with the action run under a unique tenant-composite key.

This ordering prevents a process retry from sending a second email/Slack/webhook or creating a duplicate OperatorOS object after the first effect succeeded. External integrations still need provider-level idempotency where offered.

Transfers are limited to an active, tenant-owned destination that has completed server-observed verification. The browser cannot submit `verified=true`. Transfer verification has a bounded challenge, expiry, attempt count, provider reference, and terminal state. The active call transfer path must honor announce/blind mode, timeout, busy/no-answer fallback, and audit. OpenAI documents SIP `refer`; Twilio also documents [SIP call transfer](https://www.twilio.com/docs/sip-trunking/call-transfer), [Refer to Twilio](https://www.twilio.com/docs/voice/api/refer-to-twilio), and [conference-based control](https://www.twilio.com/docs/voice/twiml/conference).

## 8. Call lifecycle and concurrency

### 8.1 Replay-safe ingress

Twilio signs voice webhooks; CallCommand reconstructs the exact externally visible HTTPS URL and validates the signature before processing. The official requirement and algorithm are documented in [Twilio webhook security](https://www.twilio.com/docs/usage/security). A verified receipt key/body hash prevents the same event from creating a second call/session and rejects a key replayed with a conflicting body.

The call and live-session model enforces at most one live session per tenant/call and per tenant/provider call SID. No transcript, WebSocket, tool set, or state object is module-global.

### 8.2 Atomic lane admission

One **AI Concurrent Call Lane** admits one active AI conversation. It is unrelated to the number of phone numbers.

```text
effective_lanes = base_lanes + additional_lanes
settled_additional_lanes = additional_lanes only while the add-on is active
                           and its billing period is current
admission_lanes = base_lanes + settled_additional_lanes
pending_additional_lanes never participates in admission
```

The included base lane remains available to an otherwise eligible CallCommand tenant call even when an optional lane purchase is pending, past due, canceled, failed, or absent. Those billing states remove only paid extra capacity. This avoids an add-on failure incorrectly revoking the base CallCommand product while still preventing unpaid additional lanes from being used.

Lane allocation is a database transaction. It takes a tenant-specific PostgreSQL advisory transaction lock, expires stale leases, locks/reads the settled entitlement, returns an existing lease for an idempotent replay, determines occupied lane numbers, inserts one available lease, and associates it with the call. A unique active `(tenant, lane_number)` index provides a second database invariant against concurrent requests winning the same lane. Active-call state is therefore safe across multiple API processes; it is not a process-local counter.

Leases have bounded expiry and are renewed by active runtime progress. Normal terminal callbacks, transfer completion, explicit end, call setup failure, and reconciliation release them. A reaper marks abandoned expired leases and a reconciler compares provider terminal state with local state after application restart or missed callbacks.

Twilio distinguishes call initiation rate from simultaneous call capacity. Provider CPS, SIP trunk, account, geographic, and OpenAI project limits remain hard ceilings even if OperatorOS entitles more lanes. See Twilio's [call throughput guidance](https://help.twilio.com/articles/223180028-How-fast-can-I-place-or-receive-phone-calls-with-Twilio-) and [Elastic SIP Trunking scale and limits](https://www.twilio.com/docs/sip-trunking/scale-and-limits).

### 8.3 Over-capacity behavior

The lane gate runs before recording, AI acceptance, or a billable AI session begins. Saturated calls follow the tenant's explicit policy:

- queue with a bounded timeout and honest position information where supported;
- play a custom message;
- voicemail, subject to recording/consent policy;
- forward to a server-verified destination;
- refuse/busy.

Twilio's [Enqueue TwiML](https://www.twilio.com/docs/voice/twiml/enqueue) is the provider primitive for the queue option. The product must not estimate wait time without sufficient observed data, call a queue “unlimited,” or grant secondary AI overflow before its entitlement is active.

## 9. Realtime SIP and sideband control

OpenAI's documented incoming SIP flow requires a project webhook and a TLS SIP URI such as `sip:$PROJECT_ID@sip.api.openai.com;transport=tls`. OpenAI sends a signed `realtime.call.incoming` event; CallCommand validates and deduplicates it, correlates the SIP call to the already admitted CallCommand call and lease, then accepts or rejects it server-side.

The Twilio ingress creates an HMAC route token bound to both the internal CallCommand call UUID and the exact Twilio Call SID. The SIP leg carries that token and the internal call identifier in bounded custom headers. After the OpenAI raw-body webhook signature is verified, the server extracts those signed SIP headers and compares the token in constant time before trusting the call mapping. Neither a caller-supplied SIP header nor an unsigned JSON call ID can select a tenant call.

Acceptance supplies the approved model, voice, compiled instructions, and narrowly defined tools. The sideband WebSocket joins the existing call by OpenAI call ID, records lifecycle/tool events, performs server authorization for every tool request, returns bounded tool results, and terminates when the call reaches a terminal state. OpenAI's SIP guide documents accept, reject, monitor, refer, and hangup operations.

The source route is registered at `POST /v1/modules/callcommand-ai/openai/realtime/incoming`. Before Twilio emits SIP, the signed ingress evaluates the same exported server-owned eligibility predicate used by the receiving route: general/non-MSP routing, active profile and published flow, live/after-hours behavior, Realtime readiness, tenant activation, the exact channel's active provider account and secret, provider number ownership, and the configured inbound route. The consent continuation and OpenAI receiving route repeat the exact-line readiness check; enabling one healthy line cannot make a second incomplete line eligible. Commercial activation acquires a tenant advisory lock and locks the exact channel/profile/flow/account/secret rows before persisting runtime activation, closing the earlier check-then-update window. Consent-required recording or transcription goes through signed DTMF consent before SIP; enabled recording must start successfully before the call continues, while a policy-disabled recording is never left falsely `pending`.

The OpenAI route uses the exact signed raw body, deduplicates provider events with payload-conflict detection, requires the already admitted active call and lease, excludes MSP routing, and accepts the allowlisted model with server-compiled profile/knowledge/instructions and closed tool schemas. Its ingestion owner, attempt counter, and 30-second processing lease distinguish processing, accepting, provider-confirmed, sideband-connecting, and sideband-connected work. An expired processing lease can be reclaimed, and an accepted call without an owned controller can reattach rather than being permanently acknowledged as a completed duplicate. The database does not mark the call connected until the isolated controller passes an eight-second socket-open wait; a construction/open failure closes or hangs up the provider call, records failure, and releases the lane. The per-process registry prevents duplicate active controllers and the signed terminal route closes its controller before terminal reconciliation.

Sideband callbacks persist policy-permitted bounded transcripts, response-level token usage, safe provider errors, and safe callback-failure health/audit evidence. Server-authorized tool/action effects use reservation-before-effect and accept success only from `completed`, `delivered`, `queued`, or `test_recorded` states; an expired uncertain reservation becomes `outcome_unknown` and cannot be reported to the model/caller as success. External transfers resolve only a current server-held verified tenant target; model arguments cannot choose an arbitrary destination.

This is source integration, not live-provider proof. No public OpenAI webhook delivery, SIP negotiation, sustained sideband process, provider transfer, hangup, reconnect, or deployed failure-recovery result is claimed until the live gates in section 17 pass. The commercial workspace also treats OpenAI project, webhook secret, route secret, and allowlisted model readiness as mandatory: Go Live remains locked until the full tenant/provider/number/routing/agent/workflow/realtime checklist passes, and activation persists `realtime_enabled=true` only through the guarded runtime-settings contract.

## 10. Billing and entitlement contract

The commercial add-on is:

- **Product:** CallCommand AI — Concurrent Call Lane
- **Billing model:** recurring monthly, licensed quantity
- **Quantity meaning:** additional simultaneous AI calls above the base allocation
- **Recommended/default retail price:** **$49 USD per additional lane per month**
- **Stable lookup key:** `operatoros_callcommand_concurrent_lane_monthly_v1`
- **Entitlement:** `callcommand.concurrent_calls`
- **Feature metadata:** `concurrent_call_lane`

Stripe documents quantity-based licensed subscriptions in [Subscription quantities](https://docs.stripe.com/billing/subscriptions/quantities). OperatorOS creates or updates the existing tenant/customer subscription item through its central Stripe client. Checkout and subscription changes carry stable module/feature/entitlement metadata and a configured Price ID; source code does not create an uncontrolled duplicate product or price.

The customer request writes `pending_additional_lanes` and billing state `pending`. It does **not** increase `additional_lanes` or admission capacity. Each quantity request requires a bounded tenant idempotency key. OperatorOS reserves that request under a tenant advisory lock, replays the same response for the same payload, rejects payload conflicts, and sends a deterministic derived idempotency key to Stripe customer, Checkout, and subscription-update operations.

Quantity zero is an explicit paid-lane cancellation request, not an immediate entitlement mutation. It requires a second destructive confirmation and schedules `cancel_at_period_end=true`; settled paid lanes remain usable until the signed `customer.subscription.deleted` event removes them. Settlement clears the obsolete subscription and item identifiers, so a later positive quantity creates a fresh Checkout instead of trying to update a canceled Stripe subscription. A positive update clears any scheduled cancellation. Only a verified, canonical, idempotent Stripe webhook can make a paid quantity effective. Failed payment, cancellation, deletion, or entitlement revocation removes additional capacity according to the selected billing state while leaving the included base allocation intact. Event creation time/version and the platform webhook receipt protect against out-of-order or replayed events.

Capacity is a subscription value, not a usage allowance. The business model must also charge or cap variable consumption. The recommended initial retail guardrails are:

- standard realtime tier: start at **$0.15/minute** after any deliberately selected included allowance;
- premium realtime tier: start at **$0.35/minute** after its allowance;
- no “unlimited voice” representation until observed utilization, negotiated provider rates, abuse controls, and margin reserves support it.

These are configurable commercial recommendations, not hardcoded provider facts. Taxes, discounts, negotiated pricing, recording, transcription, transfer legs, toll-free traffic, international traffic, and support must be modeled separately.

## 11. Usage ledger and reconciliation

The call row carries the latest operational rollup; the usage ledger is the auditable source for charges and corrections. Each event directly contains the tenant/call key, event type, quantity/unit, provider event/reference, occurrence time, currency, telephony/AI/total minor costs, and bounded usage details. The tenant-composite call relationship resolves the number, agent, provider call, timestamps, lane, outcome, workflow, and other operational rollups without duplicating mutable labels into every ledger row.

Usage events are append-only. Corrections are new events linked to the prior fact; updates and deletes are rejected. A tenant/provider/idempotency key prevents duplicate terminal callbacks or reconciliation jobs from posting the same charge twice.

Terminal processing observes provider sequence/timestamp ordering, updates the call rollup once, appends the usage event, closes the live session, and releases the lease in one controlled reconciliation path. Later provider usage records may append cost adjustments without rewriting the original event. Twilio's [Usage Records API](https://www.twilio.com/docs/usage/api/usage-record) is a reconciliation source; Stripe is not the only usage database.

## 12. Privacy, recording, and retention

Recording and transcription default to a consent-aware or disabled posture. The profile stores separate policies, a consent message/flow is required where configured, and retained content follows a bounded tenant policy. Callers' legal jurisdiction cannot be inferred reliably from a phone number alone; the tenant remains responsible for applicable notice/consent requirements. CallCommand does not make a legal-compliance guarantee.

Operational metrics and super-admin health views should expose counts, states, provider errors, and correlation IDs without automatically exposing transcript, recording, caller content, or secrets. Recording URLs are private and authorization-checked. Deletion/legal-hold behavior must use shared OperatorOS privacy infrastructure before any production retention claim is made.

## 13. Security controls

- Validate Twilio and OpenAI webhook signatures over the exact raw body/URL and enforce timestamp/replay policy.
- Resolve tenant and number from trusted server/provider facts; fail closed on disagreement.
- Store provider credentials and tenant integration secrets through encrypted OperatorOS secret references.
- Enforce tenant-composite foreign keys, server RBAC, module entitlement, and cross-tenant non-enumeration.
- Reserve workflow actions before side effects; validate each tool invocation independent of model text.
- Require server-observed transfer verification; never accept browser verification authority.
- Restrict webhook destinations to HTTPS, resolve DNS safely, block loopback/link-local/private/internal ranges, revalidate redirects, sign payloads, bound body/timeout/retries, and redact secrets.
- Sanitize tenant instructions and treat caller text, transcripts, website content, and documents as untrusted prompt data.
- Rate-limit public provider callbacks and authenticated mutation endpoints without collapsing different tenants into one quota.
- Never log authorization headers, auth tokens, SIP credentials, verification codes, recordings, or full transcripts in operational logs.
- Keep CallCommand's general commercial route separate from the MSP assurance route and OutCall's verified-self safety boundary.

## 14. Observability and health

Structured runtime records and logs correlate at minimum:

```text
tenant_id
telephony_account_id
phone_number_id
call_id
provider_call_id
capacity_lease_id
agent_id
workflow_id
workflow_execution_id
action_run_id
provider_event_id
```

Health checks report `healthy`, `warning/degraded`, `action required/unavailable`, or `failed` with safe reason codes for provider account access, number ownership, inbound routing, OpenAI project/runtime readiness, workflow assignment, transfer verification, entitlement, notification integrations, and recent reconciliation.

Metrics should include active calls, lane utilization/saturation, queue depth/timeouts, setup failures, SIP/OpenAI connection failures, webhook signature/replay failures, workflow/action failures, transfer attempts/outcomes, provider callback lag, stale lease recovery, and usage-reconciliation drift. Metrics are tenant-partitioned; system operators receive aggregates and identifiers, not automatic access to call content.

## 15. Failure handling

| Failure | Required behavior |
|---|---|
| Invalid/unsigned provider event | Reject before tenant data mutation; record bounded security telemetry |
| Duplicate event | Return the existing receipt/result; do not create another session, action, usage event, or charge |
| Twilio account/number unavailable | Mark health degraded/unavailable and keep go-live locked |
| No lane | Execute the configured non-AI overflow path before AI/recording cost starts |
| OpenAI SIP/accept failure | Release the lane and use a safe provider fallback; never leave an active ghost session |
| Sideband worker interruption | Reconnect/reconcile by call ID within bounds or terminate/fallback; tools stay unavailable until server control is restored |
| Workflow action timeout | Persist retryable/terminal state; do not tell the caller it succeeded |
| Transfer busy/no answer | Use the configured fallback and persist the attempt/outcome |
| Subscription payment failure/cancel | Apply webhook-derived billing status and remove unearned additional lanes without browser authority |
| Missed terminal callback/restart | Reconcile provider state, append missing terminal evidence once, and expire/release stale lease |

## 16. Deployment, migration, and rollback

The database change is additive through the repository's ordered release manifest. Review with `corepack pnpm db:plan`; apply only through the approved root path with `OPERATOROS_DATABASE_RELEASE_MODE=apply` after an authorized backup. Child-source migrations and ad hoc `drizzle-kit push` are prohibited.

Rollout order:

1. create and verify a production backup and restore point;
2. deploy schema/control-plane code with realtime and number automation disabled by default;
3. configure central Stripe price, Twilio parent account, secret encryption, and OpenAI project/webhook;
4. enable one internal test tenant/subaccount and one test number;
5. prove signed ingress, replay, lane saturation, overflow, SIP/realtime, tools, transfer, terminal usage, and webhook-driven lane changes;
6. observe errors, costs, callback lag, and lease reconciliation through a bounded canary;
7. expand tenants only after acceptance criteria pass.

Rollback stops new activation first, restores the previous number routing through provider-confirmed operations, disables realtime admission, lets active calls end or explicitly fails them over, reconciles leases/usage, and reverts application code. Additive records remain for audit unless an approved data rollback says otherwise. Never delete a live provider number or restore production data without explicit human approval.

## 17. Live acceptance gates

This architecture is not production accepted until the exact deployed revision proves all of the following with authorized test accounts:

- production database backup, additive apply/reapply evidence, and restore rehearsal;
- tenant Twilio subaccount creation and credential/signature behavior;
- number search, purchase, automated route configuration, inspection, test call, disable, and confirmed release;
- signed Twilio ingress and duplicate/conflicting replay behavior;
- OpenAI signed incoming SIP event, accept, sideband tool call, transfer, hangup, and outage fallback;
- several concurrent calls, saturation overflow, lane release on every terminal/error path, and restart reconciliation;
- Stripe new subscription item, upgrade, downgrade, proration decision, payment failure, cancellation, event replay/order, and entitlement propagation;
- provider-vs-internal usage reconciliation and margin reporting;
- exact-host desktop/mobile/auth/tenant isolation and operational monitoring.

Until then, customer-facing activation must remain locked or clearly labeled as unavailable in that environment.

## 18. Official source index

The external facts in this decision were refreshed from official sources on 2026-08-31. Prices, models, rate limits, and provider policies can change and must be refreshed before catalog activation.

- OpenAI: [Realtime SIP](https://developers.openai.com/api/docs/guides/realtime-sip), [server-side controls](https://developers.openai.com/api/docs/guides/realtime-server-controls), [Realtime cost management](https://developers.openai.com/api/docs/guides/realtime-costs), [GPT-Realtime-2.1](https://developers.openai.com/api/docs/models/gpt-realtime-2.1), [GPT-Realtime-2.1 Mini](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini)
- Twilio: [webhook security](https://www.twilio.com/docs/usage/security), [Subaccounts API](https://www.twilio.com/docs/iam/api/subaccounts), [available local numbers](https://www.twilio.com/docs/phone-numbers/api/availablephonenumberlocal-resource), [incoming phone numbers](https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource), [Voice pricing](https://www.twilio.com/en-us/voice/pricing/us), [Media Streams](https://www.twilio.com/docs/voice/media-streams), [Stream TwiML](https://www.twilio.com/docs/voice/twiml/stream), [Enqueue](https://www.twilio.com/docs/voice/twiml/enqueue), [Call resource](https://www.twilio.com/docs/voice/api/call-resource), [SIP transfer](https://www.twilio.com/docs/sip-trunking/call-transfer), [Usage Records](https://www.twilio.com/docs/usage/api/usage-record)
- Stripe: [US pricing](https://stripe.com/us/pricing), [subscription quantities](https://docs.stripe.com/billing/subscriptions/quantities), [usage-based billing concepts](https://docs.stripe.com/billing/subscriptions/usage-based/how-it-works), [meter configuration](https://docs.stripe.com/billing/subscriptions/usage-based/meters/configure), [subscription updates](https://docs.stripe.com/api/subscriptions/update), [subscription price changes](https://docs.stripe.com/billing/subscriptions/change-price), [Entitlements](https://docs.stripe.com/billing/entitlements)
