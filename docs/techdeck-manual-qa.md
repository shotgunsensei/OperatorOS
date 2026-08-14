# TechDeck Manual QA

Use this checklist after TechDeck shared-runtime changes and before production deployment.

## Launch and Routing

- Launch from Command Center: Command Center launches TechDeck through the central module registry.
- `/modules/techdeck` renders the TechDeck module shell for an authenticated and entitled user.
- `techdeck.operatoros.net` resolves to the TechDeck module shell through host-based routing.
- Direct visit while logged out redirects to OperatorOS login.
- Direct visit without TechDeck entitlement shows the OperatorOS access denied state before shell render.

## Roles

- Root platform super-admin access: `john@shotgunninjas.com` receives root platform super-admin access from server-side OperatorOS authority.
- Platform super-admin sees the TechDeck Platform Command management link.
- Tenant admin can launch TechDeck when the tenant has entitlement.
- Normal tenant user can launch TechDeck when entitled and resolves to the TechDeck adapter `TECH` role.
- A user without tenant membership cannot access tenant-scoped TechDeck routes.

## Removed Duplicate Auth

- TechDeck `/login` redirects to OperatorOS login.
- TechDeck `/register` redirects to OperatorOS request-access or billing flow.
- TechDeck local password form is not visible.
- TechDeck local registration form is not visible.
- TechDeck reviewer login redirects to OperatorOS and does not accept a local password.
- Account security page does not offer local password change.
- MFA setup page redirects to OperatorOS identity/security management.
- TechDeck unauthorized-client redirect goes to OperatorOS, not `/login`.

## Removed Duplicate Pricing and Billing

- TechDeck `/pricing` redirects to OperatorOS billing.
- TechDeck landing page does not advertise an internal pricing section.
- TechDeck sitemap does not promote `/pricing` or `/login`.
- TechDeck billing page is read-only and says OperatorOS manages billing.
- Local checkout endpoint returns `410 managed_by_operatoros`.
- Local customer portal endpoint returns `410 managed_by_operatoros`.

## Major Feature Routes: Live Technician Ticket Queue

Use two tenants and at least two entitled TechDeck users so the authority boundaries can be tested, not just the happy path.

- Open the TechDeck shell and confirm the live Ticket Queue loads without calling the imported standalone server.
- Create a ticket with title, description, priority, response deadline, and resolution deadline; confirm the new ticket appears immediately with an `open` status.
- Create tickets in both test tenants and confirm ticket numbers increment independently within each tenant.
- Search by ticket number, title, and description; exercise status, priority, assigned-to-me, and unassigned filters; clear the filters and confirm the full queue returns.
- Move a ticket through `in_progress`, `waiting_on_client`, `resolved`, `closed`, and back to an active status. Confirm the displayed status changes and lifecycle timestamps are server-derived.
- As a normal tenant member, claim an unassigned ticket and release your own ticket. Confirm you cannot take or release a ticket owned by another technician.
- As a tenant admin or owner, confirm the assignment override is available and can claim a ticket assigned to another technician.
- Confirm Archive is hidden for a normal tenant member. As a tenant admin or owner, archive a ticket and confirm it disappears from the queue without being hard-deleted.
- Retry the queue after an API failure and confirm the loading, empty, filtered-empty, action-error, and load-error states remain usable on desktop and below 700 px.

### Ticket authority checks

- Remove the caller's TechDeck module grant and confirm every `/v1/modules/techdeck/tickets*` route rejects access before any ticket data is returned.
- Disable TechDeck for the active tenant and confirm the same routes reject access even if the user still has an old per-user grant.
- Request a ticket ID belonging to another tenant and confirm the API returns the same `404 TICKET_NOT_FOUND` response used for a nonexistent ID.
- Submit `tenantId`, `createdByUserId`, `number`, `status`, or lifecycle timestamps in create/update payloads and confirm the API rejects those client-supplied authority fields with `400 INVALID_TICKET_INPUT`.
- Attempt to assign a ticket to a user outside the tenant or without TechDeck access and confirm the API returns generic `INVALID_ASSIGNEE` without identifying the target.

### Read-only database verification

Run these checks against a non-production verification database after the API startup DDL has completed:

```sql
SELECT tenant_id, number, title, priority, status, assigned_to_user_id, deleted_at
FROM techdeck_tickets
ORDER BY tenant_id, number;

SELECT tenant_id, last_number
FROM techdeck_ticket_sequences
ORDER BY tenant_id;

SELECT tenant_id, user_id, action, entity_id, metadata, created_at
FROM activity_feed
WHERE entity_type = 'techdeck_ticket'
ORDER BY created_at DESC;
```

Confirm `(tenant_id, number)` is unique, sequence values are not behind the highest ticket number, archived rows retain `deleted_at`, and create/update/status/archive actions have tenant-scoped activity records without ticket descriptions or other sensitive content in metadata.

## Pending Imported Workflows

The live Ticket Queue is active. The following imported workflows remain source snapshots and should be smoke-tested only after their own OperatorOS vertical slices are mounted:

- dashboard
- dedicated ticket detail, comments, and internal notes
- clients
- client detail
- sites
- assets
- evidence
- evidence upload
- IT ops console
- secure intake
- calendar
- time entries
- invoices
- knowledge base
- reports
- webhooks
- API tokens

## Failure States

- Missing entitlement produces a clear access-denied state.
- Disabled module produces a controlled unavailable state.
- SSO failure does not expose token values.
- Local auth disabled response does not leak stack traces.
- Billing redirects do not expose private Stripe keys or price IDs.
