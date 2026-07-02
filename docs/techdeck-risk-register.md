# TechDeck Risk Register

## Critical

### Local Tenant Model Is Separate

TechDeck stores tenants and memberships in its own `tenants` and `tenant_members` tables. OperatorOS stores tenants and memberships centrally. Mounting TechDeck write routes before a mapping plan could create split-brain tenant state.

Mitigation: migrate read-only routes first and require an explicit OperatorOS tenant id on every query. Do not allow TechDeck-local tenant selection to override OperatorOS context.

### Standalone Auth Still Exists In Source

The imported source contains local auth routes, sessions, MFA, and emergency system-admin login behavior. These files are preserved for compatibility but must not become the OperatorOS module authority.

Mitigation: only expose TechDeck through OperatorOS auth/session gates. Do not mount standalone `/api/auth/login` or `/api/auth/register` from the imported app into OperatorOS.

### Production Bootstrap Must Stay OperatorOS-Owned

The imported TechDeck production seed previously contained literal bootstrap passwords and local super-admin account creation. Phase 10 removed TechDeck-local production super-admin bootstrap entirely.

Mitigation: keep root platform admin creation in OperatorOS. Do not reintroduce TechDeck-local super-admin bootstrap, hardcoded admin email bypasses, or standalone password creation.

### TechDeck API Routes Are Not Yet Mounted

The active Phase 9 shell proves routing and context mapping, not full feature execution. Imported feature routes remain under `apps/modules/techdeck/source/server/modules/*`.

Mitigation: Phase 10 should migrate routes incrementally with focused tests for auth, tenant filtering, entitlement checks, and role authorization.

## High

### Local Billing Code Remains For Legacy Audit

TechDeck source includes billing routes and Stripe webhook audit code. The source docs classify checkout/customer portal/subscription mutation as OperatorOS-managed, but code still exists.

Mitigation: keep billing routes unmounted in OperatorOS. Any future billing UI must point to OperatorOS billing.

### Database Schema Collision Risk

TechDeck standalone schema uses generic table names such as `users`, `tenants`, `sessions`, `tickets`, and `audit_logs`. Importing these directly into the OperatorOS database would collide conceptually and possibly physically.

Mitigation: namespace or remap TechDeck-local tables before any migration. Prefer OperatorOS tenant/user ids as foreign keys for new data.

### File Uploads And Evidence Data Need Storage Review

TechDeck evidence and secure-intake modules handle uploads and local storage. Imported runtime upload data was intentionally excluded.

Mitigation: define an OperatorOS storage adapter and tenant-scoped path policy before enabling uploads.

## Medium

### UI Framework Differences

TechDeck uses Vite/Wouter/shadcn while OperatorOS web is Next.js. A direct client import would require alias, CSS, routing, and dependency reconciliation.

Mitigation: keep source under `apps/modules/techdeck/source` and migrate screens into OperatorOS shells one workflow at a time.

### Role Semantics Differ

TechDeck roles are `OWNER`, `ADMIN`, `TECH`, and `CLIENT`. OperatorOS tenant roles are `owner`, `admin`, and `member`.

Mitigation: adapter maps OperatorOS owner/admin/platform admin to TechDeck `ADMIN`, member to `TECH`, and never grants local `OWNER`.

### API Token Mode Needs Policy

TechDeck includes API-token and API-only behavior. OperatorOS must decide whether module-local API tokens are allowed or whether all API access must be mediated by OperatorOS.

Mitigation: leave API-token routes unmounted until a platform policy exists.

## Manual QA Checklist

- `/modules/techdeck` renders the TechDeck module shell.
- `techdeck.operatoros.net` resolves to the same shell.
- Logged-out direct access redirects to login.
- Missing entitlement is blocked before shell render.
- Root platform super-admin is allowed by server-side platform admin authority.
- Tenant admin resolves to TechDeck adapter role `ADMIN`.
- Tenant member resolves to TechDeck adapter role `TECH`.
- Imported source tree exists under `apps/modules/techdeck/source`.
- Standalone TechDeck pricing/login routes are not used by the OperatorOS shell.
