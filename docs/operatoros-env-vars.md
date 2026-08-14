# OperatorOS Environment Variables

Human-readable list, grouped by surface. The machine-readable production
authority is `config/production-environment.contract.json`; this document must
not override it. Booleans below indicate
"presence is enough"; anything marked _value-sensitive_ has semantic
meaning in code (e.g. `STRIPE_MODE=live`).

## Core

| Var                                      | Required        | Notes                                                                                                                                             |
| ---------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                           | yes             | Postgres connection string.                                                                                                                       |
| `DATABASE_POOL_MAX`                      | no              | Bounded API pool size, default `10`, allowed `1..50`. Invalid values fail startup.                                                                |
| `DATABASE_POOL_IDLE_TIMEOUT_MS`          | no              | Idle connection timeout, default `30000`, allowed `1000..300000`.                                                                                |
| `DATABASE_POOL_CONNECTION_TIMEOUT_MS`    | no              | Connection acquisition timeout, default `10000`, allowed `1000..60000`.                                                                          |
| `SESSION_SECRET`                         | yes             | JWT signing secret.                                                                                                                               |
| `SSO_CODE_ENCRYPTION_SECRET`             | yes             | Independent high-entropy 32+ character hub-only key used to seal one-time browser authorization codes.                                           |
| `INTERNAL_API_URL`                       | yes (web prod)  | Server-only Fastify origin used by Next rewrites; use `http://localhost:5001` in the unified Replit workload.                                      |
| `NEXT_PUBLIC_API_URL`                    | mobile/split only | Public API origin for Capacitor or an intentionally separate API deployment; unified web clients use same-origin `/api/*`.                      |
| `PORT` / `API_PORT`                      | yes (unified prod) | Public Next port `5000` and private Fastify port `5001`; the supervisor rejects equal values.                                                    |
| `OPERATOROS_BOOTSTRAP_SUPER_ADMIN_EMAIL` | optional        | Existing user email to re-assert as `super_admin`; does not replace explicit secure seed credentials.                                             |
| `ADMIN_EMAIL` / `ADMIN_NAME`             | optional        | Seed admin identity; email defaults to the shared root-admin constant and name defaults to `OperatorOS Admin`.                                     |
| `ADMIN_PASSWORD`                         | conditional     | Required from the secret manager only when production must create a missing seed admin; no embedded fallback. Minimum 12 characters.              |
| `DEMO_EMAIL` / `DEMO_PASSWORD`           | optional pair   | Optional demo seed. Creation is skipped unless an explicit `DEMO_PASSWORD` is supplied; no embedded fallback.                                      |
| `OPERATOROS_BASE_URL`                    | yes (prod)      | Must equal `https://operatoros.net` in production; development-only fallbacks remain for local execution.                                         |
| `OPERATOROS_APPS_URL`                    | yes (prod)      | Must equal `https://app.operatoros.net/`; modules use this external launcher rather than a relative `/app`.                                        |
| `APP_ENV` / `NODE_ENV`                   | yes (prod)      | Both must equal `production` for the published release.                                                                                           |
| `TRUST_PROXY`                            | yes (Replit)    | Set to `true` only behind Replit's managed deployment proxy.                                                                                      |
| `OPERATOROS_DATABASE_RELEASE_MODE`       | yes (prod)      | Must equal `apply`; authorizes the reviewed idempotent database release before API startup.                                                        |
| `OPERATOROS_DATABASE_RELEASE_APPLIED`    | never external  | Supervisor-owned child-process marker. Do not configure it in Replit or a secret manager.                                                         |
| `ALLOW_LEGACY_SSO_ROLLBACK`              | no              | Must be absent or `false` for the production SSO v1 release.                                                                                      |
| `MODULE_SSO_SECRET`                      | legacy only     | Not used by SSO v1; remove unless an explicitly approved rollback still requires it.                                                              |
| `CORS_ALLOWED_ORIGINS`                   | optional        | Comma-separated exact HTTPS origins only; no wildcard, credentials, path, HTTP, or loopback production values.                                    |

## Email (Resend)

| Var                 | Required       | Notes                                                            |
| ------------------- | -------------- | ---------------------------------------------------------------- |
| `RESEND_API_KEY`    | for prod email | Presence triggers Resend provider; absent ⇒ log provider.        |
| `EMAIL_FROM`        | recommended    | Primary FROM address (e.g. `OperatorOS <hello@operatoros.net>`). |
| `INVITE_FROM_EMAIL` | optional       | Fallback FROM for invites if `EMAIL_FROM` is absent.             |

## Stripe (plans)

`STRIPE_MODE=live` is required to actually call Stripe; anything else
keeps billing in local mode.

| Var                                     | Notes                                                             |
| --------------------------------------- | ----------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`                     | live secret key.                                                  |
| `STRIPE_WEBHOOK_SECRET`                 | webhook signing secret.                                           |
| `STRIPE_PRICE_TRADEFLOWKIT_MONTHLY`     | TradeFlowKit recurring monthly Price.                             |
| `STRIPE_PRICE_PULSEDESK_MONTHLY`        | PulseDesk recurring monthly Price.                                |
| `STRIPE_PRICE_TECHDECK_MONTHLY`         | TechDeck recurring monthly Price.                                 |
| `STRIPE_PRICE_COMPANION_MODULE_MONTHLY` | Shared recurring Price for each paid companion module.            |
| `STRIPE_PRICE_ADDITIONAL_SEAT_MONTHLY`  | Recurring Price for each additional operator seat.                |
| `ADDITIONAL_SEAT_PRICE_CENTS`           | Display/config amount for an additional seat; defaults to `1500`. |

Resolution order for a plan: `STRIPE_PRICE_<PLAN>_<INTERVAL>` →
`STRIPE_PRICE_<PLAN>` (only if interval is monthly). Annual checkout
without an annual env throws `NO_STRIPE_PRICE_FOR_INTERVAL`.

## Stripe (module add-ons)

Pattern: `STRIPE_PRICE_ADDON_<UPPER_SNAKE_SLUG>`. Add-on lookup falls
back across known slug aliases:

| Module slug    | Primary                           | Fallback                   |
| -------------- | --------------------------------- | -------------------------- |
| `brandforgeos` | `STRIPE_PRICE_ADDON_BRANDFORGEOS` | `STRIPE_PRICE_ADDON_BF_OS` |

All other modules use the canonical `STRIPE_PRICE_ADDON_<SLUG>` form
only. See `apps/api/src/lib/billing-service.ts:stripeAddonEnvKey`.

## TradeFlowKit public intake and business payments

TradeFlowKit customer payments are direct charges on a tenant-connected Stripe
account. They remain separate from OperatorOS plan/add-on billing and never
grant entitlements. Leave `TRADEFLOWKIT_PAYMENT_PROVIDER` unset to keep this
feature disabled.

| Var | Required | Notes |
| --- | --- | --- |
| `TRADEFLOWKIT_PUBLIC_INTAKE_HMAC_SECRET` | public intake | Server-only 32+ byte key used for rate-limit fingerprints and per-adapter HMAC secrets; raw client IPs are not stored. |
| `TRADEFLOWKIT_PAYMENT_PROVIDER` | business payments | Must equal `stripe_connect`; any other value fails closed. |
| `STRIPE_CLIENT_ID` | Stripe Connect | Connect platform client ID (`ca_...`) used for Standard-account OAuth. |
| `TRADEFLOWKIT_STRIPE_CONNECT_WEBHOOK_SECRET` | Stripe Connect | Signing secret for the separate connected-account Checkout webhook. Never reuse `STRIPE_WEBHOOK_SECRET`. |
| `TRADEFLOWKIT_STRIPE_CONNECT_REDIRECT_URI` | Stripe Connect | Exact `https://tradeflowkit.operatoros.net/v1/modules/tradeflowkit/payments/connect/callback`. |
| `TRADEFLOWKIT_PUBLIC_BASE_URL` | business payments | Exact `https://tradeflowkit.operatoros.net` origin used only for Checkout success/cancel returns. |

The Connect integration also uses `STRIPE_SECRET_KEY` and `STRIPE_MODE`; the
key, connected account, webhook event, and configured mode must all agree on
test versus live. OAuth access/refresh tokens are deliberately not persisted.

## Canonical module host URLs

In the shared Replit runtime these are routing and launch targets for the
attached `*.operatoros.net` subdomains. They are not separate identity or SSO
authorities. The internal fallbacks below are development compatibility only;
production preflight requires every exact canonical URL.

| Var                    | Module                | Internal fallback                                                                   |
| ---------------------- | --------------------- | ----------------------------------------------------------------------------------- |
| `BRANDFORGEOS_URL`     | brandforgeos          | falls back to `BF_OS_URL`                                                           |
| `BF_OS_URL`            | brandforgeos (legacy) | —                                                                                   |
| `CALLCOMMAND_AI_URL`   | callcommand-ai        | falls back to `/apps/callcommand-ai`                                                |
| `FAULTLINELAB_URL`     | faultlinelab          | —                                                                                   |
| `NINJA_POOL_HALL_URL`  | ninja-pool-hall       | —                                                                                   |
| `NINJAMATION_URL`      | ninjamation           | falls back to `/apps/ninjamation`                                                   |
| `PULSEDESK_URL`        | pulsedesk             | —                                                                                   |
| `SNAPPROOFOS_URL`      | snapproofos           | —                                                                                   |
| `TECHDECK_URL`         | techdeck              | —                                                                                   |
| `TORQUESHED_URL`       | torqueshed            | —                                                                                   |
| `TRADEFLOWKIT_URL`     | tradeflowkit          | —                                                                                   |
| `STUDYFORGE_AI_URL`    | studyforge-ai         | falls back to `/apps/studyforge-ai`                                                 |
| `NINJA_LAUNCH_KIT_URL` | ninja-launch-kit      | falls back to `/apps/ninja-launch-kit`                                              |
| `OUTCALL_URL`          | outcall               | canonical `https://outcall.operatoros.net`; live provider readiness is separate |

## AI

| Var              | Notes                                     |
| ---------------- | ----------------------------------------- |
| `OPENAI_API_KEY` | optional; absence triggers mock provider. |

## CallCommand telephony

Outbound calls require either a bound Replit Twilio connector or all three
credential variables below. The public base URL is required for both modes so
Twilio webhook signature validation uses the exact canonical host. Do not use
the legacy generic `APP_URL` in production.

| Var | Required | Notes |
| --- | --- | --- |
| `TWILIO_ACCOUNT_SID` | env mode | Server-only Twilio Account SID. |
| `TWILIO_AUTH_TOKEN` | env mode | Server-only credential and webhook-signature key. |
| `TWILIO_FROM_NUMBER` | env mode | Approved outbound E.164 number. |
| `TWILIO_PUBLIC_BASE_URL` | yes for live calls | Must be `https://callcommand-ai.operatoros.net`. |

Use `corepack pnpm preflight:production --all` in the production environment
to validate the core, revenue, email, telephony, and AI configuration without
printing secret values. Core validation requires every canonical module URL
above to equal its exact `*.operatoros.net` origin, including OutCall's
controlled host. Individual provider readiness flags are documented in
`docs/MODULE_ENV_MIGRATION.md`.

## CDE shell

| Var                     | Notes                                    |
| ----------------------- | ---------------------------------------- |
| `ALLOW_UNSAFE_COMMANDS` | `true` disables CDE denylist (dev only). |
