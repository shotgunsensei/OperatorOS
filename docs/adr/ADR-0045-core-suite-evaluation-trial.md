# ADR-0045 — Verified-email Core Suite evaluation trial

- Status: Accepted for release v59 source/local candidate
- Date: 2026-09-01
- Supersedes: none

## Context

Prospective customers need to exercise the ecosystem's three primary paid
applications before purchasing them. The offer must not weaken OperatorOS as
the only identity, tenant, billing, entitlement, launch, and audit authority;
turn permanently free applications into paid products; include companion
applications; create a renewable browser-side clock; or destroy customer data
when evaluation access ends.

The platform already gives every account a server-owned personal tenant and
resolves module access from tenant grants, active subscriptions, plan mappings,
and add-ons. A time-bounded evaluation is therefore an additional access
source, not a synthetic Stripe subscription or a tenant-module grant.

## Decision

OperatorOS offers one no-card, seven-day Core Suite evaluation per normalized,
verified email identity for exactly:

- TradeFlowKit (`tradeflowkit`)
- TechDeck (`techdeck`)
- PulseDesk (`pulsedesk`)

The evaluation is available only in the verified user's server-resolved
personal tenant. The trial service never trusts a browser-selected user,
email, tenant, module list, start time, or end time. It locks the user, resolves
the active personal-owner tenant, uses PostgreSQL time, and writes one durable
168-hour trial window. Repeating the start request while that window is active
returns the same window and cannot extend it.

Eligibility is keyed by a versioned HMAC fingerprint of the normalized email,
using a stable server-only secret. Both the email-identity/offer key and the
user/offer key are unique. Re-registration, email case changes, or deletion and
recreation therefore cannot create another trial for the same verified email.
The raw email is not copied into the trial ledger.

The evaluation is a final access fallback after explicit deny, direct tenant
grants, active paid plan mappings, and active paid add-ons. It does not write
Stripe state or impersonate a paid entitlement. A server-confirmed plan or
add-on continues to grant access before, during, and after evaluation expiry.
OperatorOS's pre-existing platform-administrator and support authorities are
unchanged and are not customer payment paths.

Trial access is rechecked when exact-host SSO is issued, exchanged, consumed,
and refreshed. A module session granted by the trial cannot outlive the
database trial end. Once expired or revoked, the access source fails closed
while all tenant-owned module records remain stored under their existing
retention and deletion policies.

Permanently free applications continue through their existing free-account
grant path. Companion applications and every module outside the immutable
three-slug allowlist remain separately gated.

The customer workflow is feature-flagged off by default. A user who has not
verified the account email may request a non-enumerating verification message.
Verification tokens are random, hashed at rest, single-use, expiring, and
invalidated on email change. Starting the trial requires the persisted
`email_verified_at` value, not a browser assertion.

## Consequences

- Customers can evaluate all three primary applications for the same seven-day
  window without supplying a card.
- An active retry is safe and cannot reset or lengthen the clock.
- The durable email fingerprint prevents ordinary account recreation from
  renewing the offer.
- Organization tenants do not inherit an owner's personal evaluation.
- Companion and permanent-free product boundaries do not change.
- Expiry removes only the evaluation access source; it does not delete, hide,
  reassign, or mutate module business data.
- Paid plan and add-on settlement remain exclusively server-confirmed through
  the existing OperatorOS billing path.
- Customer support can distinguish verification-required, eligible, active,
  expired, already-used, and disabled states without exposing the fingerprint.

## Data and security impact

Release v59 adds `users.email_verified_at`, hashed email-verification tokens,
and a durable account-trial ledger. Trial rows include the versioned offer,
versioned HMAC fingerprint, subject user and personal tenant references,
start/end/revocation timestamps, and bounded audit metadata. Subject foreign
keys use `ON DELETE SET NULL` so account deletion cannot erase the once-used
email identity. Trial data is separate from Stripe subscription rows and
tenant-module grants.

Verification request responses use the same accepted status and body for
unknown, already-verified, and unverified addresses. Request rate limits bind
both the caller IP and normalized email. Production delivery fails disabled
unless the transactional-email provider and sender are configured. Tokens are
never stored in plaintext or written to audit details. Each token is also bound
to the normalized-email fingerprint captured at issuance; confirmation locks
the user and rejects the link if the account address has changed, even if token
cleanup was interrupted.

Production trial activation requires
`OPERATOROS_SELF_SERVICE_TRIALS_ENABLED=1`, a stable high-entropy
`OPERATOROS_TRIAL_IDENTITY_HMAC_SECRET`, and working transactional-email
configuration. Rotating the HMAC secret without a versioned identity migration
would permit a duplicate fingerprint, so it is operational key material and
must remain stable.

## Migration and rollback

Release v59 is additive and is applied only through the ordered OperatorOS
database release contract. Production requires a verified backup before apply,
then schema reconciliation and exact-host email, start, launch, expiry, and
paid-restoration acceptance.

Setting `OPERATOROS_SELF_SERVICE_TRIALS_ENABLED=0` immediately prevents new
self-service starts while preserving already-active windows so a deployment
rollback does not revoke promised access. The added tables and column may
remain during an application rollback. A safe data rollback restores the
pre-v59 backup into a new database and switches traffic according to
`docs/DATABASE_BACKUP_RESTORE.md`; it never drops the trial ledger in place.

An older application that does not understand trial-derived session expiry
must not receive traffic while trial-granted module sessions are active. Keep
the v59 SSO/session guards, disable trial launches and wait for active windows
to end, or restore the full pre-v59 application/database pair.

## Rejected alternatives

- Stripe `trialing` subscription: rejected because the offer is no-card and
  must not create fake provider or payment state.
- Client cookie or local-storage timer: rejected because it is renewable,
  bypassable, and cannot authorize child applications.
- Tenant-module trial grants: rejected because they blur evaluation and paid or
  administrative entitlement authority and could leak into company tenants.
- Trial every module: rejected because permanent-free and companion product
  classes have separate commercial boundaries.
- Delete or archive customer records on expiry: rejected because entitlement
  loss is not data-deletion consent.
- Email string as the durable key: rejected because it unnecessarily retains
  identity data after account deletion.
