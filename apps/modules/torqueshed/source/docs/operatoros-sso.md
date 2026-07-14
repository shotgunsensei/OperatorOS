# OperatorOS SSO integration

TorqueShed is registered in OperatorOS with module ID and slug `torqueshed` and the production launch URL `https://torqueshed.pro/sso`.

## Production flow

1. OperatorOS checks the current user, tenant, and TorqueShed entitlement.
2. OperatorOS launches `https://torqueshed.pro/sso?token=<one-time-jwt>`.
3. TorqueShed immediately posts the token to `${OPERATOROS_API_URL}/v1/sso/consume` with `{ "token": "...", "moduleId": "torqueshed" }`.
4. OperatorOS verifies signature, issuer, audience, environment, user, tenant, entitlement, expiry, and atomically consumes the token JTI.
5. TorqueShed provisions or updates its local user projection and creates an opaque 30-day session. Only its SHA-256 digest is stored.
6. Web receives an HttpOnly, SameSite=Lax, Secure cookie. Native receives the opaque token over the verified universal/app link and stores it in the OS secure store.

TorqueShed does not decode the OperatorOS JWT, copy it into a cookie, or treat browser-supplied claims as identity.

## OperatorOS configuration

```env
TORQUESHED_URL=https://torqueshed.pro
MODULE_SSO_SECRET=<shared OperatorOS module-signing secret>
```

The signing secret remains in OperatorOS. TorqueShed needs only `OPERATOROS_API_URL` because validation and one-time consumption are owned by OperatorOS.

## TorqueShed configuration

Copy `.env.example`, set `DATABASE_URL`, and verify the three OperatorOS host URLs. In production, set `NODE_ENV=production` and the public URL exactly to `https://torqueshed.pro`.

For native deep linking, add the Apple team ID and Android SHA-256 signing certificate fingerprint. TorqueShed serves both association documents from `/.well-known/`.

## Failure behavior

Expired, replayed, wrong-audience, wrong-environment, and unavailable-consumer failures are mapped to stable non-sensitive messages. Raw tokens, response claims, and user email addresses are not logged.
