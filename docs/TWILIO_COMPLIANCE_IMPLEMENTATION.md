# OperatorOS Twilio Communications Compliance Implementation

Status: source implementation complete; production deployment and live Twilio Console/provider verification remain owner-operated gates.

Effective implementation date: August 10, 2026

## Scope and intent

This increment adds a public, reviewer-verifiable service-SMS consent workflow for OperatorOS. It does not create marketing consent, does not create voice consent, and does not assert that Twilio Trust Hub, A2P 10DLC, Toll-Free Verification, STIR/SHAKEN, or CNAM registration has been approved. Those external registrations must be completed and verified in the applicable Twilio account after the public release is deployed.

## Repository audit

### Framework and routing

- The public application is Next.js 15 under `apps/web/src/app`.
- The API is Fastify 5 under `apps/api/src`, backed by PostgreSQL and Drizzle SQL initializers.
- Browser `/api/*` requests are same-origin Next rewrites to Fastify `/v1/*` routes.
- Public marketing pages use `MarketingLayout`, `MarketingNavbar`, and `MarketingFooter`; authenticated console routes remain under `/app` and module host routing remains in middleware.

### Existing public legal and contact surfaces

- Legacy public messaging documents existed at `/msg_privacy` and `/msg_terms` through `LegalMessagingPage`.
- The new canonical pages are `/privacy`, `/terms`, `/sms-consent`, and `/messaging`. Legacy document routes remain compatible and render the current canonical policy content.
- The legitimate support contact already published in the repository is `john@shotgunninjas.com`, with the contact page at `https://operatoros.net/john`.
- The public footer now links directly to Privacy, Terms, and SMS Communications without authentication.

### Existing phone, messaging, and voice architecture

- Shared outbound email/SMS uses the durable `shared_outbox_messages` worker and explicit provider adapters. The Twilio SMS adapter sends through the Twilio Messages API only when live provider configuration is available; test mode never claims external delivery.
- TradeFlowKit already requires explicit stored SMS consent before queuing lead SMS and enforces STOP wording. Its tenant-owned consent remains an independent upstream requirement.
- CallCommand supports consent-gated outbound voice and signed Twilio voice/status callbacks. Recording is disabled unless separately approved.
- OutCall supports a verified-self number, scheduled or immediate controlled voice, DTMF acknowledgement, and signed exact-match private inbound SMS triggers.
- The checked-in implementation uses direct-number `From` fields (`TWILIO_FROM_NUMBER` and `TWILIO_PHONE_NUMBER`). No `MessagingServiceSid` or `TWILIO_MESSAGING_SERVICE_SID` configuration was found. Whether a number is attached to a Twilio Messaging Service is external Twilio Console state and was not verified from source.

### Database, audit, and deployment

- The ordered, additive startup release is `DATABASE_RELEASE_CONTRACT`; this increment adds release v37 after PulseDesk v36.
- Existing platform activity, audit, shared webhook receipts, delivery attempts, and notification suppression remain authoritative for their current scopes.
- Replit production starts through `scripts/start-unified-runtime.mjs`, which runs the environment preflight, applies/verifies the ordered database release, and starts Fastify plus Next.
- No Twilio credential, authentication token, API key, shared encryption key, or environment value is rendered or stored by this workflow.

## Public reviewer routes

| Route | Purpose | Authentication |
| --- | --- | --- |
| `/privacy` | General OperatorOS Privacy Policy plus SMS and Mobile Messaging Privacy | Public |
| `/terms` | General OperatorOS Terms plus SMS and Messaging Terms | Public |
| `/sms-consent` | Standalone affirmative service-SMS opt-in form | Public |
| `/messaging` | Reviewer-friendly program and consent-flow description | Public |

All four routes use the normal OperatorOS marketing shell, render visible HTML content, and do not require an account, modal, dashboard interaction, or CAPTCHA to read.

## Consent collection contract

The only initial enrollment method represented for this platform program is the public web form at `https://operatoros.net/sms-consent`.

- The phone input and SMS checkbox are separate controls with programmatically associated labels.
- The checkbox is controlled from `useState(false)`, is unchecked by default, and has no `defaultChecked` or automatic selection path.
- SMS consent is not bundled with Privacy Policy acceptance, Terms acceptance, account creation, purchasing, or core service use.
- The server rejects a submission unless `smsConsent` is the literal boolean `true`.
- US numbers are normalized to E.164 (`+1XXXXXXXXXX`) after validation.
- A bounded hidden honeypot and durable HMAC-keyed request window limit obvious automated abuse without blocking reviewers from reading or using the form.
- The API does not echo the phone number. It returns only acceptance state and a shortened random consent reference.

Current disclosure version: `operatoros-service-sms-2026-08-10-v1`

> I agree to receive recurring SMS messages from OperatorOS regarding account notifications, scheduled calls, service updates, support, and other communications I request. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.

This is service/transactional consent only. Marketing consent would require an independent unchecked control, separate language, separate evidence category, and appropriate product support.

## Durable evidence model

Release v37 adds:

### `operatoros_sms_consent_records`

The current per-number/per-program state contains:

- random consent record ID;
- normalized E.164 phone number and server-keyed phone fingerprint;
- `opted_in` or `revoked` status;
- fixed `operatoros-service-sms` program and `service` category;
- UTC consent/revocation timestamps;
- server-owned public source URL;
- exact disclosure text, disclosure version, and language;
- Privacy Policy and Terms versions;
- opt-in and revocation mechanisms;
- bounded user-agent summary and HMAC-protected client-address evidence;
- optimistic version and record timestamps.

### `operatoros_sms_consent_events`

Append-only evidence preserves `opt_in`, `opt_back_in`, `revoked`, and `help` events. Signed provider event IDs are uniquely indexed for replay safety. Duplicate current-version web consent returns the existing reference and does not create a second consent event.

### `operatoros_sms_consent_rate_limits`

Durable one-hour request windows use an HMAC bucket rather than storing a raw client address. Expired windows are removed during consent processing.

Consent records are not exposed through a public read-by-phone endpoint.

## STOP, HELP, and START

The signed CallCommand/shared-sender and OutCall Twilio webhooks now process provider keyword signals. The CallCommand messaging callback covers `TWILIO_FROM_NUMBER`; the OutCall callback covers the separately configured verified-self `TWILIO_PHONE_NUMBER` before private exact-trigger matching.

- Twilio signature verification and owned receiving-number validation still occur first.
- `OptOutType` is honored when Twilio Advanced Opt-Out supplies `STOP`, `HELP`, or `START`.
- Exact full-body fallback recognition covers STOP, UNSUBSCRIBE, END, QUIT, STOPALL, REVOKE, OPTOUT, CANCEL, HELP, START, and UNSTOP if such a message reaches the signed webhook without `OptOutType`.
- STOP stores local revocation evidence. The shared outbox rechecks the platform revocation immediately before any SMS provider send and cancels the row if revoked.
- The code does not remove, override, evade, or switch numbers around Twilio/carrier suppression.
- When Twilio supplies `OptOutType`, OperatorOS returns empty TwiML and relies on Twilio’s configured reply, avoiding a duplicate application response.
- START only changes local status after an existing revoked record; it is not advertised as the initial opt-in method.
- Existing tenant/module consent checks remain required. A platform web consent does not silently grant a tenant permission for unrelated messaging.

For direct-number deployment, configure the inbound messaging callback for `TWILIO_FROM_NUMBER` as `https://callcommand-ai.operatoros.net/v1/modules/callcommand-ai/webhooks/twilio/messaging`. Keep the OutCall callback at its documented `/api/modules/outcall/webhooks/twilio/sms` path for `TWILIO_PHONE_NUMBER`. Both callbacks fail closed on invalid signatures and receiving-number mismatches.

Owner must verify the deployed Twilio number type and Console behavior. Advanced Opt-Out is Messaging-Service configuration, not source configuration. Toll-Free STOP/START behavior is carrier-controlled. The exact live keyword responses and local reconciliation must be tested with the actual production sender after deployment.

## Privacy and security review

- No raw Twilio credentials or secrets are logged, returned, documented, or added to source.
- Phone numbers are necessarily stored in normalized form as consent evidence; public API responses never echo them.
- Phone and client-address lookup/audit fingerprints use HMAC-SHA-256 with the existing required server session secret rather than unkeyed public hashes.
- Provider keyword events are accepted only after the existing Twilio signature and receiving-number controls.
- Raw SMS trigger content remains outside safe activity payloads; only bounded keyword/provider evidence is stored in the consent event.
- Current-state and append-only tables provide both operational enforcement and reviewable chronology.
- This implementation is an engineering compliance control, not legal advice or a certification. Qualified counsel should review policies for the business, jurisdictions, and actual program before submission.

## Voice and Trust Hub boundary

OperatorOS has real, bounded Programmable Voice functionality in CallCommand and OutCall, including consent-gated or verified-self scheduled/user-requested calls and signed callbacks. This SMS form does not authorize voice calls and is not written as automated/prerecorded-call consent. Existing voice consent and safety controls remain separate.

Twilio Voice identity and trust mechanisms—including Trust Hub business/profile review, STIR/SHAKEN, CNAM, number registration, and any jurisdiction-specific calling consent—are separate from A2P messaging compliance. Their external status was not available from repository source and must be reviewed in Twilio Console before live voice claims are made.

## Deployment and rollback

1. Confirm a verified production database backup and restore target under `docs/DATABASE_BACKUP_RESTORE.md`.
2. Configure the existing production secrets through Replit; never place them in source. `SHARED_SECRET_ENCRYPTION_KEY` is already a mandatory production preflight dependency for the shared platform.
3. Run the repository production release gate.
4. Deploy through the existing Replit promote workflow. Startup applies additive database release v37.
5. Verify all four public HTTPS pages and the POST flow.
6. Verify the actual Twilio sender/number type, A2P or Toll-Free registration path, inbound callback, STOP/HELP/START behavior, delivery/suppression, and provider logs using an owner-controlled test number.

Rollback is restore-to-new-database-and-switch-traffic per the release contract. The v37 DDL is additive; do not drop consent or revocation evidence as an application rollback shortcut.

## Verification record

Executed on 2026-08-10 from `codex/twilio-communications-compliance`:

- `pnpm typecheck`: PASS.
- `pnpm lint`: PASS.
- Focused API, static-contract, database-release, signed Twilio webhook, keyword, and outbox-suppression tests: PASS, 16/16.
- `pnpm db:plan`: PASS with 37 release steps.
- Database release v37 apply and immediate reapply against a disposable PostgreSQL database: PASS; the additive release is idempotent.
- `pnpm build`: PASS, including the API, runner, and Next.js production build. The build route manifest contains `/privacy`, `/terms`, `/sms-consent`, and `/messaging`.
- Compiled-artifact exact-host Playwright run, filtered to `public Twilio compliance`: PASS, 1/1. It covered public unauthenticated access, responsive/mobile rendering, keyboard use, unchecked and reset checkbox state, policy links, invalid input rejection, consent persistence, and the public metadata response without secrets.
- `git diff --check`: PASS.

The aggregate API suite executed 969 tests: 938 passed, 25 failed, and 6 skipped. Four failures were stale exact release-version assertions introduced by the v37 increment and were corrected; their focused suite then passed 13/13. The remaining aggregate failures are outside this change and include pre-existing product/static-baseline drift in customer workflow, TradeFlowKit/PulseDesk presentation, and the FaultlineLab catalog. They were not hidden or rewritten as part of the messaging-compliance change.

`pnpm build:production` is not green because the existing FaultlineLab generated source catalog is stale and the production gate requires `pnpm faultlinelab:catalog:write`. The ordinary production compilation (`pnpm build`) passes. Updating an unrelated generated product catalog was intentionally left outside this compliance change.

Actual HTTPS checks on 2026-08-10 returned `404` for all four target URLs. The implementation is therefore **not deployed and not live**:

- `https://operatoros.net/privacy` — 404
- `https://operatoros.net/terms` — 404
- `https://operatoros.net/sms-consent` — 404
- `https://operatoros.net/messaging` — 404

No Twilio Console configuration or live SMS was changed or claimed. Before submission, the owner must deploy the branch through the controlled release path, confirm a primary Twilio Auth Token is available for webhook signature verification, identify the actual sender type and Messaging Service association in Twilio Console, complete the applicable A2P 10DLC or Toll-Free verification, configure/confirm inbound webhooks and Advanced Opt-Out where supported, and execute an owner-controlled live STOP/HELP/START and suppression test.
