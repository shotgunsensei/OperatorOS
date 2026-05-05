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
  90 seconds.
- **No coupling to the user's session JWT.** A dedicated signing key
  (`MODULE_SSO_SECRET`) — independent from `SESSION_SECRET`.
- **Fail-closed.** Any unexpected state (env mismatch, expired token,
  user no longer entitled) results in denial.

## Handoff order (enforced)

The handoff endpoint applies these checks in this exact order. Earlier
gates short-circuit later ones, so the response code tells the caller
exactly which gate fired.

| # | Gate | Status | Code |
| - | --- | --- | --- |
| 1 | Per-user rate limit (10/min) | 429 | `RATE_LIMITED` |
| 2 | Module slug exists | 404 | — |
| 3 | **Entitlement check** (`hasModuleAccess`) | **403** | `MODULE_ACCESS_DENIED` |
| 4 | Module status `coming_soon` | 400 | `MODULE_COMING_SOON` |
| 5 | Module status `disabled` | 400 | `MODULE_DISABLED` |
| 6 | Module has no `base_url` | 400 | `NO_BASE_URL` |
| 7 | Token issuance failure | 500 | — |

The entitlement check is **strictly entitlement-only**: admin role,
override, addon, or plan inclusion. Module runtime status is **never**
folded into `hasModuleAccess` — that decision is gate #4–#6 and only
visible to entitled callers, so an unentitled probe cannot tell
`coming_soon` apart from `no entitlement`.

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
  "env": "prod",
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

**SSO fallback.** If `MODULE_SSO_SECRET` is not configured, the response
is still 200 but `token` is `null`, `launchUrl` is the bare module root
(no `?token=` segment), and `ssoFallback: true` plus a human-readable
`warning` field is returned. The Apps page surfaces this warning as an
admin-visible toast so the misconfiguration is loud rather than silent.

Rate-limited to 10 issuances per user per minute. Every reject path is
recorded in `admin_audit_logs` with the source IP, user id, and
structured details for forensic review.

### `POST /v1/modules/sso/consume` (no auth)

Called by the receiving module after it has validated the JWT signature.
The body identifies which token is being spent — OperatorOS is the
system of record for "has this jti been used yet".

Request:

```json
{ "jti": "1f2aac…", "aud": "tradeflowkit", "env": "prod" }
```

On success (200):

```json
{
  "ok": true,
  "user": { "id": "uuid", "email": "...", "name": "...", "role": "user" },
  "moduleSlug": "tradeflowkit",
  "planSlug": "elite",
  "organizationId": null,
  "env": "prod",
  "jti": "1f2aac…",
  "issuer": "https://operatoros.example.com",
  "accessSource": "plan"
}
```

#### Consume validation order (enforced)

| # | Check | Status | Code |
| - | --- | --- | --- |
| 1 | Per-IP rate limit (10/min) | 429 | `RATE_LIMITED` |
| 2 | `jti`, `aud`, `env` all present in body | 400 | `BAD_REQUEST` |
| 3 | `jti` row exists in `sso_handoff_tokens` | 404 | `TOKEN_UNKNOWN` |
| 4 | Stored `audience` equals body `aud` | 400 | `AUDIENCE_MISMATCH` |
| 5 | Stored `env` equals normalized body `env` | 400 | `ENV_MISMATCH` |
| 6 | `now < exp` | 410 | `TOKEN_EXPIRED` |
| 7 | Re-check `hasModuleAccess` (entitlement may have been revoked) | 410 | `TOKEN_EXPIRED` |
| 8 | `consumed_at IS NULL` (atomic UPDATE — single-use claim) | 409 | `TOKEN_REPLAYED` |
| 9 | IP-mismatch advisory (logged, not denied) | — | — |

Step 7 is performed **before** the atomic claim in step 8 — this is the
fail-closed contract: if entitlement was revoked between issue and
consume, the token is **not** burned and the user can simply re-launch
(the next `/handoff` call will surface the canonical 403
`MODULE_ACCESS_DENIED`). Returning 410 here keeps the consume status set
small and unambiguous: 410 means "this token is dead, ask for a new one".

Note: the receiver-supplied `env` value is normalized server-side
(`production` → `prod`, `staging` → `staging`, anything else → `dev`)
before comparing to the stored env, so legacy spellings work.

Every reject path is also written to `admin_audit_logs` with the
calling IP, attempted `jti`, and a reject-specific action key
(`sso_consume_unknown_jti`, `sso_consume_replay`, etc.). An IP-mismatch
between issue and consume is logged as `sso_consume_ip_mismatch_warning`
but **not** denied — many legitimate clients NAT through different
egress IPs between issue and consume.

## Token (JWT) shape

Algorithm: **HS256**, signed with `MODULE_SSO_SECRET`.

Claims:

| Claim | Description |
| --- | --- |
| `iss` | The OperatorOS base URL (`OPERATOROS_BASE_URL`) |
| `aud` | Module slug, e.g. `"tradeflowkit"` |
| `env` | One of `prod` / `staging` / `dev` |
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

## Receiving module — strict validation order

Every receiving module MUST run these checks in this exact sequence on
the inbound `?token=…` query before calling `/v1/modules/sso/consume`.
Earlier failures must short-circuit; later checks must not run if an
earlier check fails. Each gate maps to a redirect-back error code so
the hub can surface a useful message.

| # | Check | On failure |
| - | --- | --- |
| 1 | Token present in query (`?token=…`) | redirect with `launchError=no_token` |
| 2 | JWT signature valid (HS256, secret = `MODULE_SSO_SECRET`) | redirect with `launchError=bad_signature` |
| 3 | `iss` equals the configured OperatorOS base URL exactly | redirect with `launchError=bad_issuer` |
| 4 | `aud` equals this module's own slug exactly | redirect with `launchError=bad_audience` |
| 5 | `module_slug === aud` (defense-in-depth: claim self-consistency) | redirect with `launchError=bad_module_slug` |
| 6 | `env` equals normalize(local `APP_ENV`) (`production`→`prod`, `staging`→`staging`, else `dev`) | redirect with `launchError=env_mismatch` |
| 7 | `exp > now` (the JWT library will throw if not — treat as bad_token) | redirect with `launchError=token_expired` |
| 8 | `POST /v1/modules/sso/consume` returns 200 (the hub atomically marks `jti` spent and re-checks entitlement) | redirect with `launchError=<consume.code>` |
| 9 | Look up local user by `claims.email` (canonical key). If absent, provision a new local user from `{ email, name, role }`. Never trust `claims.sub` as a primary key in the destination DB — emails are the integration contract between hub and module. | continue to step 10 |
| 10 | Establish a local session for the resolved/provisioned user and redirect to the post-login destination. | — |

Notes:
- **The signature check (step 2) MUST come before any claim is read.**
  A claims-first read on an unverified token is a classic JWT bypass.
- **Steps 3–6 are claim-validity checks**, not authorization checks.
  Authorization is owned by the hub and re-checked at step 8.
- **Step 9 is integration policy.** Even though `sub` is a stable
  OperatorOS user id, modules SHOULD provision their local users by
  email so the hub can re-key the underlying user record without
  breaking sessions in every module.
- The library calls in the examples below intentionally combine steps
  2/4/7 (signature + audience + expiry) into a single `jwt.verify`
  call; the explicit checks for steps 3, 5, and 6 follow.

### Node / TypeScript

```ts
import jwt from 'jsonwebtoken';

const rawToken = new URL(req.url, 'http://x').searchParams.get('token');
if (!rawToken) return res.redirect('https://operatoros.example.com/?launchError=no_token');

const HUB = 'https://operatoros.example.com';
const MY_SLUG = 'your-module-slug';
const normalize = (v?: string) => {
  const x = (v || '').toLowerCase().trim();
  if (x === 'prod' || x === 'production') return 'prod';
  if (x === 'staging' || x === 'stage') return 'staging';
  return 'dev';
};

// 2 + 4 + 7: signature, audience, expiry (jwt.verify enforces all three).
let claims: any;
try {
  claims = jwt.verify(rawToken, process.env.MODULE_SSO_SECRET!, {
    algorithms: ['HS256'],
    audience: MY_SLUG,
  });
} catch (e: any) {
  const code = e?.name === 'TokenExpiredError' ? 'token_expired' : 'bad_signature';
  return res.redirect(`${HUB}/?launchError=${code}`);
}

// 3: iss must match the configured hub.
if (claims.iss !== HUB) return res.redirect(`${HUB}/?launchError=bad_issuer`);
// 5: claim self-consistency.
if (claims.module_slug !== claims.aud) return res.redirect(`${HUB}/?launchError=bad_module_slug`);
// 6: env binding.
if (claims.env !== normalize(process.env.APP_ENV)) {
  return res.redirect(`${HUB}/?launchError=env_mismatch`);
}

// 8: hub re-checks entitlement and atomically marks jti spent.
const r = await fetch(`${HUB}/v1/modules/sso/consume`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ jti: claims.jti, aud: claims.aud, env: claims.env }),
});
if (!r.ok) {
  const err = await r.json();
  return res.redirect(`${HUB}/?launchError=${err.code}`);
}
const session = await r.json();

// 9: resolve local user by EMAIL (provision if absent), never by sub.
const localUser =
  (await db.user.findByEmail(session.user.email)) ??
  (await db.user.create({
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
  }));

// 10: establish local session.
await loginUser(localUser, { source: 'operatoros-sso', plan: session.planSlug });
res.redirect('/dashboard');
```

### Python (Flask / FastAPI)

```python
import os, jwt, requests
from urllib.parse import quote

MODULE_SSO_SECRET = os.environ['MODULE_SSO_SECRET']
APP_ENV_RAW = os.environ.get('APP_ENV', '')
OPERATOROS = 'https://operatoros.example.com'

def normalize_env(v: str) -> str:
    x = (v or '').lower().strip()
    if x in ('prod', 'production'): return 'prod'
    if x in ('staging', 'stage'):   return 'staging'
    return 'dev'

APP_ENV = normalize_env(APP_ENV_RAW)

def handle_sso(request):
    raw = request.args.get('token')
    if not raw:
        return redirect(f'{OPERATOROS}/?launchError=no_token')

    MY_SLUG = 'your-module-slug'

    # 2 + 4 + 7: signature, audience, expiry
    try:
        claims = jwt.decode(
            raw, MODULE_SSO_SECRET,
            algorithms=['HS256'], audience=MY_SLUG,
        )
    except jwt.ExpiredSignatureError:
        return redirect(f'{OPERATOROS}/?launchError=token_expired')
    except jwt.PyJWTError:
        return redirect(f'{OPERATOROS}/?launchError=bad_signature')

    # 3: iss
    if claims.get('iss') != OPERATOROS:
        return redirect(f'{OPERATOROS}/?launchError=bad_issuer')
    # 5: claim self-consistency
    if claims.get('module_slug') != claims.get('aud'):
        return redirect(f'{OPERATOROS}/?launchError=bad_module_slug')
    # 6: env binding
    if claims.get('env') != APP_ENV:
        return redirect(f'{OPERATOROS}/?launchError=env_mismatch')

    # 8: consume (hub atomically marks jti spent and re-checks entitlement)
    r = requests.post(f'{OPERATOROS}/v1/modules/sso/consume', json={
        'jti': claims['jti'], 'aud': claims['aud'], 'env': claims['env'],
    }, timeout=10)
    if not r.ok:
        code = r.json().get('code', 'unknown')
        return redirect(f'{OPERATOROS}/?launchError={quote(code)}')
    session = r.json()

    # 9: resolve/provision local user by EMAIL (never by sub).
    email = session['user']['email']
    local_user = User.query.filter_by(email=email).first() or User.create(
        email=email, name=session['user']['name'], role=session['user']['role'],
    )

    # 10: establish local session
    login_user(local_user, source='operatoros-sso', plan=session['planSlug'])
    return redirect('/dashboard')
```

## Admin endpoints

Override management lives under `/v1/modules/admin/*`:

| Endpoint | Body | Effect |
| --- | --- | --- |
| `POST /v1/modules/admin/grant` | `{ user_id, module_slug, reason?, expires_at? }` | Insert `entitlement_overrides` row with `grant=true` |
| `POST /v1/modules/admin/revoke` | `{ user_id, module_slug, reason? }` | Insert `entitlement_overrides` row with `grant=false` (revoke wins over plan/addon) |
| `GET  /v1/modules/admin/all` | — | Catalog with plan inclusions for admin UI |
| `PATCH /v1/modules/admin/:slug` | partial module fields | Update name/baseUrl/status/etc. |

All four require `role='admin'` and write `admin_audit_logs` rows.

## Security properties

1. **Single-use.** `consume` performs an atomic
   `UPDATE … WHERE consumed_at IS NULL`. Race losers get `TOKEN_REPLAYED`.
2. **Short TTL.** 90 s window between issue and consume.
3. **Env binding.** A token issued in `dev` cannot consume in `prod`.
4. **Audience binding.** A token issued for TorqueShed cannot be
   redeemed by TradeFlowKit.
5. **Re-check at consume.** Even with a valid token, OperatorOS
   re-checks entitlement at consume-time, **before** the single-use
   claim, so a revoked user cannot consume but the token is also not
   burned by the deny.
6. **Separate signing key.** `MODULE_SSO_SECRET` is independent of
   `SESSION_SECRET`.
7. **Per-user issue rate limit.** 10 handoffs/minute/user.
8. **Per-IP consume rate limit.** 10 consumes/minute/source-IP.
9. **IP captured.** `issued_ip` and `consumed_ip` are stored for
   forensic audit. Mismatches are logged but not enforced.
10. **Audit-logged reject paths.** Every 4xx response on handoff or
    consume writes an `admin_audit_logs` row.

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `MODULE_SSO_SECRET` | strongly recommended | Independent HS256 signing key (≥16 chars). When missing, OperatorOS issues unsigned launch URLs and surfaces an admin warning toast — usable in dev, loud in prod. |
| `APP_ENV` | yes | Normalized to `prod` / `staging` / `dev`. Embedded in token. |
| `OPERATOROS_BASE_URL` | yes (prod) | Used as the JWT `iss` claim and in launch URLs. |
| `TRADEFLOWKIT_URL`, `TORQUESHED_URL`, … | optional | Override default module `base_url`s without DB edits. |

## Operator UX

The operator hub at `/apps` shows every module with its access state.
The page consumes server-resolved fields directly — no client-side
entitlement compute is permitted:

| Field | Meaning |
| --- | --- |
| `unlocked` | `hasAccess && status === 'live' && !!base_url` (server-computed) |
| `access_source` | One of `plan` / `addon` / `override` / `admin_role` / `null` |
| `cta` | One of `open` / `buy_addon` / `upgrade` / `coming_soon` / `disabled` |
| `upgrade_target_plan` | Smallest plan slug that grants the module via plan inclusion |
| `addon_price_cents` | Per-module addon price (from `modules.metadata.addonPriceCents`) |

Source badge labels: **Included** (plan), **Add-on**, **Granted**
(override), **Admin** (`admin_role` superadmin allow), **Locked** (no
entitlement). Coming-soon and disabled modules render their respective
non-launchable buttons.

## Admin debug endpoints

- `GET /v1/modules/debug?user_id=…` — full per-module access breakdown
  for the calling user (admin can target another user via `user_id`;
  non-admin attempts to target another user return **403 FORBIDDEN**).
- `GET /v1/modules/debug/:slug?user_id=…` — same, scoped to one module.

The aggregate response is snake_cased and contract-stable:

```json
{
  "user_id": "uuid",
  "plan": "elite",
  "is_admin": false,
  "plan_modules": ["tradeflowkit", "torqueshed", "..."],
  "addon_modules": ["bf-os"],
  "overrides": ["snapproofos"],
  "override_revokes": [],
  "effective_access": ["tradeflowkit", "torqueshed", "bf-os", "snapproofos"],
  "access_sources": { "tradeflowkit": "plan", "snapproofos": "override", "...": null },
  "env": "prod",
  "sso_fallback": false
}
```

## Addon billing DLQ

Addon Stripe webhooks (`metadata.kind === 'addon'`) flow through
`processAddonWebhookEvent`. Every successfully handled event records a
row in `billing_events` with `processed_at` set; failures record a row
with `error_message` set and the **raw event payload persisted in
`metadata.rawEvent`**.

`POST /v1/admin/billing/events/:eventId/retry` is the canonical replay
endpoint — it reads `metadata.rawEvent` and re-runs
`processAddonWebhookEvent` against it. The processor's idempotency
check on `stripe_event_id` makes repeat retries safe (subsequent runs
return `duplicate_ignored`). Legacy rows that lack a captured
`rawEvent` degrade to a "mark resolved" forensic acknowledgement. The
prior path `POST /v1/admin/billing-events/:id/retry` is kept as a
transitional alias.
