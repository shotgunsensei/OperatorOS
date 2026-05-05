# Shotgun OS Module SSO Handoff

OperatorOS is the central identity, billing, and entitlement hub for the
Shotgun SaaS ecosystem. Individual products (TradeFlowKit, TorqueShed,
TechDeck, PulseDesk, FaultlineLab, BF-OS, SnapProofOS, StudyForge AI,
Ninja Launch Kit) trust OperatorOS to vouch for who a user is and what
they're allowed to do.

This doc describes the **module SSO handoff protocol** that lets a user
click "Launch" on the OperatorOS Apps page and be signed into the target
product without re-entering credentials.

## Goals

- **Single source of truth.** OperatorOS owns the user record and the
  entitlement decision. Modules never compute access themselves.
- **Short blast radius.** A handoff token is single-use and lives for
  90 seconds. A leaked token is useless almost immediately.
- **No coupling to the user's session JWT.** The module SSO flow uses a
  dedicated signing key (`MODULE_SSO_SECRET`), so even if a module is
  compromised, the user's OperatorOS session is not.
- **Fail-closed.** Any unexpected state (env mismatch, expired token,
  user no longer entitled) results in denial.

## Endpoints

All endpoints live under `https://<operatoros-host>/v1/modules`.

### `POST /v1/modules/:slug/handoff` (auth required)

Issued by the operator hub when the user clicks Launch.

Response:

```json
{
  "token": "<jwt>",
  "launchUrl": "https://tradeflowkit.com?sso=<jwt>",
  "expiresIn": 90,
  "moduleSlug": "tradeflowkit",
  "env": "production"
}
```

The hub redirects the user to `launchUrl`.

Rate-limited to 10 issuances per user per minute. Returns:

- `403 MODULE_ACCESS_DENIED` — user has no entitlement
- `409 MODULE_COMING_SOON` / `MODULE_DISABLED` — module not launchable
- `409 NO_BASE_URL` — module has no `base_url` configured
- `429 RATE_LIMITED` — too many launches

### `POST /v1/modules/sso/consume` (no auth)

Called by the receiving module when it sees `?sso=<jwt>` on its landing page.

Request:

```json
{
  "token": "<jwt>",
  "expectedAudience": "tradeflowkit"
}
```

On success (200):

```json
{
  "ok": true,
  "user": { "id": "uuid", "email": "...", "role": "user" },
  "moduleSlug": "tradeflowkit",
  "planSlug": "elite",
  "organizationId": null,
  "issuedAt": 1730000000,
  "expiresAt": 1730000090,
  "env": "production"
}
```

Errors:

| Code | HTTP | Meaning |
| --- | --- | --- |
| `TOKEN_REQUIRED` | 400 | Missing token in body |
| `TOKEN_INVALID` | 401 | Bad signature or malformed |
| `ENV_MISMATCH` | 401 | Token env (e.g. `staging`) does not match server env (`production`) |
| `AUDIENCE_MISMATCH` | 401 | Token `aud` claim does not match `expectedAudience` |
| `TOKEN_UNKNOWN` | 401 | jti not found in OperatorOS DB |
| `TOKEN_EXPIRED` | 401 | Past `exp` |
| `TOKEN_REPLAYED` | 410 | Already consumed |
| `MODULE_ACCESS_REVOKED` | 403 | User lost entitlement between issue and consume |

## Token (JWT) shape

Algorithm: **HS256**, signed with `MODULE_SSO_SECRET`.

Claims:

| Claim | Description |
| --- | --- |
| `iss` | Always `"operatoros"` |
| `aud` | Module slug, e.g. `"tradeflowkit"` |
| `env` | `development` / `staging` / `production` (from `APP_ENV`) |
| `user_id` | OperatorOS user UUID |
| `email` | Primary email |
| `role` | `user` or `admin` |
| `module_slug` | Same as `aud` |
| `plan_slug` | `starter` / `pro` / `elite` / null |
| `organization_id` | Reserved for future per-org SSO |
| `jti` | 24-byte hex random — the replay key |
| `iat`, `exp` | Standard JWT timestamps; `exp - iat = 90` |

The `jti` is also persisted in `sso_handoff_tokens` so consumption can
mark the token spent. A 15-minute background job removes expired and
already-consumed rows.

## Security properties

1. **Single-use.** `consume` performs an atomic `UPDATE ... WHERE consumed_at IS NULL`.
   Two consumers racing on the same token: one wins, the other gets `TOKEN_REPLAYED`.
2. **Short TTL.** 90 s window between issue and consume.
3. **Env binding.** A token issued in dev cannot consume in prod.
4. **Audience binding.** A token issued for TorqueShed cannot be redeemed
   by TradeFlowKit (provided receivers pass `expectedAudience`).
5. **Re-check at consume.** Even with a valid token, OperatorOS re-checks
   entitlement at consume-time. If the user was downgraded between
   issue and consume, access is denied.
6. **Separate signing key.** `MODULE_SSO_SECRET` is independent of
   `SESSION_SECRET`. Compromise of the module SSO key does not let an
   attacker mint regular session JWTs.
7. **Rate limit.** Per-user 10 handoffs/minute.
8. **IP captured.** `issued_ip` and `consumed_ip` are stored for forensic
   audit. They are not enforced by default because legitimate clients can
   roam between mobile/wifi mid-session, but the data is available.

## Receiving module integration

Drop-in handler for the module's landing route:

```ts
// On any incoming request to https://<your-module>/...
const token = new URL(req.url, 'http://x').searchParams.get('sso');
if (!token) return next();

const r = await fetch('https://operatoros.example.com/v1/modules/sso/consume', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ token, expectedAudience: 'your-module-slug' }),
});

if (!r.ok) {
  const err = await r.json();
  // Show a friendly "your launch link expired, please try again" page.
  return res.redirect(`https://operatoros.example.com/?launchError=${err.code}`);
}

const session = await r.json();
// session.user, session.planSlug, session.moduleSlug
// Issue your module's own session cookie here.
await loginUser(session.user, { source: 'operatoros-sso', plan: session.planSlug });
res.redirect('/dashboard');
```

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `MODULE_SSO_SECRET` | yes (prod) | Independent HS256 signing key. Falls back to `SESSION_SECRET` in dev. |
| `APP_ENV` | yes (prod) | `development` / `staging` / `production`. Embedded in token. |
| `OPERATOROS_BASE_URL` | yes (prod) | Used in launch URLs / docs. |
| `TRADEFLOWKIT_URL`, `TORQUESHED_URL`, ... | optional | Override default module `base_url`s without DB edits. |

## Operator UX

The operator hub at `/apps` shows every module with its access state:

- **Included** — granted by the user's plan
- **Add-on** — purchased separately
- **Granted** — admin override (positive)
- **Revoked** — admin override (negative)
- **Locked** — not entitled

Coming-soon modules render a disabled card. Disabled modules are not
launchable for anyone.

## Admin debug endpoint

`GET /v1/modules/debug/:slug?userId=<id>` (admin only) returns the full
breakdown: which layer (plan / addon / override) granted or denied
access. Useful for diagnosing "why can't this customer launch X?"
