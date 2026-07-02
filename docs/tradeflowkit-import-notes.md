# TradeFlowKit Import Notes

## Phase 14 Summary

TradeFlowKit has been imported into OperatorOS as the third consolidated
module. The source snapshot lives at `apps/modules/tradeflowkit/source`, with
an OperatorOS adapter at `apps/modules/tradeflowkit/adapter.ts` and an
OperatorOS-managed shell at `apps/web/src/components/module-shells/TradeFlowKitShell.tsx`.

No production billing, auth, or database ownership has been moved in this
phase. Phase 14 preserves the existing TradeFlowKit source for audit and
adapter work only.

## Routing

- Production module host: `tradeflowkit.operatoros.net`
- Local fallback: `/modules/tradeflowkit`
- Command Center route: `/app/apps/tradeflowkit`
- Legacy public product host observed in source/docs: `tradeflowkit.com`

The central module registry already resolves `tradeflowkit.operatoros.net` to
the `tradeflowkit` module. The OperatorOS app route now maps the registry slug
to the TradeFlowKit shell.

## Architecture Identified

- Web app: React 18, Vite, Wouter, TanStack Query, Tailwind/Radix UI.
- API: Express 5 routes under `server/routes`.
- Data model: Drizzle ORM with PostgreSQL tables under `shared/schema.ts`.
- Sessions: `express-session` with org context in `req.session.orgId`.
- Entitlements: `shared/entitlements.ts` contains OperatorOS snapshot logic.
- Mobile: No Expo or separate native client was found. TradeFlowKit is a
  mobile-first responsive PWA with mobile navigation components and browser
  install assumptions.
- Supabase: no Supabase runtime package or Supabase client was identified in
  the imported source. The primary database dependency is PostgreSQL.

## Core Workflow Routes

TradeFlowKit's main preserved workflows are:

- `/dashboard`
- `/leads` and `/leads/demo`
- `/customers` and `/customers/:id`
- `/jobs` and `/jobs/:id`
- `/quotes`, quote create/edit/view routes
- `/invoices`, invoice create/edit/pay routes
- `/settings`
- `/subscription`
- `/analytics`
- `/call-recovery`
- `/admin`
- `/portal/:token`

These routes are not rewritten in Phase 14. They are documented so Phase 15 can
replace standalone auth and billing ownership without losing field-service
workflow coverage.

## Auth and Tenant Findings

TradeFlowKit currently contains local auth endpoints and client helpers:

- `/api/auth/login`
- `/api/auth/login/2fa`
- `/api/auth/register`
- `/api/auth/logout`
- `/api/auth/me`
- `/api/auth/switch-org`
- `/api/auth/change-password`
- `/api/auth/delete-account`

It also contains an OperatorOS SSO consume route and entitlement sync support.
The source already distinguishes linked OperatorOS orgs through fields such as
`operatorosTenantId`, `operatorosOrganizationId`, `operatorosPlanSlug`,
`operatorosSubscriptionStatus`, `operatorosAccessLevel`, and entitlement
snapshots.

Phase 14 does not remove local auth. The OperatorOS shell treats login and
tenant authority as OperatorOS-owned. Phase 15 should redirect or disable
standalone login/register behavior from user-facing module surfaces.

## Billing and Stripe Findings

TradeFlowKit includes multiple Stripe-related surfaces:

- Local subscription checkout and customer portal in `server/routes/subscriptions.ts`.
- Stripe Connect onboarding in `server/routes/stripeConnect.ts`.
- Invoice payment links in `server/routes/invoices.ts`.
- Call Recovery add-on checkout in `server/routes/callRecovery.ts`.
- Client subscription/settings/payment pages.

The imported source already blocks some subscription and Stripe Connect actions
for OperatorOS-linked tenants with `managed_by_operatoros` behavior. That is a
good starting point but not a complete consolidation.

Phase 15 must make sure module subscription and add-on purchase flows point to
OperatorOS billing. Stripe Connect and invoice customer-payment behavior should
be reviewed separately because those may be operational payment workflows, not
platform subscription ownership.

## External Service Dependencies

Documented and observed dependencies include:

- `DATABASE_URL` for PostgreSQL.
- `SESSION_SECRET` for local sessions in the source snapshot.
- `MODULE_SSO_SECRET`, OperatorOS URL/config values, and service token values
  for OperatorOS SSO/sync behavior.
- `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` for legacy subscription,
  Connect, and invoice payment code.
- `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` for quote/invoice emails.
- `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` for SMS reminders and Call
  Recovery workflows.
- `OPENAI_API_KEY` for Call Recovery AI support.

Do not add real secret values to the repository.

## Adapter Added

`apps/modules/tradeflowkit/adapter.ts` creates a small OperatorOS-to-module
context with:

- current user
- tenant id
- OperatorOS tenant role
- mapped TradeFlowKit local role
- entitlement state
- platform admin flag
- OperatorOS-managed login mode
- OperatorOS-managed billing mode
- host and fallback route metadata
- core workflow route metadata
- external dependency metadata

The adapter intentionally maps OperatorOS `owner` and `admin` to local `admin`.
It does not mint a TradeFlowKit-local `owner` role from OperatorOS context.

## Smoke and Manual Test Checklist

- TradeFlowKit loads from `/modules/tradeflowkit`.
- TradeFlowKit loads from `/app/apps/tradeflowkit` when entitlement is present.
- `tradeflowkit.operatoros.net` resolves to the `tradeflowkit` registry entry.
- Logged-out direct module visit redirects or shows OperatorOS login.
- Missing entitlement is blocked before launch.
- `john@shotgunninjas.com` root super-admin is allowed through server-side
  platform admin checks.
- Main customer/job/invoice routes remain present in the imported source.
- No `.git`, `node_modules`, `dist`, package lock, or runtime artifact folders
  were imported into `apps/modules/tradeflowkit/source`.
