# `@operatoros/auth` Placeholder

Reserved package boundary for future shared auth helpers.

No package manifest or runtime code is added in Phase 1. Current production auth
remains in:

- `apps/api/src/lib/auth.ts`
- `apps/api/src/lib/session-secret.ts`
- `apps/api/src/routes/auth-routes.ts`
- `apps/web/src/components/AuthProvider.tsx`
- `apps/web/src/lib/auth.ts`

Future extraction must preserve API-side JWT verification, token-version
revocation, account lockout, secure cookie behavior, and platform role checks.
