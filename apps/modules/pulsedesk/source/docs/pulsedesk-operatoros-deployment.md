# PulseDesk OperatorOS Deployment

PulseDesk is deployed as an OperatorOS-controlled child module. OperatorOS owns
pricing, checkout, subscriptions, seats, launch, and entitlement state.
PulseDesk owns the healthcare operations workflows: tickets, assets,
departments, vendors, supply requests, facility requests, connected inboxes,
notifications, analytics, and tenant-local settings.

## Required Environment

Set these on the PulseDesk deployment. Do not commit real values.

| Variable | Required | Expected value |
|---|---:|---|
| `DATABASE_URL` | yes | PostgreSQL connection string used by Drizzle and runtime migrations. |
| `SESSION_SECRET` | yes | High-entropy express-session secret. Required in production. |
| `MODULE_SSO_SECRET` | yes | Shared HS256 secret used for OperatorOS SSO JWT verification and entitlement webhook HMAC. Never log it. |
| `OPERATOROS_BASE_URL` | yes | OperatorOS issuer and parent launch URL, for example `https://operatoros.net`. PulseDesk normalizes trailing slashes. |
| `OPERATOROS_SSO_AUDIENCE` | yes | `pulsedesk`. Must match token `aud` and `module_slug`. |
| `OPERATOROS_SSO_ENV` | yes | `prod`, `staging`, or `dev`. Must match token `env`. |
| `OPERATOROS_SSO_CONSUME_URL` | production | Preferred full token-consume URL. Current validated production value: `https://operatoros.net/api/modules/sso/consume`. If the versioned route is active, use `https://operatoros.net/api/v1/modules/sso/consume`. |
| `OPERATOROS_API_URL` | fallback | Only use when `OPERATOROS_SSO_CONSUME_URL` is not set. Supported full consume values are `https://operatoros.net/api/modules/sso/consume` and `https://operatoros.net/api/v1/modules/sso/consume`. If using a base URL, set `https://operatoros.net/api` or `https://operatoros.net/api/v1`; PulseDesk derives the consume URL without duplicating `/api` or `/v1`. |
| `OPERATOROS_SERVICE_TOKEN` | yes | Server-only bearer token for entitlement introspection and webhook registration. |
| `OPERATOROS_ENTITLEMENTS_INTROSPECT_URL` | optional | Full introspection override. Defaults to `{OPERATOROS_BASE_URL}/v1/sso/entitlements/introspect`. Legacy alias `OPERATOROS_INTROSPECTION_URL` is also accepted. |
| `OPERATOROS_ENTITLEMENT_SYNC_URL` | optional | Full webhook registration URL override. Defaults to `{OPERATOROS_BASE_URL}/v1/sso/entitlements/sync`. |
| `APP_BASE_URL` | yes | Public PulseDesk root, for example `https://pulsedesk.support`. Used for OAuth callbacks and OperatorOS webhook registration. Accepted aliases for webhook registration: `PULSEDESK_PUBLIC_URL`, `PUBLIC_BASE_URL`, `PULSEDESK_URL`, or first `REPLIT_DOMAINS` value. |
| `PULSEDESK_MASTER_ADMIN_EMAIL` | recommended | Comma-separated configured master admins. Defaults to `john@shotgunninjas.com`; keep John present unless intentionally adding more emails. |
| `PULSEDESK_LOCAL_AUTH_ENABLED` | dev only | Enables local username/password fallback. Leave unset or false in production unless an approved reviewer workflow needs it. |

## Mail And Connector Environment

PulseDesk can operate without global OAuth credentials when tenants configure
per-org connector credentials in the UI. These env vars remain useful for
default connectors or inbound/outbound email operations:

| Variable | Purpose |
|---|---|
| `SENDGRID_API_KEY` | Outbound email and test email sending. |
| `SENDGRID_FROM_EMAIL` / `SENDGRID_FROM_NAME` | Optional outbound sender override. |
| `SENDGRID_INBOUND_BASIC_AUTH` | Recommended SendGrid Inbound Parse protection, format `user:pass`. |
| `SENDGRID_INBOUND_IP_ALLOWLIST` | Optional exact-IP allowlist for SendGrid inbound requests. |
| `SENDGRID_WEBHOOK_VERIFICATION_KEY` | Optional SendGrid signed webhook public key. |
| `MAILGUN_API_KEY` | Optional Mailgun inbound parsing support. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional default Google OAuth connector. Tenants can store per-org credentials instead. |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | Optional default Microsoft OAuth connector. Tenants can store per-org credentials instead. |

## Deprecated Environment

These are not required for PulseDesk deployment as an OperatorOS child module:

- Stripe price IDs in PulseDesk, including `STRIPE_PRICE_*` and
  PulseDesk-owned plan price variables.
- `STRIPE_WEBHOOK_SECRET` for PulseDesk.
- `STRIPE_SECRET_KEY` for PulseDesk checkout or portal creation.
- PulseDesk-owned billing or plan-selection vars.

Stripe billing remains an OperatorOS responsibility. PulseDesk legacy Stripe
files are retained only as rollback/reference code and are not mounted in the
active app.

## OperatorOS Setup

1. Create or confirm the OperatorOS module slug is `pulsedesk`.
2. Configure OperatorOS to issue HS256 handoff JWTs signed with the same
   `MODULE_SSO_SECRET`.
3. Set the PulseDesk launch URL to `https://<pulsedesk-host>/sso?token=<jwt>`.
4. Ensure token claims include:
   - `iss`: normalized `OPERATOROS_BASE_URL`
   - `aud`: `pulsedesk`
   - `module_slug`: `pulsedesk`
   - `env`: matching `OPERATOROS_SSO_ENV`
   - `iat`, `exp`, and `jti`
5. Configure token consume at `OPERATOROS_SSO_CONSUME_URL`.
6. Configure service-token access for:
   - `GET /v1/sso/entitlements/introspect?user_id=<id>&tenant_id=<id>`
   - `POST /v1/sso/entitlements/sync`
7. Confirm OperatorOS registers or accepts the PulseDesk webhook URL:
   `https://<pulsedesk-host>/webhooks/operatoros/entitlements`.
8. Confirm `john@shotgunninjas.com` is present in OperatorOS and launches
   PulseDesk through SSO. PulseDesk promotes configured master-admin emails
   only after OperatorOS authentication.

## Webhook Contract

Endpoint:

```text
POST /webhooks/operatoros/entitlements
```

Signature:

```text
X-Operatoros-Signature: sha256=<hex hmac>
```

Rules:

- The HMAC is computed over the raw request body with `MODULE_SSO_SECRET`.
- PulseDesk verifies before JSON parsing.
- Signature comparison is constant-time.
- Bad signatures return `401`.
- Snapshots older than the cached `computed_at` are ignored.
- Missing or disabled PulseDesk module entries revoke local module access and
  protected requests reject on the next access check.

## Runtime Verification

Run locally or in CI:

```bash
npm run check
npm run build
npm run smoke
```

Optional live webhook check:

```bash
PULSEDESK_SMOKE_BASE_URL=https://<pulsedesk-host> npm run smoke:webhook
```

The live webhook check posts an intentionally bad signature and expects `401`.

## Final Verification Checklist

- SSO success creates or updates local user, tenant/org, membership, session,
  entitlement snapshot, and audit log.
- SSO replay is rejected after OperatorOS consume fails.
- Expired token is rejected.
- Audience mismatch is rejected.
- Missing required SSO env returns configuration failure and does not create a
  local session.
- Enabled entitlement permits protected app access.
- Disabled or missing PulseDesk module entitlement revokes access within one
  protected request.
- Bad entitlement webhook signature returns `401`.
- `john@shotgunninjas.com` receives master-admin access after OperatorOS SSO.
- Regular users cannot access `/admin` or `/api/admin/*`.
- Tenant isolation is confirmed for tickets, departments, assets, vendors,
  supply requests, facility requests, email settings/connectors, notifications,
  and admin support actions.
- Major CRUD smoke checks pass for tickets, ticket notes/events, departments,
  assets, vendors, supply requests, facility requests, connected inboxes, and
  notifications.
- Visual/mobile smoke checks cover sidebar groups, dashboard first screen,
  ticket triage board, empty states, admin tabs, and no horizontal overflow on
  common mobile/tablet/laptop widths.
- No PulseDesk pricing page, billing nav item, checkout button, upgrade CTA, or
  local plan comparison appears in the child app.

## Deployment Order

1. Set env vars on the PulseDesk host.
2. Deploy code and run `npm run build`.
3. Start the server with `npm run start`.
4. Hit `GET /api/health`; expect `databaseOk`, `sessionConfigured`,
   `ssoConfigured`, `operatorOsConsumeConfigured`,
   `entitlementWebhookConfigured`, and `masterAdminConfigured` to be true for
   production.
5. Launch John from OperatorOS and verify System Admin access.
6. Launch a regular tenant user and verify dashboard, ticket queue, and role
   gates.
7. Send an OperatorOS disabled entitlement snapshot and verify access revokes.
