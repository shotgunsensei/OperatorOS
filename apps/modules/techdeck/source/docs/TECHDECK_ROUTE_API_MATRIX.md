# Tech Deck Route and API Matrix

This document maps the SPA routes in `client/src/App.tsx` and the Express routes registered from `server/modules/*/routes.ts`. The executable frontend metadata lives in `client/src/lib/route-manifest.ts`; static tests verify that concrete `App.tsx` route paths stay represented there.

## Frontend Route Matrix Summary

| Area | Paths | Component(s) | Auth | Roles | Inactive entitlement behavior | Sidebar/mobile |
| --- | --- | --- | --- | --- | --- | --- |
| Public landing/legal | `/`, `/privacy`, `/terms`, `/refund`, `/pricing` | `LandingPage`, legal pages | No | Public | Not blocked | No sidebar |
| Public status/intake | `/status/:slug`, `/t/upload/:token` | `PublicStatusPage`, `ExternalUploadPage` | No | Public | Token/status route controls access | No sidebar |
| Local auth | `/login`, `/register`, `/reviewer-login` | Local auth pages | No | Public | Not blocked | No sidebar |
| Access states | `/access-denied`, `*` | `AccessDeniedPage`, `NotFound` | No | Public/authenticated | Not blocked | Recovery states |
| Dashboard | `/` | `DashboardPage` or client redirect | Yes | `OWNER`, `ADMIN`, `TECH`; `CLIENT` redirects | Paused routes redirect to evidence-safe state | Command Center |
| Client portal | `/portal`, `/portal/clients/:id`, `/portal/evidence`, `/portal/tickets`, `/portal/invoices` | Portal pages | Yes | `CLIENT` | Feature-gated by OperatorOS `portal` | Client Portal |
| Tickets | `/tickets`, `/tickets/:id` | Ticket list/detail | Yes | `OWNER`, `ADMIN`, `TECH` | Writes blocked by `requireNotPaused` | Service Desk, native `/m` |
| Clients/assets | `/clients`, `/clients/:id`, `/sites`, `/assets` | Core pages | Yes | `OWNER`, `ADMIN`, `TECH` | Writes blocked by `requireNotPaused` | Clients & Assets |
| Field ops | `/calendar`, `/time` | Calendar/time pages | Yes | `OWNER`, `ADMIN`, `TECH` | Writes blocked by `requireNotPaused` | Field Ops, native `/m` |
| Knowledge base | `/kb`, `/kb/:id` | KB list/article | Yes | `OWNER`, `ADMIN`, `TECH` | Admin writes blocked by `requireNotPaused` | Service Desk |
| Evidence | `/evidence`, `/evidence/upload`, `/evidence/:id` | Evidence pages | Yes | `OWNER`, `ADMIN`, `TECH`, scoped `CLIENT` reads | Read/export remains available during inactive state; writes/deletes blocked | Evidence & Compliance |
| Invoicing | `/invoices`, `/invoices/:id`, `/billing-settings` | Invoice/billing config pages | Yes | `OWNER`, `ADMIN` | Writes blocked by `requireNotPaused` | Administration |
| Admin ops | `/recurring-tickets`, `/team`, `/audit`, `/client-access`, `/settings` | Admin/core pages | Yes | Mostly `OWNER`, `ADMIN`; settings includes `TECH` | Mutations blocked by `requireNotPaused` where applicable | Service Desk, Evidence, Administration |
| License server | `/licenses`, `/licenses/developer` | License pages | Yes | `OWNER`, `ADMIN` | Writes blocked by `requireNotPaused` | Automation & Integrations |
| Integrations | `/webhooks`, `/status-admin`, `/api-tokens`, `/reports`, `/secure-intake/*` | Integration/report/intake pages | Yes | `OWNER`, `ADMIN`; some include `TECH` | OperatorOS feature gates: `webhooks`, `status`, `api`, `reports`, `intake` | Locked when feature missing |
| OperatorOS billing | `/billing` | `BillingPage` | Yes | `OWNER`, `ADMIN` | Not blocked; read-only recovery path | OperatorOS |
| Account security | `/account-security`, `/mfa-setup` | Account pages | Yes | All authenticated roles | Not blocked | User menu |
| Mobile technician | `/m`, `/m/tickets`, `/m/tickets/:id`, `/m/time`, `/m/calendar` | Mobile pages | Yes | `OWNER`, `ADMIN`, `TECH` | Disabled when paused; `CLIENT` stays portal-scoped | Native mobile |
| System admin | `/system-admin` | `AdminPanelPage` | Yes | System admin only | Not blocked | System |

## Backend API Matrix

| Module file | Method/path | Auth middleware | Tenant middleware | Role middleware | Entitlement middleware | Read/write | Primary frontend caller |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `server/modules/core/routes.ts` | `GET /api/clients/template.csv`, `GET /api/sites/template.csv`, `GET /api/assets/template.csv` | Public | None | None | None | Read | Import templates |
| `server/modules/core/routes.ts` | `POST /api/tenants` | `isAuthenticated`, `requireUser` | User only | None | `requireNotPaused` | Write | Local onboarding |
| `server/modules/core/routes.ts` | `GET /api/tenant` | `isAuthenticated`, `requireUser` | Membership lookup | None | None | Read | App shell, settings |
| `server/modules/core/routes.ts` | `GET /api/dashboard` | `isAuthenticated` | `requireTenant` | `requireRole(OWNER, ADMIN, TECH)` | None | Read | Dashboard |
| `server/modules/core/routes.ts` | `GET /api/clients`, `GET /api/clients/:id` | `isAuthenticated` | `requireTenant` / `requireClientAccess` | Scoped by middleware | None | Read | Dashboard, clients, portal support |
| `server/modules/core/routes.ts` | `POST /api/clients`, `DELETE /api/clients/:id`, `POST /api/clients/bulk-delete`, `POST /api/clients/import` | `isAuthenticated` | Role middleware sets tenant | `requireRole(OWNER, ADMIN, TECH)` | `requireNotPaused`, client limit for create/import | Write | Clients |
| `server/modules/core/routes.ts` | `GET /api/sites`, `POST /api/sites`, `DELETE /api/sites/:id`, `POST /api/sites/bulk-delete`, `POST /api/sites/import` | `isAuthenticated` | Role middleware sets tenant | `requireRole(OWNER, ADMIN, TECH)` | `requireNotPaused` on writes | Read/write | Sites, assets, calendar |
| `server/modules/core/routes.ts` | `GET /api/assets`, `GET /api/assets/:id`, `POST /api/assets`, `DELETE /api/assets/:id`, `POST /api/assets/bulk-delete`, `POST /api/assets/import` | `isAuthenticated` | Role middleware sets tenant | `requireRole(OWNER, ADMIN, TECH)` | `requireNotPaused` on writes | Read/write | Assets, reports, dashboard |
| `server/modules/core/routes.ts` | `GET /api/members`, `POST /api/members/invite`, `PATCH /api/members/:id` | `isAuthenticated` | `requireTenant` / role middleware | Invite/update require `OWNER`, `ADMIN` | `requireNotPaused`, user limit for invite | Read/write | Team, calendar assignment |
| `server/modules/core/routes.ts` | `GET /api/audit-logs`, `GET /api/audit-actions` | `isAuthenticated` | Role middleware sets tenant | `requireRole(OWNER, ADMIN)` | None | Read | Audit |
| `server/modules/core/routes.ts` | `GET/POST/PATCH/DELETE /api/client-access` | `isAuthenticated` | Role middleware sets tenant | `requireRole(OWNER, ADMIN)` | `requireNotPaused` on writes | Read/write | Client Access |
| `server/modules/core/routes.ts` | `GET /api/tenant/pause-status`, `GET /api/modules` | `isAuthenticated` | `requireRole` / `requireTenant` | All tenant roles for pause status | None | Read | Shell/settings |
| `server/modules/tickets/routes.ts` | `GET /api/tickets`, `GET /api/tickets/:id`, `GET /api/tickets/:id/comments`, `GET /api/ticket-statuses` | `isAuthenticated` | `requireTenant` | Tenant role scoped | None | Read | Tickets, mobile |
| `server/modules/tickets/routes.ts` | `POST /api/tickets`, `PATCH /api/tickets/:id`, `POST /api/tickets/:id/comments`, `PATCH /api/tickets/:id/comments/:commentId` | `isAuthenticated` | `requireTenant` | Tenant role scoped | `requireNotPaused` | Write | Tickets, portal comments, mobile |
| `server/modules/tickets/routes.ts` | `DELETE /api/tickets/:id`, ticket status admin mutations | `isAuthenticated` | Role middleware sets tenant | `requireRole(OWNER, ADMIN)` | `requireNotPaused` | Write | Tickets/admin settings |
| `server/modules/calendar/routes.ts` | `GET /api/appointments`, `GET /api/appointments/:id` | `isAuthenticated` | `requireTenant` | Tenant role scoped | None | Read | Calendar, mobile |
| `server/modules/calendar/routes.ts` | `POST/PUT /api/appointments/:id?`, `DELETE /api/appointments/:id` | `isAuthenticated` | `requireTenant` / role middleware | Delete requires `OWNER`, `ADMIN` | `requireNotPaused` | Write | Calendar, mobile |
| `server/modules/time/routes.ts` | `GET /api/time-entries`, `GET /api/time-entries/:id` | `isAuthenticated` | `requireTenant` | Tenant role scoped | None | Read | Time, mobile, invoices |
| `server/modules/time/routes.ts` | `POST/PUT/DELETE /api/time-entries/:id?` | `isAuthenticated` | `requireTenant` | Tenant role scoped | `requireNotPaused` | Write | Time, mobile |
| `server/modules/evidence/routes.ts` | `GET /api/evidence`, `GET /api/evidence/:id`, `GET /api/evidence/:id/download`, `GET /api/tags` | `isAuthenticated` | `requireTenant` | Tenant/client scoping in storage | None | Read | Evidence, dashboard, portal |
| `server/modules/evidence/routes.ts` | `POST /api/evidence/upload`, `DELETE /api/evidence/:id`, `POST /api/tags` | `isAuthenticated` | `requireTenant` / role middleware | Writes require `OWNER`, `ADMIN`, `TECH` | `requireNotPaused`, storage limit for upload | Write | Evidence upload/detail |
| `server/modules/reports/routes.ts` | `POST /api/reports/evidence-packet`, `GET /api/reports/jobs`, `GET /api/reports/jobs/:id`, `GET /api/reports/jobs/:id/download` | `isAuthenticated` | Role middleware sets tenant | `requireRole(OWNER, ADMIN, TECH)` | `requireFeature(reports)`, `checkLimit(reportsPerMonth)`, `requireNotPaused` on create | Read/write | Reports |
| `server/modules/portal/routes.ts` | `GET /api/portal/me`, `/clients`, `/clients/:id`, `/evidence`, `/tickets`, `/tickets/:id/comments`, `/invoices`, `/invoices/:id` | `requireTenant` | Tenant context | Client scoping in route/storage | `requireFeature(portal)` | Read | Client Portal |
| `server/modules/portal/routes.ts` | `POST /api/portal/tickets`, `POST /api/portal/tickets/:id/comments` | `requireTenant` | Tenant context | Client scoping in route/storage | `requireFeature(portal)` | Write | Client Portal |
| `server/modules/billing/routes.ts` | `GET /api/me/entitlements`, `GET /api/billing/subscription`, `GET /api/billing/plans` | `isAuthenticated` | User/tenant lookup where needed | None | OperatorOS snapshot read | Read | Billing, shell, plan badge |
| `server/modules/billing/routes.ts` | `POST /api/billing/checkout-session`, `POST /api/billing/customer-portal` | `isAuthenticated` | None | None | Returns `410 managed_by_operatoros` | Disabled write | Billing regression tests |
| `server/modules/invoicing/routes.ts` | `GET/POST /api/invoices`, `GET/PUT/DELETE /api/invoices/:id`, line items, send, mark-paid, public invoice read, `GET/PUT /api/billing-config` | `isAuthenticated` for admin routes | Role middleware sets tenant | `requireRole(OWNER, ADMIN)` | `requireNotPaused` on writes | Read/write | Invoices, billing settings |
| `server/modules/kb/routes.ts` | `GET /api/kb`, `GET /api/kb/:id` | `isAuthenticated` | `requireTenant` | Tenant role scoped | None | Read | Knowledge Base |
| `server/modules/kb/routes.ts` | `POST/PUT/DELETE /api/kb/:id?` | `isAuthenticated` | Role middleware sets tenant | `requireRole(OWNER, ADMIN)` | `requireNotPaused` | Write | Knowledge Base admin |
| `server/modules/recurring/routes.ts` | `GET/POST/PUT/DELETE /api/recurring-templates/:id?` | `isAuthenticated` | Role middleware sets tenant | `requireRole(OWNER, ADMIN)` | `requireNotPaused` on writes | Read/write | Recurring Tickets |
| `server/modules/license/routes.ts` | License product/key/activation routes and validation | Mixed public validation and authenticated admin routes | Role middleware on admin routes | `requireRole(OWNER, ADMIN)` | `requireNotPaused` on writes | Read/write | License Server |
| `server/modules/webhooks/routes.ts` | `GET/POST/PATCH/DELETE /api/webhooks/:id?`, `GET /api/webhooks/:id/deliveries`, `GET /api/webhook-events` | `isAuthenticated` | Role middleware sets tenant | `requireRole(OWNER, ADMIN)` | `requireFeature(webhooks)`, `checkLimit(webhooksMax)`, `requireNotPaused` on writes | Read/write | Webhooks |
| `server/modules/status/routes.ts` | `GET/PUT /api/status/page`, `GET/POST/PATCH/DELETE /api/status/components/:id?`, `GET/POST/PATCH/DELETE /api/status/incidents/:id?` | `isAuthenticated` | Role middleware sets tenant | `requireRole(OWNER, ADMIN)` | `requireFeature(status)`, `requireNotPaused` on writes | Read/write | Status Admin |
| `server/modules/status/routes.ts` | `GET /api/public/status/:slug` | Public | Tenant resolved by slug | None | Tenant feature access checked | Read | Public status page |
| `server/modules/api/adminRoutes.ts` | `GET/POST/DELETE /api/api-tokens/:id?` | `isAuthenticated` | Role middleware sets tenant | `requireRole(OWNER, ADMIN)` | `requireFeature(api)`, `requireNotPaused` on create | Read/write | API Tokens |
| `server/modules/api/routes.ts` | `/api/v1/openapi.json`, `/api/v1/status/:slug`, `/api/v1/evidence`, `/api/v1/license/validate` | Bearer token where required | API token tenant context | Scope-based | Tenant feature access for API routes | Read/write by scope | External API |
| `server/modules/secure-intake/routes.ts` | `GET /api/secure-intake/dashboard`, `/spaces`, `/requests`, `/files`, `/storage`, `/audit`, `/policies` | `isAuthenticated` | `requireTenant` | Read tech/admin split by route | `requireFeature(intake)` | Read | Secure Intake |
| `server/modules/secure-intake/routes.ts` | `POST/PATCH/DELETE /api/secure-intake/spaces/:id?`, `POST /api/secure-intake/requests`, revoke, file patch/delete, `PUT /api/secure-intake/policies` | `isAuthenticated` | `requireTenant` | Admin/tech write split by route | `requireFeature(intake)`, `checkLimit`, `requireNotPaused` | Write | Secure Intake |
| `server/modules/secure-intake/routes.ts` | `GET /api/public/intake/:token`, password verify, upload | Public token route | Token resolves intake request | None | Token expiry/password/one-time checks | Read/write | External upload |
| `server/modules/itops/routes.ts` | `POST /api/itops/query` | `isAuthenticated` | Role middleware sets tenant | `requireRole(OWNER, ADMIN, TECH)` | `requireNotPaused` | Write/query | IT Ops Console |
| `server/modules/admin/routes.ts` | `/api/admin/*`, `/api/auth/admin-check` | `isAuthenticated` | System admin middleware | `requireSystemAdmin` for admin routes | Billing mutations return `410` | Read/write admin | System Admin |
| `server/modules/operatoros/routes.ts` | `POST /api/operatoros/entitlements/sync` | Shared secret/webhook validation | Tenant/user resolved from payload | None | OperatorOS webhook authority | Write sync | OperatorOS |
| `server/modules/account/routes.ts` | `GET /api/account/info`, `DELETE /api/account` | `isAuthenticated` | User scoped | None | None | Read/write | Account deletion |
| `server/modules/reviewer/routes.ts` | `POST /api/reviewer-login` | HTTPS + CSRF + reviewer secret | None | Reviewer policy | None | Auth write | Reviewer login |
| `server/modules/demo/routes.ts` | Demo/reset routes | `isAuthenticated` | `requireTenant` | `requireRole(OWNER, ADMIN)` | None | Write | Demo tooling |

## Known Route Contracts

- Public routes must render without an authenticated user.
- Authenticated route loading must wait for `/api/auth/user` and `/api/tenant` before rendering protected content.
- `CLIENT` users land in `/portal`; non-client users land in dashboard.
- `/m` mobile routes are technician routes only and must not match `/mfa-setup`.
- Unknown routes render `NotFound`.
- Local billing mutation endpoints stay decommissioned with `410`; OperatorOS remains the plan and entitlement authority.
