# Torque Assist architecture

Assessment date: 2026-07-18
Branch: `codex/phase-8-torque-assist`

## Authority boundary

Torque Assist is a TorqueShed diagnostic workflow hosted by OperatorOS. The
browser never chooses a provider, model, tenant, user, module, price, token
quantity, payment result, or ledger mutation. OperatorOS resolves identity,
tenant, module access, entitlements, package prices, checkout, signed payment
events, provider configuration, shared usage, audit, and session security.
TorqueShed owns the authorized diagnostic context and the debit caused by an
accepted diagnostic-assist result.

Standalone TorqueShed source remains read-only migration evidence. No child
identity, billing, provider key, migration, runtime, or repository is mounted
or copied into OperatorOS.

## Request flow

1. An authenticated module session requests a server-generated context
   preview for a diagnostic it may read.
2. The server reloads the trusted vehicle, diagnostic, trouble codes,
   freeze-frame data, typed observations, hypotheses, repair history, and
   bounded follow-up answers. It does not include plaintext VIN data.
3. The server calculates a deterministic context hash, item count, character
   count, and estimated provider units. Context is capped at 48,000
   characters.
4. A tenant/user idempotency lease, per-minute user and tenant limits, module
   entitlement, provider state, and append-only ledger balance are checked.
5. The shared AI adapter receives one structured JSON request. Production
   selects the configured server-side adapter; tests use the deterministic
   adapter only when OperatorOS is explicitly in test mode.
6. At most two bounded provider attempts are allowed. A tenant-scoped circuit
   opens for 60 seconds after three failed assist requests.
7. The response must parse into the strict Torque Assist schema and pass
   confidence, certainty, and safety validation.
8. One transaction rechecks the computed balance under an advisory lock and
   writes the accepted assist request, exactly one debit, shared usage,
   activity, audit, and idempotency completion. A provider failure or rejected
   response creates no debit.

## Structured result

An accepted response contains:

- observed and user-entered facts with explicit source labels;
- assumptions separated from facts;
- ranked hypotheses limited to `low` or `medium` confidence;
- supporting and contradicting evidence;
- safety warnings and escalation guidance;
- prioritized tests with rationale, procedure, and stop conditions;
- targeted follow-up questions when evidence is insufficient; and
- the fixed diagnostic-assistance disclaimer.

High-confidence diagnosis and unsafe certainty language are rejected. Brake,
steering, fuel/fire, high-voltage, airbag/SRS, and lifting contexts require
specific stop/escalation guidance. General shop safety remains mandatory for
all other results. Torque Assist is decision support, not a repair
authorization or safety certification.

## Data and observability

`torqueshed_assist_requests` stores the context hash/count/size, estimate,
actual units, provider/model/version, attempt count, outcome, latency, safe
error code, and accepted structured response. It has no full-prompt column.
Provider errors are reduced to bounded codes; secrets, raw credentials, and
full prompts are not logged.

`torqueshed_assist_rate_windows` and
`torqueshed_ai_provider_circuits` are tenant-scoped operational state.
`shared_idempotency_keys`, shared usage, activity, and platform audit retain
the cross-platform execution evidence. The accounting source of truth is
described in `TOKEN_LEDGER.md`.

## HTTP surface

Authenticated TorqueShed module routes:

- `GET /v1/modules/torqueshed/torque-assist/status`
- `GET /v1/modules/torqueshed/diagnostics/:id/torque-assist/context`
- `GET /v1/modules/torqueshed/diagnostics/:id/torque-assist`
- `POST /v1/modules/torqueshed/torque-assist`
- `POST /v1/modules/torqueshed/token-purchases/checkout`
- `GET /v1/modules/torqueshed/token-ledger`
- `GET /v1/modules/torqueshed/token-ledger/reconciliation` (manager only)

Central OperatorOS billing route:

- `POST /v1/billing/torque-assist/webhook`

The webhook consumes the exact raw body, validates the Stripe signature
through the shared payment adapter, separates test/live mode, and dispatches
through the shared idempotent webhook receipt/handler system.

## UI behavior

The in-session diagnostic panel shows the server-derived context summary,
provider/payment state, computed balance, server-owned packages, estimated
and actual units, structured result, ledger history, and safe retry state.
The same idempotency key is retained when a request may be safely retried.
Disabled provider/payment states and deterministic-test mode are labeled; the
UI never presents a browser redirect or unsigned success return as a credit.

## Current verification boundary

The source/domain/static contracts pass. Database-backed payment, refund,
append-only, rate-limit, provider-failure, tenant-isolation, and concurrent
debit tests exist but were not run because Docker Desktop does not provide a
usable PostgreSQL daemon on this workstation. Production build/runtime and
browser acceptance are therefore not inferred, and consolidation state
remains 3.
