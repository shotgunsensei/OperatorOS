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

## Department Escalation Queue

- Entitled user:
  - Open PulseDesk and confirm the queue loads without manager controls.
  - Create intake only after checking the explicit no-PHI acknowledgement.
  - Confirm the warning reads: `Operational information only. Do not enter
    patient names, MRNs, dates of birth, diagnoses, or clinical notes.`
  - Confirm the created request receives a `PD-00001`-style number, `new`
    status, version `1`, and an SLA due time without client input.

- Module manager or tenant admin/owner:
  - Create, rename, deactivate, and reactivate a department. Confirm duplicate
    names with different capitalization return
    `PULSEDESK_DEPARTMENT_NAME_CONFLICT`.
  - Assign only a listed active PulseDesk user. Try a foreign/inactive user ID
    through an API client and confirm the generic 404 response.
  - Change priority or patient-impact state and confirm due time is recomputed
    from the original creation time.
  - Perform allowed status transitions and an escalation with a structured
    reason. Confirm a disallowed transition returns
    `INVALID_STATUS_TRANSITION`.
  - Open the detail timeline and confirm department, assignee, priority, and
    status events are structured and ordered.

- Concurrency and tenant isolation:
  - Submit two updates with the same `expectedVersion`; confirm one succeeds
    and the other returns `REQUEST_VERSION_CONFLICT`.
  - Try a request/department ID from another tenant and a missing ID; confirm
    both produce the same resource-specific 404 response.
  - Confirm a normal entitled user receives
    `capabilities.canManageWorkflow: false`, while a module manager receives
    `true` even if their tenant role is `member`.

- Database-backed staging checks:
  - Restart the API twice and confirm all four PulseDesk tables and constraints
    remain intact (idempotent DDL).
  - Create requests concurrently and confirm tenant request numbers are unique
    and gap-safe for committed transactions.
  - Attempt to delete a request row with events and confirm the restrictive FK
    blocks it.
  - Inspect `activity_feed` and `pulsedesk_request_events`; confirm no summary
    or location text was copied into metadata.

No new environment variables are introduced by this workflow. If
`DATABASE_URL` is unavailable locally, record database-backed checks as blocked
and perform them in staging rather than claiming them passed.
