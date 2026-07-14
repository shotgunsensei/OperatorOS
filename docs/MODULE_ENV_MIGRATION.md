# OperatorOS Module Environment Migration

Status: names-only production configuration guide. Never commit or paste live
secret values into the repository, logs, screenshots, or Codex messages.

## Unified runtime baseline

Configure these in the single Replit deployment secret/config manager:

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

Stripe platform price IDs and webhook secrets remain OperatorOS-owned. Use the
existing `STRIPE_PRICE_ADDON_<MODULE>` convention only for purchasable add-ons;
the three free modules and core bundle modules are not sold as add-ons.

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

## Feature-provider secrets

Copy a provider secret only after its corresponding workflow is ported behind
OperatorOS tenant/module gates and the active shared-runtime code explicitly
reads that name. Current source inventories indicate these future integration
families:

| Module | Provider families to reconcile when ported |
| --- | --- |
| TradeFlowKit | OpenAI, SendGrid, Twilio, and reviewed Stripe Connect/invoice-payment behavior |
| TechDeck | OpenAI-compatible AI, SMTP, and bounded upload configuration |
| PulseDesk | Microsoft/Google inbox OAuth, SendGrid/Mailgun, and Twilio notifications; keep PHI out of unsafe channels/logs |
| TorqueShed | Mobile public URLs/association metadata; calculate browser origins from the central registry |
| FaultlineLab | Resend and object storage; remove Clerk, guest bypass, and child Stripe first |
| Ninja Pool Hall | No provider secret needed for offline/local play; online rooms require authenticated WebSocket infrastructure |
| BrandForgeOS | OpenAI-compatible generation after tenant/usage gates exist |
| SnapProofOS | Storage/export providers only after organization-to-tenant isolation is proven |
| StudyForge AI | AI generation after tenant-scoped sets/progress are ported; child Stripe is retired |
| Ninja Launch Kit | Anthropic-compatible generation after launch-kit product alignment; child Stripe is retired |
| CallCommand AI | Twilio, OpenAI, and object storage after tenant-aware telephony, signature, retention, and usage controls exist |
| Ninjamation | No additional canonical source/config observed yet |
| OutCall | Planned; do not provision Twilio or worker secrets until the workload is approved |

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

