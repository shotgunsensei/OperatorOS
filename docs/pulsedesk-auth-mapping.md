# PulseDesk Auth Mapping

Phase 12 mapped PulseDesk into OperatorOS. Phase 13 converts active
PulseDesk-owned login, registration, and billing surfaces to
OperatorOS-managed behavior. OperatorOS remains the parent authority for
identity, sessions, tenants, roles, entitlements, billing, and root platform
admin.

## Authority Boundary

OperatorOS owns:

- Login and registration
- Session cookies
- SSO handoff tokens
- User identity
- Tenant membership
- Platform roles
- Root super-admin authority
- Module entitlement checks
- Subscription and billing state

PulseDesk owns:

- Healthcare operations workflows
- Module-specific UI
- Module-specific settings
- PulseDesk-local tenant-scoped data
- Feature routing inside the module

PulseDesk must not become a second source of truth for billing, login,
registration, root admin, tenant membership, or entitlement decisions.

## Adapter Input

`apps/modules/pulsedesk/adapter.ts` accepts this OperatorOS context:

- `currentUser`
- `tenantId`
- `role`
- `entitlements`
- `platformAdmin`

The adapter creates the normalized module context consumed by the OperatorOS
shell.

## Role Mapping

| OperatorOS role | PulseDesk local role | Notes |
| --- | --- | --- |
| Root platform super-admin | `admin` | Platform authority comes from OperatorOS, not PulseDesk ownership. |
| `owner` | `admin` | Do not grant PulseDesk-local `owner` from the adapter. |
| `admin` | `admin` | Tenant admin can manage module settings when authorized. |
| `supervisor` | `supervisor` | Preserved for PulseDesk clinical operations workflows. |
| `technician` | `technician` | Preserved for operational staff workflows. |
| `readonly` | `readonly` | Read-only module context. |
| other/member/null | `staff` | Conservative default for normal users. |

PulseDesk `owner` exists in the imported source, but the OperatorOS adapter does
not grant it. OperatorOS tenant/platform authority must stay centralized.

## Entitlement Mapping

The adapter treats PulseDesk as entitled when one of these signals is present:

- `entitlements.modules[]` contains enabled `id: pulsedesk`
- `entitlements.modules[]` contains enabled `slug: pulsedesk`
- `entitlements.modules[]` contains enabled `entitlementKey: pulsedesk`
- `entitlements.pulsedesk === true`
- `entitlements.pulsedesk.enabled === true`
- `platformAdmin === true`

The shell receives this state for UI behavior only. Server-side launch and API
access must still be enforced by OperatorOS SSO, tenant membership, and
entitlement checks.

## Imported PulseDesk Auth Paths

The imported source still contains these legacy auth paths, but they are no
longer active PulseDesk-owned identity surfaces:

- `/api/auth/login`
- `/api/auth/register`
- `/api/auth/logout`
- `/api/auth/switch-org`
- Microsoft 365 login/callback
- local dev/reviewer fallback controls

`/api/auth/login`, `/api/auth/register`, Microsoft 365 login/callback, password
change, and account deletion now return or redirect with
`managed_by_operatoros` behavior. The client `/login` page no longer renders
local password fields, reviewer setup, registration, or Microsoft 365 sign-in.

`/api/auth/logout`, `/api/auth/me`, `/api/auth/switch-org`, and profile read
paths remain compatibility/session-management paths for the PulseDesk child app,
but protected feature APIs require an OperatorOS SSO session.

## SSO Handoff Mapping

PulseDesk already has OperatorOS-facing SSO support in the imported source:

- `server/routes/sso.ts`
- `server/auth/operatoros-sso.ts`
- `server/middleware.ts`
- `server/services/operatorosEntitlements.ts`

Expected OperatorOS handoff claims for PulseDesk:

- `sub` or `userId`
- `email`
- `tenantId`
- `role`
- `moduleId: pulsedesk`
- `entitlementKey`
- `iss`
- `aud`
- `iat`
- `exp`
- `jti` or `nonce`

PulseDesk should consume the handoff only after OperatorOS validates user,
tenant membership, and entitlement state. Future one-time-use token behavior
should be implemented in OperatorOS and consumed consistently by PulseDesk.

## Root Platform Super-Admin

`john@shotgunninjas.com` must be enforced as a root platform super-admin on the
OperatorOS server side. The imported PulseDesk source contains local master
admin defaults for compatibility and audit purposes, but Phase 13 should route
runtime admin checks through OperatorOS helpers such as
`requirePlatformAdmin`, `isRootSuperAdmin`, and tenant role helpers.

## Billing Boundary

PulseDesk-local billing routes exist in the imported source but are not active
billing authority:

- `/api/billing/plans`
- `/api/billing/status`
- `/api/billing/checkout`
- `/api/billing/portal`
- `/api/billing/publishable-key`

`/api/billing/status` returns OperatorOS-managed status based on the current
entitlement snapshot. Plan, checkout, portal, and publishable-key routes return
`410 managed_by_operatoros` if the compatibility router is mounted. OperatorOS
must remain the active checkout, subscription, webhook, seat, and entitlement
authority. Phase 16 should consolidate or archive remaining Stripe files.
