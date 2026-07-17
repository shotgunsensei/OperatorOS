# OperatorOS module navigation contract v1

OperatorOS exposes one public authenticated launcher:

```text
https://app.operatoros.net/
```

The Next.js page at `/app` is an internal rendering route. Modules must never
use a relative `/app` link because it resolves on the module subdomain. In
production, `/app` on any registered OperatorOS or module host is retained only
as a compatibility redirect to the canonical launcher. Redirect query
parameters are ignored and cannot select the destination.

## Environment

```dotenv
OPERATOROS_APPS_URL=https://app.operatoros.net/
```

Production accepts only that registered HTTPS URL. Development may use
`http://localhost:<port>/app`. Configure it once on OperatorOS; modules consume
the authenticated contract rather than defining separate return paths.

## Authenticated module endpoint

```http
GET /v1/modules/{module-slug}/navigation
Cookie: operatoros_session=...
X-Tenant-Id: <active-tenant-id>
```

An OperatorOS session or matching module-scoped SSO session may call this
endpoint. The API validates session, tenant, module state, and entitlement. It
returns the module identity; OperatorOS home, apps, profile, billing, support,
and logout URLs; current user; tenant; roles; entitlements; and brand metadata.
The support URL points to the existing OperatorOS contact/support surface at
`https://operatoros.net/john`.

Responses fail closed:

- `401` invalid or expired session; restart the normal OperatorOS authorization flow.
- `403 MODULE_ACCESS_DENIED` missing entitlement or wrong module session scope.
- `404 MODULE_NOT_FOUND` unknown slug.
- `409 MODULE_DISABLED` disabled or not-yet-live module.

## Module integration rules

1. Fetch the contract after SSO session establishment and tenant resolution.
2. Render navigation using the returned absolute URLs.
3. Never build a return URL from the inbound module host or append a
   caller-controlled redirect target.
4. On `401`, clear only the local host session and restart central SSO.
5. Use the returned logout URL for ecosystem logout behavior.

The typed registry in `packages/modules/registry.ts` is the source of truth for
module URLs, callbacks, health checks, entitlements, status, icons, and return
URLs. `config/operatoros-module-registry.json` remains the exact SSO client
registration allowlist.
