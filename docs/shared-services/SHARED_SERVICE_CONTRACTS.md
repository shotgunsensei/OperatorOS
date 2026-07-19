# OperatorOS shared service contracts

Status: Phase 3 source/local accepted on 2026-07-18. These contracts are
internal server APIs; they are not browser authority.

## Required scope

Every call is made after OperatorOS authentication, tenant membership, module
entitlement, and write authorization where applicable. Persisted calls require
trusted `tenantId` and `moduleId`. A browser-provided tenant selection must be
revalidated before it reaches these functions.

## Attachments

- Create with `createAttachment`; supply object type/id, actor, original name,
  declared MIME, bytes, optional retention, and correlation ID.
- The service validates size, signature, declared/detected MIME agreement,
  hashes content, assigns a private randomized key, stores the blob through
  the configured adapter, and queues a scan job.
- List/read/delete always require tenant, module, and object scope. Reads fail
  while pending/error and quarantine infected content. Soft delete uses an
  optimistic version. The worker purges private blob content after an explicit
  retention deadline while preserving bounded attachment metadata.
- The initial adapter is `postgres`; `ATTACHMENT_MAX_BYTES` defaults to 10 MiB
  and is hard-capped at 25 MiB. Unsupported adapters fail closed.
- The calling domain transaction must append activity and platform audit when
  an attachment changes a business record. The TradeFlowKit proof is the
  reference implementation.

## Notifications and outbound intent

- Save templates with `saveNotificationTemplate`; updates require the current
  version. `{{path.to.scalar}}` variables are bounded and rendered only after
  metadata redaction.
- Enqueue pre-rendered intent with `enqueueOutboxMessage` or a versioned
  template with `enqueueTemplatedOutboxMessage`.
- Channels are `in_app`, `email`, and `sms`. Each enqueue requires a stable
  module idempotency key. Modules do not call provider SDKs from UI handlers.
- Workers persist provider name/message ID, delivery time, safe failure code,
  retry count, and disabled/dead-letter state. No message content is logged.

## Providers

| Kind | Configured adapter | Disabled behavior | Test behavior |
| --- | --- | --- | --- |
| Email | Resend with API key plus explicit sender | `PROVIDER_DISABLED` / invite `EMAIL_PROVIDER_DISABLED` | Deterministic ID, test environment only |
| SMS | Twilio resolved server-side | `PROVIDER_DISABLED` | Deterministic ID, test environment only |
| Payments | OperatorOS Stripe verifier | Webhook verification unavailable | Deterministic signed-payload verifier |
| AI | OpenAI | Throws explicit disabled error; no mock completion | Deterministic completion, test environment only |

`/readyz` exposes only configured/disabled states and never values. Optional
providers may be disabled while the core runtime is ready; a module feature
that requires one must remain unavailable until its provider profile passes.

## Jobs and worker

- Register handlers at server boot and enqueue durable jobs with tenant,
  module, safe payload, handler key, idempotency key, and correlation ID.
- Outbox, jobs, and webhook receipts use `FOR UPDATE SKIP LOCKED` leases,
  bounded batches, exponential retry, and dead-letter state.
- Expired `processing` leases are reclaimable after a crash. SIGINT/SIGTERM
  closes Fastify, stops new cycles, and waits up to ten seconds for the active
  cycle. Completion/failure updates require the current lease owner, so a stale
  worker cannot overwrite a replacement. The interval is unreferenced so it
  cannot keep a stopped process open.

## Webhooks

- Verify against the exact raw body before calling `receiveWebhook` or
  `receiveVerifiedWebhook`.
- Store provider/event identity, tenant/module/handler binding, SHA-256 body
  hash, verified flag, and a redacted safe payload. Do not persist the raw
  provider body in this ledger.
- A duplicate matching event is replay-safe; a changed body or scope under the
  same provider event ID is a conflict. Handlers must remain idempotent because
  a crash can occur between an external effect and receipt completion.

## Usage, activity, and idempotency

- `recordUsageEvent` appends positive integer units with tenant, user, module,
  operation, unit kind, idempotency key, external reference, and redacted
  metadata. `summarizeUsage` derives totals; it is not a mutable balance.
- `appendActivityEvent` writes bounded operational summaries and redacted
  metadata. `listActivityEvents` is tenant/module/object scoped with an opaque
  cursor.
- `beginIdempotentOperation` hashes a canonical request. Callers complete or
  fail the claim in the same transaction as domain writes. Exact repeats
  replay the saved response; changed requests conflict; abandoned claims are
  recoverable after their lease. A reclaimed lease invalidates completion by
  the stale caller.

## Operational status

`GET /v1/modules/:moduleSlug/services/status` is entitlement guarded and
returns provider states, attachment/scanner state, worker state, and aggregate
queue counts. User notification, activity, and usage routes are likewise
tenant/module scoped. Queue inspection and replay administration remain an
operations feature for a later hardening phase; Phase 3 does not expose an
unsafe arbitrary replay endpoint.
