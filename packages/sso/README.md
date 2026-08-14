# `packages/sso`

Shared OperatorOS SSO handoff helpers.

This package is intentionally framework- and database-free. The API owns user,
tenant, entitlement, audit, and persistence checks; this package owns the
versioned handoff primitives:

- SSO environment normalization.
- SSO issuer normalization.
- Hub-only authorization-code sealing.
- Exact client/callback/return-path binding and single-use handoff identifiers.
- Browser state, nonce, and S256 PKCE transaction validation primitives.
- Module `/sso?code=&state=` callback support in the unified runtime.

SSO contract v1 does not put identity JWTs in browser URLs. Legacy JWT helpers
remain only for rollback decoding and are not used by the v1 launch routes.

Current route integration lives in:

- `apps/api/src/routes/sso-routes.ts`
- `apps/web/src/middleware.ts` for target-host transaction creation
- `apps/web/src/app/sso/page.tsx` for the shared browser callback
- `apps/api/src/routes/module-routes.ts` for dormant legacy module handoff endpoints
- `apps/api/src/lib/sso-cleanup.ts` for persisted handoff cleanup

Do not put database access, Stripe logic, module-local sessions, or tenant
entitlement mutation in this package.
