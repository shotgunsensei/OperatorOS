# CallCommand first-contact voice intake — source/local candidate

This follow-on starts from associated MSP candidate `b1848f2e0910d7a22ccb3b34ef7b5cbf7b4c1351` on a separate branch, `codex/callcommand-first-contact-oct28`. The first candidate and rejected portfolio ancestor remain preserved. No source publication, CI dispatch, credential/configuration change, call, email, migration or deployment occurred in this pass.

## Customer outcome and boundary

For a carrier-signed inbound call to an exact active MSP channel whose originating number is not associated, the server can offer natural AI intake immediately, without a SupportLink step. Required existing consent still precedes automated processing. The AI identifies itself and collects only name, claimed company, callback, general technical issue and business impact. Refusals and human requests are supported. Existing recognized-line/SupportLink A1 flow remains intact.

The caller remains **A0 / UNVERIFIED**. Caller ID, a claimed company, a callback, readback confirmation and a local reference never establish identity or organization/contact membership. No automatic directory matching or merging occurs. Existing parseable carrier `From` requirements remain; withheld/invalid numbers are not newly supported.

The A0 prompt is fixed server policy. Tenant scripts, advanced prompts, knowledge, private customer data, condition-matched rules and flow execution are not compiled into it. Allowed tools are `save_support_intake`, `submit_unverified_support_request`, and configured `transfer_call` / `end_call`. A0 cannot use A1 submission, generic email, CRM/task/ticket, BMS, device, identity, account or cross-module tools. Current authority is rechecked at every tool action; a first-contact call cannot silently upgrade when a record is later associated.

## Entry, replay, abuse and consent

`CALLCOMMAND_UNVERIFIED_VOICE_CHANNEL_IDS` is an exact comma-separated channel-UUID allowlist, absent by default. Wildcards, malformed lists and partial identifiers fail closed. No value has been configured on a live system. Activating a line is a separate reviewed resource/security/cost decision; this source change is not activation approval.

Admission requires the existing signed carrier and exact-called-line event chain, an unassociated A0 context, active tenant/module/channel/profile/flow, current managed-line/provider readiness, existing realtime enablement, eligible billing/lifecycle, configured business-hours behavior, and existing capacity admission. Recording-enabled configurations retain fallback. Consent requirements are preserved; no instruction is given to disable controls.

The existing persistent rate-limit table bounds starts to three per originating-number fingerprint and twenty per tenant per fifteen minutes. Context locking deduplicates admission: a provider retry neither consumes another allowance nor extends the window. Caller ID is spoofable; its fingerprint is an abuse signal, not authentication. Tenant-wide limits and existing capacity/billing controls remain necessary. This is not a monetary hard cap or proof of carrier fraud protection.

TwiML sets a five-minute `Dial timeLimit`; retries and the signed human-REFER route use the remaining original deadline. This is distinct from ringing timeout. The same window is revalidated in server authority. It has not been verified with a carrier. Reference: [Twilio Dial timeLimit](https://www.twilio.com/docs/voice/twiml/dial#timelimit).

## Persisted request and truthful delivery

Existing bounded intake snapshots require draft save, readback, then confirmation of the unchanged revision. Declined fields remain explicitly empty. Obvious credential assignments are rejected without echo; prompts prohibit passwords/OTPs, payment information and patient details. This is not comprehensive DLP, PHI detection or audio redaction.

Submission creates at most one existing local case per call context, with **null organization/contact**, `OPEN` status, `BLOCKED` BMS sync and an explicit **UNVERIFIED / MANUAL CUSTOMER ASSOCIATION REQUIRED** summary and events. No schema change or automatic BMS operation occurs. Local reference means local request only.

Only one unambiguous unconditional administrator-owned email destination may be reused from existing enabled rules. Tenant templates/subjects are replaced by the fixed unverified subject and confirmed intake. Ambiguous/missing destinations leave a durable local request and no email. The existing per-call durable notification identity prevents repeated model tool IDs from sending duplicates. The recipient must be confirmed by the owner before activation; none was invented or contacted.

Email queued, provider accepted, mailbox received and external PSA ticket created remain different outcomes. The tool never confirms an external ticket or mailbox receipt. Later corrections remain local; it never claims the previous email was updated. Disconnected/unconfirmed intake remains a draft and is not automatically submitted.

Human transfer takes priority over intake completion. A0 exposes it only during configured open business hours, when existing behavior permits transfer and exactly one active server-verified tenant target exists. No caller-supplied destination is accepted. Real human answer and no-answer/failure handling remain live acceptance gates. Ambiguous targets or closed hours produce honest callback/manual intake instead.

First-contact classification persists after expiry/opt-out. Generic post-call analysis, rule/flow execution, CRM fallback and cross-module publishing are stopped before running. Generic action dispatch is also denied; the restricted durable support notification is the sole allowed dispatch path.

## Verification and remaining release gates

Exact final check receipts and source hashes are retained in `evidence/callcommand-first-contact-oct28/` outside the source checkout. DB-free tests run with network blocked and no provider credentials inherited, reusing existing installed modules without acquisition. API compilation is not a full web/monorepo production build. No independent security-review or canonical-scanner completion is claimed.

`callcommand-first-contact-db.test.ts` is prepared and typechecked but **NOT EXECUTED**. It starts after a synthetic signed-carrier A0 context and uses actual registered handlers/PostgreSQL with synthetic OpenAI control. It covers foreign-call rejection, replayed admission, narrow tools, one unassociated local request/outbox, generic-action denial, opt-out and expiry. It is not proof of the initial real Twilio signature/route or real voice. Execute it together with associated-MSP, signed-webhook, outbox/concurrency, consent and transfer suites on a disposable database. The retained Docker engine pipe permission block was not retried or bypassed; no PostgreSQL engine is available on PATH.

Minimum next inputs are the existing tenant/line, support-ticket mailbox, owned human destination and hours. Privately verify existing provider resources and routing, then approve exact-line activation, the bounded owner test and its cost/action time. Run real interruption/readback/refusal, mailbox/PSA acknowledgement, human answer/no-answer, hangup and duplicate-callback acceptance. Source-publication refusal, PR136, credential containment, production schema/backup/recovery and deployment holds remain separate. Do not publish a descendant through another route or apply a database change to test this feature.

Rollback is to keep the current deployment and both prior local candidates. No live rollback is needed because nothing was activated or deployed. A future approved activation can remove the exact-line allowlist entry to stop new/continued A0 intake; already queued messages require their normal controlled outbox procedure, not a claimed automatic recall.
