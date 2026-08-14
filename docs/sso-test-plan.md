# OperatorOS SSO v1 Test Plan

Status: current shared-runtime verification plan. The release result is tracked
in `docs/auth/VALIDATION_MATRIX.md`; the normative protocol is
`docs/auth/OPERATOROS_SSO_CONTRACT_V1.md`.

## Automated coverage

- Registry and static tests verify all 13 exact production origins, `/sso`
  callbacks, `/logout` URIs, host routing, proxy routing, and the absence of a
  JWT query-string handoff in active code.
- Helper tests verify state, nonce, PKCE S256, callback/return-path binding,
  encrypted code integrity, expiry, and code construction.
- API tests verify account, tenant, module, role, and entitlement checks;
  atomic replay rejection; module/tenant-bound sessions; global revocation;
  exact-origin mutation policy; and denial codes.
- Import tests verify the three core source snapshots remain auditable while
  the shared runtime owns active authentication, billing, and routing.

DB-backed tests require an isolated PostgreSQL test database. They must not be
reported as passing when PostgreSQL is unavailable.

## Required browser matrix

Run each launch from the Command Center and by direct canonical module URL:

1. Signed-out request starts one central authorization transaction.
2. Successful login returns only to the exact registered `/sso` callback with
   `code` and `state`.
3. The callback exchanges server-side, removes the code from history, and
   reaches the sanitized same-origin deep link.
4. Reload retains the module-host session without a redirect loop.
5. A revoked entitlement, suspended user/tenant, disabled module, wrong host,
   mismatched state/nonce/PKCE, expired code, and replay all fail closed with a
   bounded error.
6. Local logout clears only the current host and does not silently restart SSO.
7. Global logout increments `token_version`; every sibling session fails on
   its next authenticated request.
8. A module session cannot call a sibling module, Platform Command, switch
   tenant, or override its sealed tenant with a header.

The final browser URL must never contain a token or code. Auth and callback
responses require `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

## Production configuration checks

- `SESSION_SECRET` is set to a high-entropy value.
- `SSO_CODE_ENCRYPTION_SECRET` is an independent 32+ character hub-only key.
- `TRUST_PROXY=true` only behind the managed Replit proxy.
- `ALLOW_LEGACY_SSO_ROLLBACK` is absent or `false`.
- Unified-runtime modules have no copied shared SSO signing secret.
- Every public request preserves the canonical host used by exact-origin and
  callback validation.

## Commands

```powershell
corepack pnpm typecheck
corepack pnpm --dir apps/api build
& 'C:\Dev\OperatorOS\apps\api\node_modules\.bin\tsx.cmd' --test --test-concurrency=1 test/sso-shared-helpers.test.ts test/sso-contract-v1-static.test.ts test/module-session-boundary.test.ts test/request-origin-policy.test.ts test/shared-sso-routes.test.ts
```

Production remains blocked until the source/static gates, DB-backed suite, and
authenticated browser matrix all pass against the deployed Replit release.
