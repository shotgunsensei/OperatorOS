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
  "token": "<jwt or null>",
  "launchUrl": "https://tradeflowkit.com/sso?token=<jwt>",
  "expiresIn": 90,
  "moduleSlug": "tradeflowkit",
  "env": "production",
  "issuer": "https://operatoros.example.com",
  "jti": "1f2aac…",
  "ssoFallback": false,
  "warning": null
}
```

The hub opens `launchUrl` in a new tab. The receiving module reads
`?token=…` from the query string, **verifies the JWT signature itself
using the shared `MODULE_SSO_SECRET`**, and then calls
`POST /v1/modules/sso/consume` with the token's `jti`, `aud`, and `env`
to atomically mark it spent.

**SSO fallback.** If `MODULE_SSO_SECRET` is not configured on
OperatorOS, the response is still 200 but `token` is `null`,
`launchUrl` is the bare module root (no `?token=` segment), and
`ssoFallback: true` plus a human-readable `warning` field is returned.
The Apps page surfaces this warning as an admin-visible toast so the
misconfiguration is loud rather than silent. This keeps the platform
usable in dev / first-boot at the cost of an unsigned handoff.

Rate-limited to 10 issuances per user per minute. Returns:

- `403 MODULE_ACCESS_DENIED` — user has no entitlement
- `403 MODULE_DISABLED` — module is disabled
- `409 MODULE_COMING_SOON` — module is not yet launchable
- `409 NO_BASE_URL` — module has no `base_url` configured
- `429 RATE_LIMITED` — too many launches

Every reject path is recorded in `admin_audit_logs` with the source IP,
user id, and structured details for forensic review.

### `POST /v1/modules/sso/consume` (no auth)

Called by the receiving module after it has validated the JWT signature
on its end. The body identifies which token is being spent — OperatorOS
is the system of record for "has this jti been used yet".

Request:

```json
{
  "jti": "1f2aac…",
  "aud": "tradeflowkit",
  "env": "production"
}
```

On success (200):

```json
{
  "ok": true,
  "user": { "id": "uuid", "email": "...", "name": "...", "role": "user" },
  "moduleSlug": "tradeflowkit",
  "planSlug": "elite",
  "organizationId": null,
  "env": "production",
  "jti": "1f2aac…",
  "issuer": "https://operatoros.example.com",
  "accessSource": "plan"
}
```

Errors:

| Code | HTTP | Meaning |
| --- | --- | --- |
| `BAD_REQUEST` | 400 | `jti`, `aud`, or `env` missing from body |
| `AUDIENCE_MISMATCH` | 400 | Stored `audience` for this jti does not match request `aud` |
| `ENV_MISMATCH` | 400 | Stored `env` for this jti does not match request `env` |
| `TOKEN_UNKNOWN` | 404 | jti not found (forged, never issued, or already cleaned up) |
| `MODULE_ACCESS_REVOKED` | 403 | User lost entitlement between issue and consume |
| `TOKEN_EXPIRED` | 410 | Past `exp` |
| `TOKEN_REPLAYED` | 409 | Already consumed once |
| `RATE_LIMITED` | 429 | More than 10 consume requests from this source IP per minute |

The receiver is expected to verify the JWT signature with
`MODULE_SSO_SECRET` **before** calling `consume`. The signature check
proves the token came from OperatorOS; the consume call proves it has
not yet been spent.

Every reject path here is also written to `admin_audit_logs` with the
calling IP, attempted `jti`, and a reject-specific action key
(`sso_consume_unknown_jti`, `sso_consume_replay`, etc.). An IP-mismatch
between issue and consume is logged as
`sso_consume_ip_mismatch_warning` but **not** denied — many legitimate
clients NAT through different egress IPs between issue and consume.

## Token (JWT) shape

Algorithm: **HS256**, signed with `MODULE_SSO_SECRET`.

Claims:

| Claim | Description |
| --- | --- |
| `iss` | The OperatorOS base URL (`OPERATOROS_BASE_URL`), e.g. `https://operatoros.example.com` |
| `aud` | Module slug, e.g. `"tradeflowkit"` |
| `env` | `development` / `staging` / `production` (from `APP_ENV`) |
| `sub` | OperatorOS user UUID (standard claim) |
| `user_id` | Same as `sub`, for receiver convenience |
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
   by TradeFlowKit (the `aud` recorded at issue must match the `aud`
   passed to `consume`).
5. **Re-check at consume.** Even with a valid token, OperatorOS re-checks
   entitlement at consume-time. If the user was downgraded between
   issue and consume, access is denied (`MODULE_ACCESS_REVOKED`).
6. **Separate signing key.** `MODULE_SSO_SECRET` is independent of
   `SESSION_SECRET`. Compromise of the module SSO key does not let an
   attacker mint regular session JWTs.
7. **Per-user issue rate limit.** 10 handoffs/minute/user.
8. **Per-IP consume rate limit.** 10 consumes/minute/source-IP — defends
   against jti enumeration / scanning.
9. **IP captured.** `issued_ip` and `consumed_ip` are stored for
   forensic audit. Mismatches are logged but not enforced (mobile
   roaming false-positives).
10. **Audit-logged reject paths.** Every 4xx response on handoff or
    consume writes an `admin_audit_logs` row.

## Receiving module integration

Drop-in handler for the module's landing route at `/sso`:

```ts
import jwt from 'jsonwebtoken';

// Inside your /sso handler
const rawToken = new URL(req.url, 'http://x').searchParams.get('token');
if (!rawToken) return res.redirect('https://operatoros.example.com/?launchError=no_token');

let claims: any;
try {
  claims = jwt.verify(rawToken, process.env.MODULE_SSO_SECRET!, {
    algorithms: ['HS256'],
    audience: 'your-module-slug',
  });
} catch (e) {
  return res.redirect('https://operatoros.example.com/?launchError=bad_token');
}

if (claims.env !== process.env.APP_ENV) {
  return res.redirect('https://operatoros.example.com/?launchError=env_mismatch');
}

const r = await fetch('https://operatoros.example.com/v1/modules/sso/consume', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ jti: claims.jti, aud: claims.aud, env: claims.env }),
});

if (!r.ok) {
  const err = await r.json();
  return res.redirect(`https://operatoros.example.com/?launchError=${err.code}`);
}

const session = await r.json();
// session.user, session.planSlug, session.moduleSlug, session.accessSource
await loginUser(session.user, { source: 'operatoros-sso', plan: session.planSlug });
res.redirect('/dashboard');
```

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `MODULE_SSO_SECRET` | strongly recommended | Independent HS256 signing key (≥16 chars). When missing, OperatorOS issues unsigned launch URLs and surfaces an admin warning toast — usable in dev, loud in prod. |
| `APP_ENV` | yes | `development` / `staging` / `production`. Embedded in token. |
| `OPERATOROS_BASE_URL` | yes (prod) | Used as the JWT `iss` claim and in launch URLs. |
| `TRADEFLOWKIT_URL`, `TORQUESHED_URL`, … | optional | Override default module `base_url`s without DB edits (read by `saas-db-init`). |

## Operator UX

The operator hub at `/apps` shows every module with its access state.
The page consumes server-resolved fields directly — no client-side
entitlement compute is permitted:

| Field | Source | Meaning |
| --- | --- | --- |
| `unlocked` | server | Whether the user can launch this module right now |
| `access_source` | server | One of `plan` / `addon` / `override` / `admin_role` / `null` |
| `cta` | server | One of `launch` / `subscribe_addon` / `upgrade` / `coming_soon` / `disabled` |
| `upgrade_target_plan` | server | Smallest plan slug that grants the module via plan inclusion |
| `addon_price_cents` | server | Per-module addon price (from `modules.metadata.addonPriceCents`) |

Source badge labels: **Included** (plan), **Add-on**, **Granted**
(override), **Admin** (`admin_role` superadmin allow), **Locked** (no
entitlement). Coming-soon and disabled modules render their respective
non-launchable buttons.

## Admin debug endpoints

- `GET /v1/modules/debug` — full per-module access breakdown for the
  calling user (admin can target another user via `?userId=`).
- `GET /v1/modules/debug/:slug` — same, scoped to one module. Each
  breakdown returns `planGrants`, `addonGrants`, `overrideGrants`,
  `isAdmin`, `moduleStatus`, `finalSource`, and `reason` so you can
  answer "why can't this customer launch X?" in one call.

## Addon billing DLQ

Addon Stripe webhooks (`metadata.kind === 'addon'`) flow through
`processAddonWebhookEvent`. Every successfully handled event records a
row in `billing_events` with `processed_at` set; failures record a row
with `error_message` set and the **raw event payload persisted in
`metadata.rawEvent`**.

`POST /v1/admin/billing-events/:id/retry` is a true replay — it reads
`metadata.rawEvent` and re-runs `processAddonWebhookEvent` against it.
The processor's idempotency check on `stripe_event_id` makes repeat
retries safe (subsequent runs return `duplicate_ignored`). Legacy rows
that lack a captured `rawEvent` degrade to a "mark resolved" forensic
acknowledgement.
