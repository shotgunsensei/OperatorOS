# Authentication environment variables

No values belong in Git.

| Variable | Scope | Purpose |
|---|---|---|
| `DATABASE_URL` | OperatorOS | Required PostgreSQL authority for users, tenants, entitlements, and atomic persistence/consumption of one-time SSO handoffs. |
| `SESSION_SECRET` | OperatorOS | Signs the OperatorOS application session and protects server cookies. |
| `SSO_CODE_ENCRYPTION_SECRET` | OperatorOS | Required 32+ character hub-only code sealing/rotation secret in production. Production never falls back to a module-shared key. |
| `MODULE_SSO_SECRET` | OperatorOS only, transitional | Legacy rollback/HMAC key. It is not accepted by production SSO v1 code sealing and must not be distributed to unified-runtime modules. |
| `ALLOW_LEGACY_SSO_ROLLBACK` | OperatorOS only, emergency | Defaults off in production. Temporarily mounts legacy consume endpoints only during an explicitly approved rollback window. |
| `OPERATOROS_BASE_URL` | OperatorOS | Canonical issuer/base URL. |
| `INTERNAL_API_URL` | Next server only | Routes same-origin browser `/api/*` requests to Fastify. The unified Replit runtime uses `http://localhost:5001`; never expose it as a public redirect. |
| `APP_ENV` / `NODE_ENV` | OperatorOS | Runtime environment; SSO derives `prod`, `staging`, or `dev` from these existing settings. |
| `TRUST_PROXY` | Hub | Enables Fastify and host/origin forwarded-header processing behind Replit only when the value is exactly `1` or `true`; defaults false. |

`COOKIE_DOMAIN` is deprecated for SSO contract v1. Production sessions default to host-only cookies.

`OPERATOROS_BASE_URL=https://operatoros.net` is the only supported production
platform URL override. Leave the legacy `APP_URL` input unset in production.
The default `operator-os.replit.app` alias is not a callback, CORS origin, or
absolute auth return target.

The `OPERATOROS_SSO_CLIENT_SECRET_*`, module-local
`OPERATOROS_SSO_CLIENT_SECRET`, `OPERATOROS_API_URL`,
`OPERATOROS_SSO_AUDIENCE`, and `CHILD_APP_MODULE_KEY` variables belong only to
the retired standalone-adapter rollback path. They are not required by the
unified runtime and should be removed after the rollback window.
