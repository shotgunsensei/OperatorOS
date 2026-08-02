# ADR-0032: TradeFlowKit restores controlled public intake and tenant business payments

- Status: Accepted
- Date: 2026-08-02
- Scope: TradeFlowKit public lead capture, signed source adapters, and Stripe Connect customer payments

## Context

The final eight classified TradeFlowKit source gaps are three anonymous/public
lead-intake contracts and five Stripe Connect business-payment contracts. The
standalone implementations cannot be copied directly: they lack the approved
OperatorOS consent, abuse, shared-idempotency, tenant-binding, exact-host,
webhook, and subscription-billing boundaries.

The gaps nevertheless represent real paying-customer value. A controlled
public form converts prospects into the existing lead workflow. A connected
tenant Stripe account lets the tenant collect its own invoice balance without
turning a business payment into an OperatorOS subscription or entitlement.

## Decision

1. A tenant admin may enable one TradeFlowKit public capture form only after
   configuring an HTTPS privacy notice, explicit consent text and version, and
   rotating a 256-bit opaque public token. Only its SHA-256 hash is stored.
2. Public submissions require the current consent version, a bounded JSON
   body, an `Idempotency-Key`, a blank honeypot, and two database-backed rate
   limits. Client buckets are HMAC fingerprints; raw IP addresses are not
   stored. Accepted leads and their consent evidence are written under the
   server-resolved capture-form tenant with no fabricated user actor.
3. `n8n` and `generic-json` ingress are tenant-admin allowlisted and require an
   HMAC-SHA256 signature over the exact preserved request body. Per-form,
   per-adapter secrets are derived from the server-only
   `TRADEFLOWKIT_PUBLIC_INTAKE_HMAC_SECRET`; they are disclosed only through an
   explicit admin action and are never stored or returned by normal reads.
4. Automatic unsolicited lead response remains disabled. Existing follow-up
   schedules may be created transactionally, but an entitled operator still
   queues or completes delivery through the shared OperatorOS outbox.
5. Optional TradeFlowKit customer payments use a tenant-connected Stripe
   Standard account and direct-charge Checkout Sessions. OAuth state is random,
   short lived, single use, and bound to the exact callback, tenant, admin user,
   and relative return path. The database stores the connected account ID and
   capabilities only; OAuth access and refresh tokens are discarded.
6. Checkout amount and currency come from the locked server invoice and tenant
   settings. A pending first-class payment row exists before the provider call.
   Stripe idempotency binds the Checkout Session to that row and connected
   account. Browser redirects never settle an invoice.
7. Connected-account Checkout events use
   `TRADEFLOWKIT_STRIPE_CONNECT_WEBHOOK_SECRET`, separate from the OperatorOS
   `STRIPE_WEBHOOK_SECRET`. The handler verifies exact raw bytes, Stripe mode,
   connected account, session/payment/invoice binding, amount, currency, and
   tenant before an atomic payment/invoice/job transition through the shared
   webhook receipt/deduplication/retry ledger.
8. OperatorOS remains the sole owner of subscription/add-on billing and
   entitlements. TradeFlowKit business payments never create, change, or infer
   platform access.
9. Both surfaces fail closed while their environment secrets are absent or
   inconsistent. Test/live secret, connected-account, and event modes must
   agree. No deployment, provider activation, or live transaction is
   authorized by this ADR.

## Consequences

- The executable source ledger can classify all 277 captured capabilities
  without a remaining restoration gap.
- Paying tenants receive a controlled prospect form, signed integration
  ingress, Stripe connection controls, and invoice Checkout links.
- Tenant admins must copy rotated public URLs and explicitly revealed adapter
  secrets at creation time; normal reads cannot recover them.
- A legacy Standard-account OAuth flow is retained only for this bounded source
  contract. A future move to Stripe-hosted Account onboarding or Accounts v2
  requires a separate migration decision and compatibility plan.

## Data, security, and privacy

Release v32 makes public lead actors nullable and records capture-form ID,
consent version, and consent timestamp. It adds hashed-token privacy controls,
HMAC-keyed persistent rate buckets, tenant-composite foreign keys, connected
account metadata, one-time OAuth state, and provider settlement references.
No raw public token, adapter secret, client IP, Stripe secret, OAuth token,
card data, or customer payment credential is persisted.

Public activity metadata contains identifiers and consent version only, not
lead message content. Provider webhook receipts retain only a payload hash and
bounded settlement identifiers. Foreign tenant resources are never
enumerated.

## Migration and rollback

The ordered idempotent v32 step is additive except for relaxing the public-lead
actor column and correcting pending-payment timestamps to nullable semantics.
It removes the v31 database check that forced public intake off and replaces it
with configuration/consent constraints. Production apply still requires the
root release gate and a backup under `docs/DATABASE_BACKUP_RESTORE.md`.

Application rollback disables the new routes/UI. Operators should first turn
off public intake and stop creating payment links. Additive rows remain for
audit/reconciliation; destructive down migration is not performed. A provider
rollback also disables the Connect webhook endpoint and deauthorizes tenant
accounts only through the explicit admin workflow.

## Superseded records

ADR-0030's temporary decision to force anonymous intake off is superseded by
the controlled intake contract above; its automatic-response and shared-outbox
decisions remain accepted. ADR-0031's statement that public intake and business
payments remained undecided gaps is superseded. No identity, tenant,
entitlement, platform-billing, or shared-service authority decision is changed.
