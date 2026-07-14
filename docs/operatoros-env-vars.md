# OperatorOS Environment Variables

Authoritative list, grouped by surface. Booleans below indicate
"presence is enough"; anything marked _value-sensitive_ has semantic
meaning in code (e.g. `STRIPE_MODE=live`).

## Core

| Var                                      | Required        | Notes                                                                                                                                             |
| ---------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                           | yes             | Postgres connection string.                                                                                                                       |
| `SESSION_SECRET`                         | yes             | JWT signing secret.                                                                                                                               |
| `INTERNAL_API_URL`                       | yes (web prod)  | Server-only Fastify origin used by Next rewrites; use `http://localhost:5001` in the unified Replit workload.                                      |
| `NEXT_PUBLIC_API_URL`                    | mobile/split only | Public API origin for Capacitor or an intentionally separate API deployment; unified web clients use same-origin `/api/*`.                      |
| `OPERATOROS_BOOTSTRAP_SUPER_ADMIN_EMAIL` | optional        | Existing user email to re-assert as `super_admin`; does not replace explicit secure seed credentials.                                             |
| `ADMIN_EMAIL` / `ADMIN_NAME`             | optional        | Seed admin identity; email defaults to the shared root-admin constant and name defaults to `OperatorOS Admin`.                                     |
| `ADMIN_PASSWORD`                         | conditional     | Required from the secret manager only when production must create a missing seed admin; no embedded fallback. Minimum 12 characters.              |
| `DEMO_EMAIL` / `DEMO_PASSWORD`           | optional pair   | Optional demo seed. Creation is skipped unless an explicit `DEMO_PASSWORD` is supplied; no embedded fallback.                                      |
| `OPERATOROS_BASE_URL`                    | recommended     | Public base URL; used by invite accept links. Falls back to `INVITE_ACCEPT_BASE_URL` → `APP_BASE_URL` → `WEB_BASE_URL` → `http://localhost:3000`. |

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

## Canonical module host URLs

In the shared Replit runtime these are routing and launch targets for the
attached `*.operatoros.net` subdomains. They are not separate identity or SSO
authorities.

| Var                    | Module                | Internal fallback                                                                   |
| ---------------------- | --------------------- | ----------------------------------------------------------------------------------- |
| `BRANDFORGEOS_URL`     | brandforgeos          | falls back to `BF_OS_URL`                                                           |
| `BF_OS_URL`            | brandforgeos (legacy) | —                                                                                   |
| `CALLCOMMAND_AI_URL`   | callcommand-ai        | falls back to `/apps/callcommand-ai`                                                |
| `FAULTLINELAB_URL`     | faultlinelab          | —                                                                                   |
| `NINJAMATION_URL`      | ninjamation           | falls back to `/apps/ninjamation`                                                   |
| `PULSEDESK_URL`        | pulsedesk             | —                                                                                   |
| `SNAPPROOFOS_URL`      | snapproofos           | —                                                                                   |
| `TECHDECK_URL`         | techdeck              | —                                                                                   |
| `TORQUESHED_URL`       | torqueshed            | —                                                                                   |
| `TRADEFLOWKIT_URL`     | tradeflowkit          | —                                                                                   |
| `STUDYFORGE_AI_URL`    | studyforge-ai         | falls back to `/apps/studyforge-ai`                                                 |
| `NINJA_LAUNCH_KIT_URL` | ninja-launch-kit      | falls back to `/apps/ninja-launch-kit`                                              |
| `OUTCALL_URL`          | outcall               | canonical `https://outcall.operatoros.net`; module remains planned until activation |

## AI

| Var              | Notes                                     |
| ---------------- | ----------------------------------------- |
| `OPENAI_API_KEY` | optional; absence triggers mock provider. |

## CDE shell

| Var                     | Notes                                    |
| ----------------------- | ---------------------------------------- |
| `ALLOW_UNSAFE_COMMANDS` | `true` disables CDE denylist (dev only). |
