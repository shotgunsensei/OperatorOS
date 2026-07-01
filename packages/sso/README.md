# `packages/sso`

Shared OperatorOS SSO handoff helpers.

This package is intentionally framework- and database-free. The API owns user,
tenant, entitlement, audit, and persistence checks; this package owns the token
contract:

- SSO environment normalization.
- SSO issuer normalization.
- `MODULE_SSO_SECRET` validation.
- Handoff JWT claim construction.
- HS256 signing and verification.
- Module `/sso?token=` launch URL construction.

Current route integration lives in:

- `apps/api/src/routes/sso-routes.ts`
- `apps/api/src/routes/module-routes.ts` for legacy module handoff endpoints
- `apps/api/src/lib/sso-cleanup.ts` for persisted handoff cleanup

Do not put database access, Stripe logic, module-local sessions, or tenant
entitlement mutation in this package.
