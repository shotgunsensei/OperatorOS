# PulseDesk SSO Conversion

Phase 13 converts the imported PulseDesk module toward OperatorOS-controlled
SSO and removes active duplicate login, registration, and billing ownership.

## Changes Made

- Replaced the imported PulseDesk `/login` credential form with an OperatorOS
  launch/relaunch page.
- Removed visible local login, local registration, reviewer setup, password
  fields, and Microsoft 365 sign-in buttons from the PulseDesk auth page.
- Updated PulseDesk landing CTAs to open the OperatorOS Command Center module
  launch URL instead of local `/login`.
- Updated PulseDesk client auth helpers so `login()` and `register()` no longer
  post credentials to local PulseDesk endpoints.
- Updated protected PulseDesk middleware so normal protected API access requires
  `req.session.authSource === "operatoros"`.
- Updated protected PulseDesk middleware so normal users require an active
  PulseDesk OperatorOS entitlement snapshot.
- Preserved a server-side super-admin override through the imported
  `isSuperAdmin` flag produced by OperatorOS SSO provisioning.
- Converted local billing routes to managed-by-OperatorOS compatibility
  responses and removed Stripe checkout/session creation from
  `server/routes/billing.ts`.
- Added a visible return link to OperatorOS in the imported PulseDesk sidebar.
- Updated the OperatorOS PulseDesk shell to show standalone login as removed.
- Updated the active PulseDesk profile/security and authentication settings UI
  to point to OperatorOS account and SSO settings instead of local password or
  Microsoft 365 login administration.

## Auth Behavior

PulseDesk no longer owns production login, registration, password management, or
Microsoft 365 sign-in as an application login provider. Production access must
start in OperatorOS:

1. User opens OperatorOS Command Center.
2. OperatorOS verifies identity, tenant membership, PulseDesk entitlement, and
   role.
3. OperatorOS issues a PulseDesk SSO launch token.
4. PulseDesk consumes the token through `/sso`.
5. PulseDesk provisions or refreshes the local user/org mapping and creates an
   `operatoros` session.
6. Protected PulseDesk routes require that session plus an active entitlement
   snapshot unless the user is server-side super-admin.

## Disabled Local Auth Paths

These routes are no longer active login ownership paths:

- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/auth/m365/login`
- `GET /api/auth/m365/callback`
- `POST /api/auth/change-password`
- `DELETE /api/auth/delete-account`

The route file keeps compatibility stubs so old callers receive clear
`managed_by_operatoros` behavior instead of accidental local auth.

The active settings UI no longer calls `POST /api/auth/change-password` and no
longer mounts the legacy PulseDesk auth-mode configuration panel. That legacy
component remains in the imported source as audit context only.

## Billing Cleanup

`server/routes/billing.ts` no longer imports Stripe clients and no longer calls
Stripe checkout or portal session creation. Billing endpoints are compatibility
responses only:

- `GET /api/billing/status` returns OperatorOS-managed status and entitlement
  metadata.
- `GET /api/billing/plans` returns `410 managed_by_operatoros`.
- `POST /api/billing/checkout` returns `410 managed_by_operatoros`.
- `POST /api/billing/portal` returns `410 managed_by_operatoros`.
- `GET /api/billing/publishable-key` returns `410 managed_by_operatoros`.

OperatorOS remains the active pricing, checkout, subscription, webhook, seat,
and module entitlement authority.

## Server-Side Enforcement

PulseDesk protected API routes still use their local workflow role helpers, but
those checks now sit behind OperatorOS SSO and entitlement enforcement:

- `requireAuth` rejects non-OperatorOS sessions.
- `requireAuth` rejects missing or revoked entitlement snapshots for normal
  users.
- `requireSuperAdmin` rejects non-OperatorOS sessions before evaluating the
  imported super-admin flag.
- `requireFeature` no longer allows local-auth entitlement bypasses.
- `requireOperatorOsModuleAccess` no longer allows local-auth entitlement
  bypasses.

## Remaining Follow-Up

- Replace the imported module-local `john@shotgunninjas.com` master-admin
  compatibility logic with direct shared OperatorOS platform admin helpers when
  the imported source is fully merged into the OperatorOS package graph.
- Decide whether PulseDesk should stay as a separately built child app behind
  SSO or be mounted as a deeper internal Next.js module.
- Phase 16 should remove or archive remaining legacy Stripe files such as
  `stripeClient.ts`, `webhookHandlers.ts`, and `services/billingSync.ts` after
  billing consolidation is complete.
