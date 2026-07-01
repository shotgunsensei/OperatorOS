# OperatorOS SSO Test Plan

Status: Phase 4 shared SSO route test plan.

## Automated Coverage Added

Pure helper coverage:

- `apps/api/test/sso-shared-helpers.test.ts`
- Verifies required claim fields.
- Verifies HS256 signing and verification.
- Verifies wrong audience rejection.
- Verifies expired token rejection.
- Verifies env normalization and secret length handling.
- Verifies launch URL shape.

DB-backed route coverage:

- `apps/api/test/shared-sso-routes.test.ts`
- Verifies `/api/sso/issue` issues a token for an entitled tenant user.
- Verifies `/v1/sso/consume` consumes that token and sets a session cookie.
- Verifies missing entitlement denies issue.
- Verifies root super-admin can issue without module entitlement.
- Verifies expired token rejection.
- Verifies wrong audience rejection.
- Verifies unauthenticated issue rejection.
- Verifies direct `/api/auth/me` and `/api/auth/logout` aliases.

The route test requires local Postgres. It skips with an explicit message when
Postgres is unavailable.

## Manual Verification Matrix

Use a seeded tenant with `techdeck` entitlement and a user who belongs to that
tenant.

1. Authenticated entitled user issues SSO:
   - Request: `POST /api/sso/issue`
   - Body: `{ "moduleId": "techdeck", "tenantId": "<tenant-id>" }`
   - Expected: `200`, `launchUrl`, `token`, `audience: "techdeck"`.

2. Missing entitlement denies SSO:
   - Request a module the tenant does not own.
   - Expected: `403 MODULE_ACCESS_DENIED`.

3. Root platform admin override:
   - Authenticate as `john@shotgunninjas.com`.
   - Request a module without tenant entitlement.
   - Expected: `200`, SSO token issued, audit row written.

4. Consume valid token:
   - Request: `POST /api/sso/consume`
   - Body: `{ "token": "<token>", "moduleId": "techdeck" }`
   - Expected: `200`, `sessionEstablished: true`, safe user, tenant, module,
     and claims context.

5. Replay consumed token:
   - Submit the same token again.
   - Expected: `409 TOKEN_REPLAYED`.

6. Wrong audience:
   - Consume a TechDeck token with `moduleId: "pulsedesk"`.
   - Expected: `400 AUDIENCE_MISMATCH`.

7. Expired token:
   - Wait beyond 90 seconds or create an expired fixture.
   - Expected: `401 TOKEN_EXPIRED` or `410 TOKEN_EXPIRED` if the persisted row
     has expired after signature verification.

8. Missing secret:
   - Unset `MODULE_SSO_SECRET`.
   - Expected: issue and consume fail closed with `503 SSO_SECRET_NOT_CONFIGURED`.

9. Inactive user:
   - Suspend/delete the issuing user before consume.
   - Expected: `403 USER_INACTIVE` or `401 USER_NOT_FOUND`.

10. Revoked tenant entitlement:
    - Issue token, revoke tenant entitlement, then consume.
    - Expected: `403 MODULE_ACCESS_DENIED`.

## Audit Checks

Confirm `admin_audit_logs` receives rows for:

- `sso_handoff_issued`
- `sso_handoff_consumed`
- `sso_issue_entitlement_denied`
- `sso_consume_token_rejected`
- `sso_handoff_replay_blocked`

Audit details must not include the JWT, authorization header, session token, or
secret values.

## Commands

```powershell
pnpm --filter ./apps/api typecheck
& 'C:\Dev\OperatorOS\apps\api\node_modules\.bin\tsx.cmd' --test --test-concurrency=1 test/sso-shared-helpers.test.ts test/shared-sso-routes.test.ts
```

## Remaining Gaps

- Route tests require a reachable Postgres database.
- Existing legacy `/v1/modules/:slug/handoff` still has its historical dev
  unsigned fallback. New shared `/v1/sso/issue` fails closed when
  `MODULE_SSO_SECRET` is missing.
- Real module receiver pages are not wired in Phase 4.
