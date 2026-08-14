# OperatorOS SSO v1 Module Integration Prompt

Use this prompt only when migrating a module into OperatorOS. The default
topology is the unified Next/Fastify runtime behind the module's canonical
`*.operatoros.net` subdomain. Do not create another identity, billing, tenant,
or entitlement authority.

## Required protocol

1. Register one exact `clientId`, production origin, `/sso` callback, and
   `/logout` URI in the central OperatorOS registry.
2. On an unauthenticated module request, create high-entropy state, nonce, and
   PKCE verifier values on the target module host. Store them only in
   short-lived Secure, HttpOnly, SameSite=Lax, host-only cookies.
3. Redirect to `https://auth.operatoros.net/login` with the exact client ID,
   redirect URI, state, nonce, S256 challenge, and sanitized same-origin return
   path.
4. OperatorOS confirms the authenticated account, tenant status/membership,
   module status, and current entitlement before issuing a 60-second encrypted,
   single-use authorization code.
5. The browser returns only to the exact registered
   `{MODULE_BASE_URL}/sso?code=<opaque>&state=<state>` callback.
6. The same-origin server exchange validates the request host, state, nonce,
   PKCE verifier, code binding, expiry, replay state, user status, tenant, and
   entitlement. It atomically consumes the code and creates a host-only module
   session bound to that tenant and module.
7. Remove the code from browser history, then navigate to the sanitized local
   path.

## Hard prohibitions

- No identity JWT, access token, refresh token, or session token in a URL,
  browser storage, analytics, logs, or user-facing errors.
- No arbitrary `next`/return target and no wildcard callback.
- No shared module signing secret for browser code sealing.
- No local login/register or child Stripe subscription authority.
- No frontend-supplied user, tenant, role, or entitlement decision.
- No automatic retry loop after a failed authorization transaction.

## Shared-runtime implementation points

- Registry: `packages/modules/registry.ts` and
  `config/operatoros-module-registry.json`
- Target-host transaction: `apps/web/src/middleware.ts`
- Callback: `apps/web/src/app/sso/page.tsx`
- Issue/exchange: `apps/api/src/routes/sso-routes.ts`
- Session policy: `packages/auth/index.ts` and `apps/api/src/lib/auth.ts`
- Tenant/module gates: `apps/api/src/lib/tenant-auth.ts`
- Contract: `docs/auth/OPERATOROS_SSO_CONTRACT_V1.md`
- Onboarding and verification: `docs/auth/MODULE_ONBOARDING.md` and
  `docs/auth/VALIDATION_MATRIX.md`

If a module must later become a separate workload, keep this exact protocol
and use an independent per-client server credential for exchange. Never
restore the retired HS256 browser handoff.
