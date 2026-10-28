# SupportLink voice intake and BMS email — local follow-on

Base: `c86af167f33a6c691517b5b9c4ce9dd865e24151`, preserved unchanged. Branch: `codex/callcommand-supportlink-intake-oct28`. This is source/local work only: no real code issuance, provider credentials, mail, phone calls, BMS rules, production configuration/data, migration, publication, PR approval or deployment.

## Caller experience and assurance

On explicitly opted-in MSP lines, first-contact AI can offer either an optional SupportLink number or claimed first name, last name and company. Caller may skip code immediately. Both recognized and unrecognized originating lines can choose the first-contact A0 route; the legacy trusted-line/ten-digit path remains available when this route is unavailable/disabled.

Code lookup is tenant-bound and email-intake-only. It never authenticates a caller, sets an A1 context, grants customer-record/status/device/account/CRM/BMS action access, or infers a Directory match from name, company or caller ID. It does not populate the call context/local case with Directory organization/contact identity. Stored first/last name, email and company are loaded internally for email composition only and are never returned to the model, spoken or used in a caller readback.

Manual intake uses separate first/last name, claimed company, email/callback, general issue and impact. All remain unverified; explicit refusals remain possible. Readback binds every field, identity-source revision and contact-email change. A code-resolved caller is asked only for incident details/impact and an optional callback; the readback contains only those caller-provided fields. Revocation, expiration, directory changes or ambiguity before submission require a fresh manual/readback path; no stale stored identity is silently used.

### Exactly two failures, then useful fallback

The existing call-context attempt counter and hash-linked events persist across reconnects and sessions. After one failed lookup, the caller may try once more or choose manual intake. After the second failure, further code guesses are not looked up or rate-checked; the caller continues manual name/company/incident intake. Replaying the same model invocation does not increment the count. A skip or started manual intake closes the code step; a successful code cannot be swapped repeatedly to enumerate contacts. Failure responses do not disclose whether format, tenant, status, expiration, revocation, ambiguity or rate controls caused the miss. Resource protection can narrow to manual earlier.

Legacy DTMF uses a signed attempt parameter to distinguish a fresh guess from callback replay. Its second failure now narrows the A0 context to unverified/manual intake, clearing line-derived organization/contact fields instead of locking useful intake. Valid legacy association is retained. Stored names are no longer spoken by its greeting. The new short-code route is spoken-digit intake; no unsupported Realtime DTMF facility is invented.

## Existing storage and the eight-digit design choice

The prior SupportLink is ten digits (nine random plus Luhn), stored encrypted in the shared vault with an HMAC lookup and one-active-code-per-contact constraint. It remains accepted on its existing association path. New intake codes use eight random digits, preserving leading zeros as strings, with a distinct purpose and tenant-separated HMAC derived from the existing protected association index. The voice parser accepts six to eight digit input and legacy ten-digit codes; new issuance uses eight digits, the largest requested short format.

Issuance reuses the same Directory contact/profile, SupportLink table, encrypted vault, admin authorization, expiry/revocation and display-once conventions. No second identity directory or schema is introduced. An active legacy ten-digit code is **not silently replaced**: short-code issuance returns a specific administrator conflict. Existing ten-digit codes can still resolve privately for email intake. The owner must review any retirement/replacement separately; no data conversion runs here.

`CALLCOMMAND_INTAKE_SUPPORTLINK_ISSUANCE_ENABLED` defaults off. The existing contact-management UI exposes a separate eight-digit issuance control, disabled until that activation is approved. Backend admin/tenant/module checks remain decisive. No real contact code was generated. The shorter space and accepting a code without trusted-line association are materially different mechanisms: they are deliberately limited to unverified email intake, bounded by two failures, caller/code rate controls and the existing first-contact admission/capacity window. Activation requires review of this exact scope, not an assumption that the short code is authentication.

First-contact application transcription is suppressed so spoken codes do not enter ordinary transcripts. Tool/event receipts contain only opaque references/hashes and counts, not raw codes, stored personal details or reason-specific failure text. Handoff/end summaries use server-owned generic text. This is not a claim of complete DLP or provider-side media deletion/retention control; those remain separate acceptance considerations.

## Email contract and controlled routing hints

The user-confirmed intended BMS mailbox is **support@xodus-is.com**. This is not a verified live connection. The server will reuse only an existing enabled unconditional notification route explicitly configured to that mailbox; other rules cannot redirect this intake. If absent, local intake remains available but no email is queued. No mailbox/provider setting was changed.

The authenticated configured service sender is preserved. No caller `From`, automatic `Reply-To`, BMS parser override header or magic ContactEmail field is invented. Subject is a stable `[CallCommandAI][CLIENT:TAG] Intake <server call UUID>`. Body includes call ID, server timestamp, directory-code-resolved versus caller-claimed source, first/last name, company, contact email, callback, issue and impact, with explicit manual-BMS-triage and unauthenticated-caller warnings. Codes are not included. Submission retries use the existing one-per-call outbox identity; later correction is not claimed to update previously queued mail.

`CALLCOMMAND_INTAKE_ROUTING_TAGS` supports an exact server-side JSON array of `{tenantId, organizationId, tag}` entries. No real mapping was configured. Tags use an uppercase allowlist and require a current code-resolved Directory organization; duplicate/ambiguous mappings, invalid codes and manually claimed names always use `CLIENT:UNVERIFIED`. CMC/VRI are requested routing candidates, not invented account IDs or proof of configured BMS rules. Caller-provided tags and ticket-thread markers cannot enter the subject; such markers are removed from untrusted body fields. Only the administrator-approved canonical organization mapping can select a routing tag.

An email queue/local reference/provider acceptance never proves mailbox receipt, BMS ticket creation, contact/account assignment or human connection. Direct BMS adapter behavior is preserved and not activated or expanded. No universal BMS deduplication is assumed.

## Official BMS evidence and deployment acceptance

- [Email parser setup](https://help.bms.kaseya.com/help/Content/Service%20Desk/bms-email-parser-setting-up-email-parser.html): sender-email matching; subject/body become ticket Title/Details; configured CRM domains may create contacts.
- [Parser FAQ](https://help.bms.kaseya.com/help/Content/Service%20Desk/bms-email-parser-faqs.html): duplicate active same-email contacts across accounts can go to Unknown. No documented Reply-To/body contact override is assumed.
- [Message threading](https://help.bms.kaseya.com/help/Content/Service%20Desk/bms-email-parser-message-threading.html): Message-ID/thread references and ticket number matter. Do not invent a ticket-thread marker or dedup guarantee.
- [Unknown-ticket workflows](https://help.bms.kaseya.com/help/Content/Service%20Desk/bms-workflows-setting-up-initial-notification-workflows-for-unknown-tickets.html): creation can route Unknown tickets; later reassociation is an update, not an ordinary new Ticket Created event.
- [Keyword workflows](https://help.bms.kaseya.com/help/Content/Service%20Desk/bms-workflows-automation-using-keywords.html) and [workflow guide](https://help.bms.kaseya.com/help/Content/Admin/bms-business-process-workflows-getting-started-with-workflows.html): proposed rules need exact owner validation; no dynamic Contact assignment or first-match-wins claim.

Before enablement, inspect the actual authenticated service sender against BMS contact/employee/domain mappings. Proposed CMC/VRI rules must constrain Email source, dedicated sender and one controlled subject token; sender matching is not email authentication. Never overwrite populated conflicting Account/Contact. Verify Account/Contact/Unknown status, default contract/SLA effects, queue, notifications and creation-order interactions. Test correct token, UNVERIFIED, wrong sender, both-token/conflicting account cases, and later manual reassociation. Exact UI operators, bracket/case matching and account-only promotion from Unknown remain unverified. No rules were created or changed here.

## Verification, limitations and recovery

Exact final local check receipts and source hashes are retained in `evidence/callcommand-supportlink-oct28/`. Network is blocked for DB-free checks; existing installed dependencies are reused without acquisition. PostgreSQL journeys are prepared/typechecked, **not executed**, under the retained engine-access restriction. No alternate database route or permission change was attempted. SQL concurrency, real Twilio/consent, audible voice quality, real mailbox/BMS outcomes and human answer/fallback remain unverified.

The contact-management UI is source-checked; browser interaction and a full Next production build are not implied by focused checks. Recording-enabled and withheld/invalid-number limitations from the first-contact candidate remain. Incomplete/unconfirmed requests remain local drafts. Already queued mail is not automatically recalled on code revocation or opt-out.

Remaining inputs: existing MSP tenant/line and owned escalation destination/hours (mailbox intent is settled). Remaining approvals: short-code issuance/line activation and resource envelope; canonical company/tag mapping and controlled BMS workflow/sender acceptance; bounded owned call/mail test; and existing source-publication, credential-containment, schema/backup/recovery and deployment holds. No actual credentials or code values are needed in chat. Preserve `c86af167` and earlier candidates as local recovery points; nothing live needs rollback from this pass.
