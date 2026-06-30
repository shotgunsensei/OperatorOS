# OperatorOS Platform Command Smoke Test

Use this checklist before releasing Platform Command changes or after changing
auth, rewrites, middleware, or any `/v1/platform/*` route.

## Preflight

- Start the API and web app with the normal OperatorOS environment.
- Confirm the test account has `users.platform_role = 'super_admin'`.
- Open browser devtools Network before beginning the UI pass.

## Navigation And Auth

- Visit `/platform` and confirm it redirects to `/app/platform`.
- Visit `/platform/tenants` and confirm it redirects to `/app/platform/tenants`.
- In an anonymous browser session, open `/app/platform/health` and confirm redirect to `/login?next=%2Fapp%2Fplatform%2Fhealth`.
- Sign in as a non-super-admin and confirm `/app/platform` renders the friendly 403 page.
- Sign in as a super-admin and confirm `/app/platform` opens Platform Command.

## Platform Tabs

- Open `/app/platform`.
- Open `/app/platform/tenants`.
- Open `/app/platform/modules`.
- Open `/app/platform/users`.
- Open `/app/platform/billing`.
- Open `/app/platform/pricing`.
- Open `/app/platform/health`.
- Open `/app/platform/audit`.
- Open `/app/platform/sso`.

## Tenant Operations

- Create a test company tenant with a known owner.
- Open the tenant detail page at `/app/platform/tenants/:id`.
- Suspend and reactivate the tenant.
- Archive and restore the tenant.
- Confirm each mutation appears in Audit.

## Module Operations

- Open `/app/platform/modules`.
- Open a module detail page at `/app/platform/modules/:slug`.
- Edit a non-sensitive module field.
- Assign or clear a platform component.
- Save plan mapping.
- Confirm each mutation appears in Audit.

## Pricing And Stripe Test Mode

- Open `/app/platform/pricing`.
- Confirm the page loads without 404s.
- In test mode, run a Stripe drift check from a module detail page.
- If Stripe is intentionally unavailable, confirm the UI shows status, code, action, endpoint, and message without exposing secrets.

## Users And Billing

- Open `/app/platform/users`.
- Open a user detail page at `/app/platform/users/:id`.
- Confirm plan options are active OperatorOS plans, not obsolete `free`.
- Confirm platform-role controls are visible only inside Platform Command.
- Open Billing Events and retry a failed test event only if it is safe to replay.

## Health And Audit

- Open `/app/platform/health` and confirm infrastructure probes render.
- Open `/app/platform/audit` and filter by a known action from this smoke pass.
- Confirm failed Platform API calls show useful operator errors with status, code, message, action, and endpoint.

## Network Contract

- In devtools Network, confirm Platform Command browser requests use `/api/platform/*`.
- Confirm no browser request uses `/api/v1/platform/*`.
- Confirm no request path contains doubled `/v1/v1/platform`.
