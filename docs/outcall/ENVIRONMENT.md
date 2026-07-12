# OutCall Environment

All private values belong in Replit Secrets. Public browser variables must use
the final framework's public prefix and appear in the explicit safe list only.

## Core and parent integration

| Variable                   | Sensitivity              | Purpose                                                                           |
| -------------------------- | ------------------------ | --------------------------------------------------------------------------------- |
| `APP_ENV`                  | public-ish server config | Must equal `production` in production; enables fail-closed validation.            |
| `PORT`                     | server config            | Replit-provided port; bind `0.0.0.0`.                                             |
| `OUTCALL_PUBLIC_URL`       | server config            | Canonical `https://outcall.operatoros.net`; webhook signature and redirects.      |
| `OPERATOROS_BASE_URL`      | server config            | Canonical parent base/issuer per repository contract.                             |
| `OUTCALL_URL`              | parent server config     | Parent registry runtime override, normally canonical URL.                         |
| `DATABASE_URL`             | secret                   | Approved shared PostgreSQL connection with TLS.                                   |
| `MODULE_SSO_SECRET`        | secret                   | Existing OperatorOS handoff signing secret; do not rename.                        |
| `OPERATOROS_SERVICE_TOKEN` | secret                   | Existing entitlement introspection/propagation token when used.                   |
| `SESSION_SECRET`           | secret                   | OutCall child-session signing/encryption key if the runtime uses signed sessions. |

## Twilio

`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY_SID`,
`TWILIO_API_KEY_SECRET`, `TWILIO_VERIFY_SERVICE_SID`,
`TWILIO_ALLOWED_COUNTRIES`, `TWILIO_PHONE_NUMBER`,
`TWILIO_PHONE_NUMBER_SID`, `TWILIO_MESSAGING_SERVICE_SID`,
`TWILIO_SMS_WEBHOOK_URL`, and `TWILIO_SMS_STATUS_CALLBACK_URL` are server-only.
API key credentials should be preferred for supported outbound operations while
the auth token remains necessary for webhook validation. Validate SID formats,
E.164 number, exact HTTPS URLs, and a non-empty country allowlist at startup.

## Stripe and protection keys

The parent owns `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`; do not copy them
into the child unless a reviewed topology makes it unavoidable. The parent also
uses `STRIPE_PRICE_ADDON_OUTCALL` when OutCall is commercially activated.

OutCall requires independent, versioned `FIELD_ENCRYPTION_KEY`,
`PHONE_LOOKUP_HMAC_KEY`, `AUDIT_LOG_HMAC_KEY`, `INTERNAL_JOB_SECRET`, and
`CRON_SECRET`. Production startup fails closed for absent, malformed, reused, or
known development values. Document old key versions during rotation; never
overwrite ciphertext keys without a migration.

## Safe public variables

Only the canonical OutCall URL, public OperatorOS URL, and Stripe publishable key
may be exposed if the UI needs them. Twilio credentials, SSO/service/session
secrets, database URLs, HMAC/encryption keys, webhook secrets, OTPs, and provider
signatures are never placed in browser bundles or logs.
