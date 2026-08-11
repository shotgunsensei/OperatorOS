# TorqueShed production deployment

This application is a Node.js/Express service that serves the built Vite SPA and connects to PostgreSQL. It is not a static landing-page deployment.

## Required infrastructure

- Node.js 24 and pnpm from Corepack.
- PostgreSQL 16 or a compatible managed PostgreSQL service with TLS configured as required by the provider.
- A public HTTPS origin for `https://torqueshed.pro`.
- OperatorOS registration for module ID/slug `torqueshed` and launch URL `https://torqueshed.pro/sso`.
- Stripe Checkout and webhook secrets if token purchases are enabled.
- A server-only OpenAI API key if Torque Assist is enabled.
- Durable object storage plus an upload/presign adapter before photo and document bytes are enabled. The current `/api/attachments` route stores validated metadata only.

## Build and release order

1. Copy `.env.example` into the deployment secret/configuration system. Never commit populated secrets.
2. Run `corepack pnpm install --frozen-lockfile`.
3. Run `corepack pnpm run typecheck`.
4. Run `corepack pnpm run build`.
5. Back up the production database.
6. Run `corepack pnpm run db:migrate` with the production `DATABASE_URL`.
7. Start `artifacts/api-server/dist/index.mjs` with `PORT` set by the host.
8. Verify `GET /api/healthz`, OperatorOS launch, session cookie issuance, and `/api/auth/me`.

The generated migration is in `lib/db/drizzle/`. Schema generation uses the real `src/schema/*.ts` files so drift is detected.

## OperatorOS

Set `OPERATOROS_API_URL`, `OPERATOROS_APP_URL`, and `OPERATOROS_AUTH_URL`. OperatorOS must expose `POST /v1/sso/consume` and atomically validate/consume the one-time launch JTI. TorqueShed does not decode the launch JWT locally and never accepts browser-provided user, tenant, role, or entitlement claims.

Logout revokes the local opaque session and returns `${OPERATOROS_APP_URL}/app`. OperatorOS remains the credential, tenant, and entitlement authority.

## Torque Assist

Set `OPENAI_API_KEY` and optionally `OPENAI_MODEL` (default `gpt-5-mini`). The key is read only by the API service. `TORQUE_ASSIST_ADAPTER=test` is available for automated tests and is rejected when `NODE_ENV=production`.

Each successful analysis costs two application tokens. The request must include a stable `Idempotency-Key`. Tokens are reserved under a user-row lock, charged only after a valid provider response, and linked one-to-one with the completed analysis request.

## Stripe

Configure `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the three `STRIPE_PRICE_TORQUE_ASSIST_*` price IDs. Register this endpoint in the matching Stripe mode:

`POST https://torqueshed.pro/api/billing/stripe/webhook`

Subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `charge.refunded`

Checkout completion credits the ledger only after the signed event reports a paid session matching the locally created purchase. Replays do not duplicate ledger credits. Refund events insert reversal ledger entries and mark the purchase refunded.

## Validation

The integration suite requires a disposable PostgreSQL database:

```powershell
$env:TEST_DATABASE_URL='postgresql://user@127.0.0.1:5432/torqueshed_test'
corepack pnpm test
```

It migrates the database, runs a mock OperatorOS consume service, and verifies vehicle/history persistence, diagnostics, Torque Assist exactly-once charging, marketplace/community persistence, tenant isolation, reload persistence, and coordinated logout.

## Current limitations

- Photo/document metadata and ownership validation are implemented, but binary upload/presigned URL generation requires the production object-storage adapter.
- Marketplace contact is direct messaging only; there is no escrow, shipping, tax, payout, or payment-protection system.
- Community comment, follow, report, and messaging APIs are present; the current web UI primarily surfaces feed publishing, reactions, listing favorites, and creation workflows.
- Native iOS/Android association endpoints require the production signing identifiers before universal/app links can be verified.
