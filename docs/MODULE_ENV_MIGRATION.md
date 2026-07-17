# OperatorOS Module Environment Migration

Status: names-only production configuration guide. Never commit or paste live
secret values into the repository, logs, screenshots, or Codex messages.

## Unified runtime baseline

Configure these in the single Replit published app's **Publishing → Edit
Commands and Secrets** environment:

| Name | Requirement |
| --- | --- |
| `DATABASE_URL` | OperatorOS PostgreSQL connection; test against an isolated database before production migration |
| `SESSION_SECRET` | High-entropy host-session signing secret |
| `SSO_CODE_ENCRYPTION_SECRET` | Independent 32+ character hub-only one-time-code key |
| `NODE_ENV` / `APP_ENV` | `production` / `production` |
| `OPERATOROS_BASE_URL` | `https://operatoros.net` |
| `INTERNAL_API_URL` | Internal Fastify URL used by the Next proxy |
| `TRUST_PROXY` | `true` only behind Replit's managed proxy |
| `ALLOW_LEGACY_SSO_ROLLBACK` | absent or `false` |
| Thirteen canonical module URL variables | Exact `*.operatoros.net` values from `docs/operatoros-env-vars.md`, including disabled OutCall's controlled host |

Stripe platform price IDs and webhook secrets remain OperatorOS-owned. Use the
existing `STRIPE_PRICE_ADDON_<MODULE>` convention only for purchasable add-ons;
the three free modules and core bundle modules are not sold as add-ons.

Before release, run the names-only preflight inside the production Replit
environment. It never prints configured values:

```powershell
corepack pnpm preflight:production --all
```

Use individual readiness flags while configuring providers:
`--revenue-ready`, `--email-ready`, `--callcommand-ready`, and `--ai-ready`.
With no flag, the command validates only the core runtime/security authority.

## Do not copy from child projects

Do not migrate these standalone authority/config values into the unified
runtime merely because they existed in a child repository:

- `MODULE_SSO_SECRET`, child SSO audiences/consume URLs, or copied client
  signing secrets
- child `SESSION_SECRET` values or parent-domain cookie settings
- Clerk/Replit OIDC/local-password identity configuration
- child Stripe checkout/webhook/subscription secrets or demo-upgrade flags
- child `DATABASE_URL` values or generic child migrations
- `OPERATOROS_SERVICE_TOKEN` for an in-process module
- local admin-email allowlists, demo passwords, E2E bypass tokens, or
  `DEV_AUTH_BYPASS`/guest-mode flags
- `.replit`, `.env*`, key/certificate, service-account, or credential files

The snapshot importer excludes these files. Imported source code may still
mention retired variable names for audit; that does not make them deployment
requirements.

## Active shared-runtime providers

These integrations are already read by active OperatorOS-owned code. Configure
one shared runtime value per row; do not copy each child project's old secret.

| Capability | Production configuration | Release behavior when absent |
| --- | --- |
| OperatorOS billing | `STRIPE_MODE=live`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the five shared stack Price IDs documented in `docs/stripe-setup.md` | Checkout fails closed; no fake subscription or entitlement is granted |
| Transactional invites | `RESEND_API_KEY` plus `EMAIL_FROM` (or `INVITE_FROM_EMAIL`) | Messages use the log provider; that is not production delivery |
| Shared AI features | `OPENAI_API_KEY` | Supported surfaces use their explicit mock/fallback behavior; do not market live AI until configured |
| CallCommand outbound calling | A bound Replit Twilio connector or `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER`; always set `TWILIO_PUBLIC_BASE_URL=https://callcommand-ai.operatoros.net` | Calls stay unavailable/log-only; no call is represented as placed |

Stripe add-on price variables are needed only for a module sold through the
legacy individual add-on checkout. The current stack configurator uses
`STRIPE_PRICE_COMPANION_MODULE_MONTHLY` for paid companion quantity; do not
invent one Price per module unless the catalog intentionally exposes that
purchase path.

## Provider families not yet ported

The imported snapshots still mention providers that the executable shared
runtime does not use. Do **not** migrate these solely because a child repository
had them: TradeFlowKit SendGrid/Stripe Connect, TechDeck SMTP/uploads, PulseDesk
inbox OAuth or SendGrid/Mailgun, FaultlineLab storage, SnapProofOS export
storage, Ninja Launch Kit Anthropic, and standalone CallCommand object storage.
Each requires a tenant-scoped vertical slice, retention rules, audit coverage,
and an explicit active-runtime environment contract first.

Ninja Pool Hall currently needs no external provider for its local Free Shoot
workflow. Ninjamation has no additional canonical provider contract. OutCall
remains planned/disabled; do not provision its Twilio, worker, or billing
secrets until activation is approved and tested.

Provider values must be module-scoped where active code defines scoped names;
never invent a new production variable or silently reuse another module's key.

## Pre-release credential actions

1. Rotate the historical seeded admin/demo credentials with:

   ```powershell
   corepack pnpm --dir apps/api security:rotate-seed-credentials
   ```

   Supply `ADMIN_PASSWORD` and optional `DEMO_PASSWORD` only through the
   deployment secret environment for that one operation; verify old passwords
   fail, then remove the rotation values.
2. Confirm `/readyz` reports the code-sealing and session prerequisites ready.
3. Keep every imported standalone migration disabled. Only OperatorOS
   namespaced DDL may run against the shared database.
4. Complete the DB-backed and authenticated browser gates in
   `docs/auth/VALIDATION_MATRIX.md` before enabling the release.
