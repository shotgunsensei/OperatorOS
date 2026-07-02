# PulseDesk Manual QA

Use this checklist after Phase 13 before treating PulseDesk as demo-ready inside
OperatorOS.

## Required Checks

- Launch from Command Center:
  - Sign into OperatorOS.
  - Select an entitled tenant.
  - Launch PulseDesk.
  - Confirm PulseDesk opens through OperatorOS SSO.

- Direct subdomain route:
  - Visit `https://pulsedesk.operatoros.net`.
  - Confirm unauthenticated users are routed to OperatorOS login or a controlled
    launch-required state.

- Logged-out state:
  - Clear cookies.
  - Visit PulseDesk directly.
  - Confirm no local username/password form appears.

- Missing entitlement state:
  - Use a tenant without PulseDesk entitlement.
  - Confirm Command Center blocks launch.
  - Confirm direct route does not open feature data.

- Root admin state:
  - Use `john@shotgunninjas.com`.
  - Confirm access is allowed through server-side OperatorOS/platform admin
    checks.
  - Confirm Platform Command link is visible.

- Tenant admin state:
  - Use a tenant admin with PulseDesk entitlement.
  - Confirm module settings/admin links are visible only for that tenant scope.

- Normal user state:
  - Use a normal entitled user.
  - Confirm operations workflows are visible.
  - Confirm Platform Command/admin-only controls are hidden.

- Main feature routes:
  - Dashboard
  - Tickets
  - Ticket detail
  - Report issue
  - Departments
  - Assets
  - Supply requests
  - Facility requests
  - Vendors
  - Analytics where authorized
  - Inboxes/settings where authorized

- Removed pricing:
  - Confirm PulseDesk UI does not link to local pricing or checkout.
  - Confirm `/api/billing/checkout` returns managed-by-OperatorOS behavior if
    the compatibility route is mounted.

- Removed duplicate login:
  - Confirm `/login` shows the OperatorOS launch page.
  - Confirm no password field appears.
  - Confirm no local register/reviewer setup appears.
  - Confirm Profile security points to OperatorOS account settings.
  - Confirm the Auth settings tab points to OperatorOS SSO settings.
  - Confirm `POST /api/auth/login` and `POST /api/auth/register` return
    managed-by-OperatorOS behavior.

## Skipped Unless Live Infra Exists

- Expired SSO token rejection.
- Wrong audience token rejection.
- Replay token rejection.
- OperatorOS entitlement webhook delivery.
- Stripe test mode checkout through OperatorOS billing.

Record live infrastructure gaps explicitly rather than treating them as a local
failure.
