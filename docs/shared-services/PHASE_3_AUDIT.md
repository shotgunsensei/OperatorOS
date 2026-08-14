# Phase 3 shared-infrastructure audit

- Audit date: 2026-07-18
- Canonical runtime: `C:\Dev\OperatorOS`
- Imported sources: `apps/modules/<slug>/source` (read-only evidence)

## Findings

| Capability | Evidence found | Decision |
| --- | --- | --- |
| Uploads/object storage | CallCommand AI contains Replit/GCS upload-intent and claim patterns; several products keep local upload paths or direct object URLs. | Reuse the atomic intent/claim idea, not child storage authority. OperatorOS stores private randomized keys and authorized content only. |
| Email/SMS | TradeFlowKit and PulseDesk call provider-specific SendGrid/Twilio/email workers; some development paths log or dry-run success. | Replace with the shared outbox and explicit Resend/Twilio adapters. Disabled providers are terminal and never pretend to deliver. |
| Payments/webhooks | Multiple children contain Stripe state and webhook handlers. | OperatorOS remains subscription/add-on billing authority. Module business-payment events must use the centralized payment adapter and verified receipt ledger. |
| AI providers | Snapshots call OpenAI or Anthropic directly and commonly fall back to mock/generated content. | Isolate AI behind the shared adapter. Test output exists only under test; unconfigured runtime AI is disabled. |
| Retry/background work | TechDeck has an in-process polling webhook worker with useful SSRF/HMAC/retry patterns but no durable lease; other products use timers and process memory. | Keep bounded retry concepts; replace process ownership with PostgreSQL leases, expired-lease recovery, and dead-letter state. |
| Notifications | BrandForgeOS and other products define separate notification tables and read state. | Replace with shared tenant/module/user notifications produced by the outbox. |
| Usage | BrandForgeOS and AI products define separate usage counters/events. | Replace with an append-only shared usage ledger; do not implement TorqueShed commercial logic in Phase 3. |
| Activity/audit | BrandForgeOS, SnapProofOS, StudyForge AI, and core imports define incompatible activity schemas. | Keep platform audit authority and add a reusable redacted module activity timeline. |
| Idempotency | CallCommand upload claims and several webhook/payment handlers contain useful one-time claim patterns. | Generalize stable request hashes, replayed responses, scope conflicts, and expiring processing leases. |

## Reusable patterns

- Exact raw-body verification before provider processing.
- Atomic claim/update semantics from upload-intent and webhook work.
- Bounded retry with explicit attempt counts.
- Hash-based integrity and deduplication.
- Domain-specific safe projections rather than storing provider payloads.

## Replaced patterns

- Module-local auth, tenant, entitlement, subscription, and platform billing.
- Child Drizzle migrations and standalone servers.
- In-memory production queues and process-only timers.
- Log-only/dry-run provider success and production mock AI.
- Public or browser-visible storage keys and URLs.
- Raw webhook, transcript, recording, credential, or PHI dumps.
- Mutable counters as the only usage source of truth.

## Thin proof integrations

- TradeFlowKit job attachments use the authenticated shared attachment,
  scan-job, usage, activity, outbox, notification, idempotency, and audit
  contracts without expanding TradeFlowKit product scope.
- CallCommand AI Twilio status callbacks verify the provider signature and use
  the shared receipt/deduplication/retry ledger before changing the call row.
- Existing tenant invitations now report explicit Resend/test/disabled email
  state and no longer print invitation links or bodies to logs.

The snapshots remain useful feature/parity evidence, but none of their shared
infrastructure is executable authority.
