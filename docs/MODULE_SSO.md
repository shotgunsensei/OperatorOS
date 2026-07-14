# OperatorOS Module SSO and Entitlements

Status: canonical shared-runtime integration overview. The normative protocol
is [`auth/OPERATOROS_SSO_CONTRACT_V1.md`](auth/OPERATOROS_SSO_CONTRACT_V1.md).

OperatorOS serves each registered module on its canonical subdomain while one
control plane owns authentication, host-only sessions, tenants, roles,
entitlements, billing, and audit. Module source owns only its tenant-scoped
product UI, data, workflows, jobs, and integrations.

## Browser lane

```text
module host -> auth.operatoros.net/login
            -> POST /api/sso/issue
            -> module host /sso?code=<opaque>&state=<state>
            -> POST /api/sso/browser-exchange
            -> host-only tenant/module-bound session
            -> sanitized local path
```

The transaction requires exact client/callback registration, state, nonce,
PKCE S256, a 60-second encrypted code, atomic one-time consumption, exact host
validation, user/tenant/module status checks, and entitlement revalidation.
The final URL contains no credential.

## API authorization

Protected module routes use both `requireTenantMember` and
`requireTenantModuleAccess('<slug>')`. Module sessions are restricted to their
own module API prefix plus current-session, bound-tenant summary, and logout
endpoints. Tenant switching occurs in OperatorOS and requires a fresh module
authorization.

## Logout

- `GET /logout` clears only the current host cookie and lands on the canonical
  signed-out page without silently restarting SSO.
- `POST /api/auth/logout-all` increments `users.token_version`; every sibling
  host session fails its next authenticated check.

Browser and module-host code always calls the same-origin `/api/*` surface.
The Next proxy maps those requests to the Fastify `/v1/*` aliases internally.

## Legacy boundary

Old standalone adapters and token verification helpers remain only as audited
rollback source. Production raw-JTI/JWT consume routes are not mounted unless
`ALLOW_LEGACY_SSO_ROLLBACK=true` is explicitly set for a time-boxed emergency.
New implementations must never use a JWT query-string handoff.
