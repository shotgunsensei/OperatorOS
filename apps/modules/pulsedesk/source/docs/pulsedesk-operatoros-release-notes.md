# PulseDesk OperatorOS Child Module Release Notes

Date: 2026-06-30

## Summary

PulseDesk has been prepared to run as an OperatorOS-controlled child module.
OperatorOS is now the production authority for launch, pricing,
subscriptions, seats, and entitlements. PulseDesk remains responsible for
healthcare operations workflows: tickets, departments, equipment/assets,
vendors, supply requests, facility requests, connected inboxes, notifications,
analytics, and tenant-level settings.

## Files Changed

Core SSO, entitlement, auth, and access control:

- `server/auth/operatoros-sso.ts`
- `server/routes/sso.ts`
- `server/services/operatorosEntitlements.ts`
- `server/middleware.ts`
- `server/routes/auth.ts`
- `server/routes/orgs.ts`
- `server/routes/admin.ts`
- `server/routes/index.ts`
- `server/routes/health.ts`
- `server/storage.ts`
- `server/migrate.ts`
- `shared/schema.ts`
- `shared/roles.ts`
- `client/src/lib/permissions.ts`

Billing removal and OperatorOS access replacement:

- `client/src/App.tsx`
- `client/src/components/app-sidebar.tsx`
- `client/src/components/help-drawer.tsx`
- `client/src/pages/landing.tsx`
- `client/src/pages/auth-page.tsx`
- `client/src/pages/settings.tsx`
- `README.md`
- `docs/stripe-setup.md`
- `docs/pulsedesk-operatoros-integration-plan.md`
- `docs/pulsedesk-operatoros-deployment.md`

Healthcare operations hardening and end-user features:

- `server/routes/tickets.ts`
- `server/services/ticketSla.ts`
- `client/src/components/status-badge.tsx`
- `client/src/components/page-header.tsx`
- `client/src/pages/dashboard.tsx`
- `client/src/pages/tickets.tsx`
- `client/src/pages/ticket-detail.tsx`
- `client/src/pages/assets.tsx`
- `client/src/pages/submit-issue.tsx`
- `client/src/pages/departments.tsx`
- `client/src/pages/vendors.tsx`
- `client/src/pages/supply-requests.tsx`
- `client/src/pages/facility-requests.tsx`
- `client/src/pages/admin.tsx`

Smoke verification:

- `package.json`
- `scripts/smoke-route-manifest.mjs`
- `scripts/smoke-unauthenticated-routes.mjs`
- `scripts/smoke-sso-config.mjs`
- `scripts/smoke-entitlement-webhook.mjs`

## Behavior Changed

- `GET /sso?token=<jwt>` is the primary production login path.
- OperatorOS token consume is mandatory before PulseDesk creates a local
  session.
- SSO tokens require HS256, matching issuer, audience, module slug, env, `iat`,
  `exp`, and a 90-second max token age.
- OperatorOS entitlement snapshots are cached locally and used for protected
  access and feature gates.
- `POST /webhooks/operatoros/entitlements` verifies raw-body HMAC signatures
  before parsing JSON.
- Disabled or missing PulseDesk module entitlements revoke access on protected
  requests.
- `john@shotgunninjas.com` is the default configured master-admin identity
  after OperatorOS authentication.
- Local username/password login is development/reviewer fallback behavior, not
  the production access path.
- PulseDesk-owned pricing pages, billing navigation, checkout buttons, billing
  portal links, plan comparison UI, and upgrade CTAs are removed from active UI.
- Email-to-ticket and connector access are governed by OperatorOS entitlement
  state and tenant role gates, not local Stripe plan state.
- The dashboard now emphasizes triage, urgent work, overdue items, stale vendor
  waits, pending supply approvals, and inbox health.
- Ticket queues include operational quick filters, SLA states, patient-impact
  indicators, vendor waits, and mobile-safe rows.
- Asset-to-ticket flow pre-fills issue reports from registered equipment.
- Admin control plane is organized around tenants, users, entitlements, inboxes,
  audit, and system health.

## Required Environment

Production PulseDesk:

- `DATABASE_URL`
- `SESSION_SECRET`
- `MODULE_SSO_SECRET`
- `OPERATOROS_BASE_URL`
- `OPERATOROS_SSO_AUDIENCE=pulsedesk`
- `OPERATOROS_SSO_ENV=prod`
- `OPERATOROS_SSO_CONSUME_URL`
- `OPERATOROS_SERVICE_TOKEN`
- `APP_BASE_URL`
- `PULSEDESK_MASTER_ADMIN_EMAIL=john@shotgunninjas.com`

Optional or fallback:

- `OPERATOROS_API_URL`
- `OPERATOROS_ENTITLEMENTS_INTROSPECT_URL`
- `OPERATOROS_INTROSPECTION_URL`
- `OPERATOROS_ENTITLEMENT_SYNC_URL`
- `PULSEDESK_PUBLIC_URL`
- `PUBLIC_BASE_URL`
- `PULSEDESK_URL`
- `PULSEDESK_LOCAL_AUTH_ENABLED`
- `SENDGRID_API_KEY`
- `SENDGRID_FROM_EMAIL`
- `SENDGRID_FROM_NAME`
- `SENDGRID_INBOUND_BASIC_AUTH`
- `SENDGRID_INBOUND_IP_ALLOWLIST`
- `SENDGRID_WEBHOOK_VERIFICATION_KEY`
- `MAILGUN_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`

Deprecated for PulseDesk:

- PulseDesk-owned Stripe price IDs.
- PulseDesk-owned Stripe webhook secrets.
- PulseDesk-owned checkout, portal, and billing-plan vars.

## Migration Steps

1. Deploy the code.
2. Set the required env vars from
   `docs/pulsedesk-operatoros-deployment.md`.
3. Start the server. Runtime migrations create or update:
   - `operatoros_entitlement_snapshots`
   - vendor follow-up ticket columns
   - role normalization support for legacy `tech` and `viewer` values
4. Confirm `GET /api/health` reports production-critical booleans as true.
5. Launch `john@shotgunninjas.com` from OperatorOS and verify System Admin.
6. Launch a regular tenant user from OperatorOS and verify tenant dashboard,
   tickets, and role restrictions.
7. Send enabled and disabled entitlement snapshots from OperatorOS and confirm
   access permits/revokes as expected.

## Manual OperatorOS Setup Required

- Module slug: `pulsedesk`.
- SSO launch URL: `https://<pulsedesk-host>/sso?token=<jwt>`.
- Shared SSO/HMAC secret: same value as PulseDesk `MODULE_SSO_SECRET`.
- SSO audience: `pulsedesk`.
- SSO env: `prod`, `staging`, or `dev` to match PulseDesk.
- Consume endpoint: prefer
  `https://operatoros.net/api/modules/sso/consume` unless the OperatorOS
  deployment uses `https://operatoros.net/api/v1/modules/sso/consume`.
- Service token with entitlement introspection and webhook sync permission.
- Entitlement webhook URL:
  `https://<pulsedesk-host>/webhooks/operatoros/entitlements`.
- Ensure John is an OperatorOS-authenticated user with access to PulseDesk.

## Verification

Local Phase 8 verification on 2026-06-30:

- `npm run check`: passed.
- `npm run build`: passed.
- `npm run smoke`: passed.
- `npm run smoke:webhook`: passed static checks; live bad-signature request was
  skipped because `PULSEDESK_SMOKE_BASE_URL` was not set.

Run before each production release:

```bash
npm run check
npm run build
npm run smoke
```

Optional live webhook smoke:

```bash
PULSEDESK_SMOKE_BASE_URL=https://<pulsedesk-host> npm run smoke:webhook
```

Manual release checks:

- SSO success.
- SSO replay reject.
- Expired token reject.
- Audience mismatch reject.
- Missing env reject.
- Entitlement enabled permits access.
- Entitlement disabled revokes access.
- Bad webhook signature reject.
- John master-admin access.
- Regular user cannot access System Admin.
- Tenant isolation checks.
- Major CRUD smoke checks.
- Visual/mobile smoke checks.

## Known Limitations

- Local automated checks do not mint real OperatorOS SSO tokens. Replay,
  expired-token, and audience-mismatch verification require OperatorOS or a
  signed-token harness configured with the shared secret.
- The live bad-signature webhook smoke is skipped unless
  `PULSEDESK_SMOKE_BASE_URL` is set.
- Visual/mobile checks are documented for manual verification; the repo does
  not currently include a browser automation suite for responsive screenshots.
- Deprecated Stripe files and the Stripe dependency remain in the repo for
  historical rollback/reference only. They are not active production paths.
- `PULSEDESK_LOCAL_AUTH_ENABLED` should stay disabled in production except for
  explicit reviewer workflows.
