# Server Modules

Each module lives under `server/modules/<name>/` and registers its routes from `server/routes.ts`. Modules use shared storage, event logging, and the auth helpers from `server/authz.ts`.

OperatorOS is the authority for module entitlements. Local subscription rows are legacy reference only.

| Module | Owner concern | Public? | OperatorOS-gated? |
| --- | --- | --- | --- |
| `account` | Per-user account settings, password change, MFA | Auth | No |
| `admin` | System-wide tenant/user admin with read-only OperatorOS entitlement status | Auth | System admin only |
| `api` | API token management and `/api/v1/*` token-scoped API | Mixed | Yes (`api`) |
| `billing` | Read-only OperatorOS billing/entitlement projection. Local checkout and customer portal writes return `410 Gone`. | Auth | OperatorOS snapshot |
| `operatoros` | Server-to-server entitlement sync at `POST /api/operatoros/entitlements/sync` | Service auth | Service token |
| `calendar` | Dispatch calendar appointments | Auth | Role/tenant |
| `core` | Tenants, clients, sites, assets, members, audit, CSV import/export | Auth | Role/tenant |
| `demo` | One-click sample data seed for empty workspaces | Auth | OWNER/ADMIN |
| `evidence` | Compliance evidence files with SHA-256 dedupe | Auth | Snapshot status and storage limit |
| `invoicing` | Billing config for invoices, invoice generation, line items, public invoice view | Auth + public | Snapshot status for mutations |
| `itops` | AI-powered IT operations console | Auth | Role/tenant |
| `kb` | Knowledge base articles, categories, search | Auth | Role/tenant |
| `license` | License server endpoints | Mixed | Role/tenant |
| `portal` | Client portal for CLIENT role | Auth | Yes (`portal`) |
| `recurring` | Recurring ticket templates | Auth | Snapshot status for mutations |
| `reports` | Compliance report generation and downloads | Auth | Yes (`reports`) |
| `reviewer` | Evidence reviewer workflow | Auth | Reviewer auth |
| `secure-intake` | External file intake with per-link tokens, spaces, policies, storage, and audit | Mixed | Yes (`intake`) |
| `status` | Status pages, public status API, components, and incidents | Mixed | Yes (`status`) |
| `tickets` | Ticketing CRUD, comments, SLA profiles | Auth | Role/tenant |
| `time` | Time entries linked to tickets/clients/users | Auth | Snapshot status for mutations |
| `webhooks` | Outbound webhooks with HMAC-SHA256 signing and worker | Auth + public sink | Yes (`webhooks`) |

## Conventions

- Routes export `register<Name>Routes(app)` and are mounted in `server/routes.ts`.
- State-changing operations call `emitEvent(action, tenantId, userId, entity, entityId, payload)` for audit.
- Tenant data must be scoped by `tenantId` from `req.tenantCtx`.
- Entitlement-gated modules use `requireFeature("feature")`.
- Limit-gated mutations use `checkLimit("limitName")`.
- The legacy Stripe webhook is not registered unless `ENABLE_LEGACY_STRIPE_WEBHOOK_AUDIT=true`; when enabled, it is audit-only and must not mutate access or local subscription state.

## Excluded From The Global Write Rate Limiter

- `/v1/*` - API token routes, with per-token controls.
- `/api/auth/*` - stricter auth limiter.
- `/t/upload/*` - public intake limiter.
- `/api/stripe/webhook` - only when legacy Stripe webhook audit is explicitly enabled.
