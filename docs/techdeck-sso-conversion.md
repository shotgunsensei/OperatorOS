# TechDeck SSO Conversion

Phase 10 converts the imported TechDeck module toward OperatorOS-owned identity, tenant, entitlement, and billing control.

## Current State

TechDeck remains imported under `apps/modules/techdeck/source`. The standalone Express/Vite source is preserved for workflow migration, but OperatorOS is the active runtime entry point through:

- `/modules/techdeck`
- `techdeck.operatoros.net`
- `apps/web/src/components/module-shells/TechDeckShell.tsx`
- `apps/modules/techdeck/adapter.ts`

OperatorOS still gates the shell through `GET /api/modules/techdeck`, which maps to the backend `/v1/modules/:slug` route and enforces authenticated user, active tenant, and TechDeck entitlement before shell render.

## Changes Made

### Duplicate Login and Registration

The imported TechDeck `/login` and `/register` pages no longer submit credentials to TechDeck-local auth endpoints. They redirect to OperatorOS using the new client helper:

- `apps/modules/techdeck/source/client/src/lib/operatoros.ts`

The imported client no longer treats `/login` as the fallback for unauthorized users. Unauthorized redirects now send the browser to OperatorOS login with a `return_to` parameter.

The imported reviewer login page and `POST /api/reviewer-login` endpoint also redirect or return `410 managed_by_operatoros`. Reviewer/demo access must be issued from OperatorOS, not through a TechDeck-owned password.

### Local Credential Mutation

The imported TechDeck account security and MFA setup pages no longer manage password changes, MFA enrollment, MFA verification, or MFA disablement. They display OperatorOS-managed identity guidance and link to OperatorOS.

The imported Express auth routes now fail closed by default for local credential operations:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/mfa/validate`
- `POST /api/auth/mfa/setup`
- `POST /api/auth/mfa/verify`
- `POST /api/auth/mfa/disable`
- `POST /api/auth/change-password`
- `POST /api/reviewer-login`

These endpoints return `410 managed_by_operatoros` unless `TECHDECK_ENABLE_LOCAL_AUTH=true` is set outside production. This flag is only for isolated local development and must not be enabled in production.

### Pricing and Billing

The imported TechDeck `/pricing` page now redirects to OperatorOS billing. The TechDeck landing page no longer links to an internal pricing section or promotes `/pricing` as a TechDeck-owned surface.

The imported billing routes already returned `410 Gone` for local checkout and customer portal writes:

- `POST /api/billing/checkout-session`
- `POST /api/billing/customer-portal`

Those endpoints remain preserved only as compatibility responses pointing callers back to OperatorOS billing.

### Platform Admin Authority

The active OperatorOS TechDeck shell now uses the central `hasPlatformAdminAuthority` helper from `packages/auth`. This keeps `john@shotgunninjas.com` root super-admin treatment centralized and server-aligned rather than UI-only.

The shell shows a Platform Command management link only when the central helper verifies platform-admin authority.

## Preserved Workflows

The imported source still contains TechDeck MSP workflows for:

- tickets
- clients and assets
- evidence
- IT ops console
- secure intake
- webhooks
- reports
- portal
- invoicing
- time and calendar
- knowledge base

Those feature routes are not deleted. They remain staged for route-by-route migration into OperatorOS-managed API and UI shells.

## Remaining Phase 10 Limits

This phase does not mount all TechDeck feature routes inside OperatorOS. The active shell proves SSO/auth/billing boundaries and platform context, but the imported Vite app is not yet the live module runtime.

Before enabling imported feature APIs, each route must validate:

- authenticated OperatorOS user
- active tenant membership
- TechDeck module entitlement
- role authorization
- tenant-scoped data filtering

## Next Work

Migrate the first read-only TechDeck dashboard route into OperatorOS, then tickets and assets. Keep every migrated handler behind the central OperatorOS tenant/entitlement helpers and avoid mounting any TechDeck-local billing, checkout, registration, or password route.
