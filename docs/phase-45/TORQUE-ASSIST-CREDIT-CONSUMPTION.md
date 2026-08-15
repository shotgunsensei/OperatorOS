# Phase 45 Torque Assist credit consumption

Status: **source/local accepted; approved AI and Stripe provider journeys remain externally gated**

Assessment date: 2026-08-15 (America/New_York)

## Outcome

Torque Assist now authorizes paid provider work with an explicit durable
reservation. Available units are computed from the immutable token ledger less
active, unexpired reservations for the trusted tenant, module, and user. The
provider never receives a request until a transaction has locked that balance
scope, validated the tenant-owned diagnostic context, claimed shared
idempotency, passed rate limits, and persisted both the Assist request and its
reservation.

Free runs are not part of the current contract. The status API reports
`consumptionMode: paid_credits_only`; provider enablement alone cannot bypass
the balance check.

## Reservation invariants

- `torqueshed_token_reservations` is tenant-, user-, module-, diagnostic-,
  Assist-request-, and idempotency-scoped. Composite foreign keys keep the
  diagnostic and request inside the same tenant.
- One request owns at most one reservation, and one tenant/user/idempotency key
  owns at most one reservation.
- A reservation is `active`, `settled`, `released`, or `expired`. Database
  constraints require a terminal row to account for all reserved units.
- Available balance is `ledger balance - active unexpired reserved units`.
- The maximum reservation is
  `ceil((context characters + system-prompt characters + 4096) / 4) + 1200`.
  Context is capped at 48,000 characters and 1,000 structured items. Provider
  usage above the reservation is rejected and charged zero.
- The provider runs outside the database transaction. Success settlement then
  locks the request, reservation, and balance scope; appends one uniquely
  request-bound debit; records actual and released units; stores a sanitized
  provider receipt and accepted response; and completes shared idempotency in
  one transaction.
- Provider, timeout, parse, safety, cancellation, and internal failures release
  the complete reservation, append no debit, and persist a safe code,
  retryability guidance, and correlation reference.
- Reservations expire after three minutes. The boot/interval reaper and lazy
  request-path reaper use database time, are idempotent, release all units,
  mark the request expired, and release the corresponding shared idempotency
  lease for a safe retry.
- The existing append-only ledger trigger and unique Assist-debit index remain
  the final exactly-once accounting controls. No normal Assist path can write a
  negative balance.

## State transitions

| Starting state | Event | Request | Reservation | Ledger |
| --- | --- | --- | --- | --- |
| none | availability below maximum | `insufficient_balance` | none | unchanged |
| none | authorization succeeds | `processing` | `active` | unchanged |
| processing | accepted provider result | `complete` or `follow_up` | `settled`; actual consumed and remainder released | exactly one debit |
| processing | timeout/unavailable/invalid/safety failure | `provider_failed` or `response_invalid` | `released` | unchanged |
| processing | reservation TTL elapses | `expired` | `expired` | unchanged |
| terminal | same key and same body | replay | unchanged | unchanged |
| any | same key with different body | conflict | unchanged | unchanged |

## Actionable error contract

The TorqueShed error translator never displays provider exception text. It
preserves a stable code, safe customer message, retryability, administrator
action, request/correlation reference, and the `noCreditsConsumed` fact.

| Code | User action | Accounting result |
| --- | --- | --- |
| `TORQUE_ASSIST_CREDITS_REQUIRED` / `TORQUE_ASSIST_BALANCE_EXHAUSTED` | Settle or purchase a pack, then submit a new request | zero debit |
| `TORQUE_ASSIST_RESERVATION_CONFLICT` | Wait briefly and retry the same request key | zero debit |
| `TORQUE_ASSIST_RATE_LIMITED` | Wait one minute and retry the same key | zero debit |
| `TORQUE_ASSIST_PROVIDER_DISABLED` | Administrator validates approved provider configuration | zero debit |
| `TORQUE_ASSIST_PROVIDER_CIRCUIT_OPEN` | Wait for cooldown and inspect provider health | zero debit |
| `TORQUE_ASSIST_PROVIDER_UNAVAILABLE` | Retry once with the same key, then inspect provider health | zero debit |
| `TORQUE_ASSIST_PROVIDER_TIMEOUT` | Retry with the same key; investigate repeated latency | zero debit |
| `TORQUE_ASSIST_RESPONSE_INVALID` | Inspect provider/validator using the support reference | zero debit |
| `TORQUE_ASSIST_CONTEXT_INVALID` | Correct or reduce diagnostic evidence and submit a new request | zero debit |
| `TORQUE_ASSIST_SESSION_NOT_FOUND` | Return to Garage and reopen an accessible diagnostic | zero debit |
| `TORQUE_ASSIST_FORBIDDEN` | Ask a tenant owner to review role/module access | zero debit |
| `TORQUE_ASSIST_REQUEST_CONFLICT` | Refresh history; use a new key only for a new request | zero debit |
| billing/catalog/purchase readiness codes | Follow the specific catalog, webhook, release, or provider action | no purchase credit and no Assist debit |

Unknown codes use a safe fallback that includes the support reference and does
not echo a raw provider message.

## User experience

The Assist panel reports available, ledger, reserved, and estimated maximum
units before submission. Submit is disabled when the provider is disabled,
diagnostic context is unavailable, or available units are insufficient.
Accepted results report exact consumed, released, and remaining units.
Follow-up answers remain in session storage and a genuinely new follow-up gets
a new idempotency key; replay of the same operation remains safe. Status,
context, history, and ledger load with independent `Promise.allSettled`
boundaries, so an Assist outage does not collapse the Garage workspace.

Browser evidence:

- [desktop credit availability and maximum reservation](screenshots/torque-assist-credit-availability.png)
- [mobile credit availability and maximum reservation](screenshots/torque-assist-mobile-availability.png)

These screenshots are from the compiled exact-host deterministic acceptance
fixture. They prove the production artifact UI and responsive state handling,
not live-provider acceptance.

## Executed evidence

| Command/gate | Result |
| --- | --- |
| reservation workflow against disposable PostgreSQL | PASS 1/1; success, exact debit/replay, actual-under-reservation remainder, provider timeout, invalid response, expiry, concurrency, tenant denial, rate limit, and unchanged existing records |
| release/static/UI translator contracts | PASS 22/22, zero skips |
| clean cumulative v52 apply / immediate reapply | PASS 52/52 in 20.554s; reapply verified in 1.895s (2.59s command wall time) |
| `corepack pnpm typecheck` | PASS across API, runner gateway, web, and native TorqueShed app |
| `corepack pnpm build:production` | PASS, including the production Next.js artifact |
| compiled exact-host TorqueShed browser fixture | PASS 1/1 with desktop/mobile screenshots |

## Acceptance and external gates

| Criterion | Result |
| --- | --- |
| Concurrent requests cannot overspend the same credits | PASS locally under row/advisory locking and an active reservation |
| Failed provider delivery consumes zero units | PASS for timeout, unavailable, invalid response, and expiry fixtures |
| Successful delivery creates one auditable debit | PASS locally; duplicate submission replays without another debit |
| Known errors are actionable rather than blanket generic text | PASS in executable translator tests and compiled browser UI |
| Real approved AI provider consumption | NOT RUN; no provider credential or traffic was authorized |
| Real Stripe test purchase feeding the Assist balance | NOT RUN; Phase 52 provider gate remains closed |
| Production deployment or live mutation | NOT ATTEMPTED; explicit owner gate |

No production database, Stripe object/payment, AI provider, deployment, tag,
push, or merge was mutated by this phase.
