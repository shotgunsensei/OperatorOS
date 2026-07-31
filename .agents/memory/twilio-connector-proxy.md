---
name: Twilio/Replit connector proxy quirks
description: How to correctly read connector credentials from the Replit connectors proxy and auth to Twilio
---

- The proxy (`https://$REPLIT_CONNECTORS_HOSTNAME/api/v2/connection?include_secrets=true`) requires a scheme prefix on the identity token: `repl <REPL_IDENTITY>` in workspace, `depl <WEB_REPL_RENEWAL>` in deployments. A raw token → 401.
- The `connector_names=twilio` query filter returns 0 items even when the connection exists. Fetch unfiltered and match `connector_name` client-side.
- The Twilio connector serves an **API key pair** (`account_sid`, `api_key`, `api_key_secret`, `phone_number`) — no primary `auth_token`. Twilio basic auth must be `api_key:api_key_secret` (username = SK…), never `accountSid:api_key_secret`.
- Twilio signs webhooks with the account's PRIMARY auth token only — connector-sourced creds can never verify `X-Twilio-Signature`; `TWILIO_AUTH_TOKEN` must be set for webhook verification (fail-closed otherwise).
- **How to apply:** all Twilio REST call sites in apps/api share `restAuthHeader()` from the telephony lib; connector reads are skipped when `NODE_ENV=test` so tests exercise the env path.
