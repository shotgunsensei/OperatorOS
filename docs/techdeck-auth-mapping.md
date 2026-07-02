# TechDeck Auth Mapping

TechDeck remains an OperatorOS child module. OperatorOS owns login, sessions, tenants, billing, entitlements, module launch, and platform-admin authority.

## Current TechDeck Auth Findings

Imported source files:

- `server/auth/session.ts`
- `server/auth/routes.ts`
- `server/auth/middleware.ts`
- `server/auth/sso.ts`
- `server/auth/entitlements.ts`
- `server/modules/operatoros/routes.ts`
- `shared/models/auth.ts`

TechDeck currently supports:

- Express sessions stored in PostgreSQL.
- Local register/login for development.
- Production local registration disabled.
- Production local password login limited to explicit local system-admin accounts.
- OperatorOS SSO through `GET /sso?token=<jwt>`.
- OperatorOS entitlement sync through `POST /api/operatoros/entitlements/sync`.
- Snapshot-based session invalidation when OperatorOS access is revoked.

## OperatorOS Module Shell Mapping

Phase 9 does not run TechDeck's standalone auth stack inside OperatorOS. The OperatorOS shell uses:

- OperatorOS session cookie and AuthProvider for current user.
- OperatorOS active tenant id.
- `GET /api/modules/techdeck` for server-side tenant/module entitlement enforcement.
- `createTechDeckAdapterContext()` for local TechDeck role/context projection.

## Role Mapping

| OperatorOS signal | TechDeck adapter role |
| --- | --- |
| platform super-admin | `ADMIN` |
| tenant owner | `ADMIN` |
| tenant admin | `ADMIN` |
| tenant member | `TECH` |
| no entitlement | blocked before shell render |

TechDeck `OWNER` is intentionally not granted by the OperatorOS adapter. Owner remains a legacy/local ownership concept until a dedicated delegated-owner policy exists.

## SSO Mapping From Imported Source

TechDeck standalone SSO validates:

- HS256 only.
- issuer.
- audience `techdeck`.
- env.
- module claims.
- `iat` and `exp`.
- `jti`.

It then calls OperatorOS consume and provisions:

- local user.
- local tenant derived from OperatorOS organization id.
- local membership.
- entitlement snapshot.

This standalone SSO code is preserved in `apps/modules/techdeck/source/server/auth/sso.ts` for Phase 10 conversion, but Phase 9 uses the parent OperatorOS shell route instead of launching the standalone Express app.

## Billing and Login Boundary

The imported source already documents local billing decommissioning:

- local checkout returns `410 Gone`.
- local customer portal returns `410 Gone`.
- local subscription mutation is managed by OperatorOS.
- legacy Stripe webhook audit is disabled unless explicitly enabled by env.

OperatorOS shell code does not call:

- `/api/auth/login`
- `/api/auth/register`
- `/api/billing/checkout-session`
- `/api/billing/customer-portal`
- `/api/stripe/webhook`

## Required Phase 10 Auth Work

- Replace TechDeck local route guards with OperatorOS shared auth/tenant/entitlement helpers where routes are mounted inside OperatorOS.
- Keep standalone TechDeck emergency login disabled or redirected for normal users.
- Map TechDeck local tenant ids to OperatorOS tenant ids before enabling write routes.
- Ensure every migrated API route checks authenticated user, tenant membership, TechDeck entitlement, and role.
