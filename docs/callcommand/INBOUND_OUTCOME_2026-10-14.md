# CallCommand inbound outcome repair - 2026-10-14

Verdict: scoped implementation candidate; production acceptance is open.
Branch: `codex/callcommand-inbound-outcome-oct14`, from merged PR121
`887abe5d7e0bb48aa60987d18bdece8b6a5a779e`. The canonical checkout and existing
worktrees were preserved. No migration, provider configuration, purchase,
production data change, external email, or call occurred.

## Source gaps and changes

- OpenAI call control and notification tools could race. Per-call callbacks now
  serialize control and business actions, and recheck current module, tenant,
  channel, workflow, rule and destination authority. Published flow conditions
  select actions; the runtime no longer flattens all action nodes.
- End/transfer require a bounded summary and save it. Configured notifications
  share one call-and-purpose identity across model tool IDs, termination,
  terminal callbacks and later recording analysis. Email enters the existing
  tenant outbox with five bounded attempts, provider idempotency, suppression,
  leases and failure evidence. Notification failure does not trap the caller.
  Webhook payloads now include the bounded summary. No raw recording or full
  transcript is exported by this change.
- Ending after provider acceptance updates durable call/session outcome and
  releases capacity. Provider acceptance followed by local persistence failure
  is retained as an unknown downstream outcome; control reservations prevent
  automatic repeat actions with another model tool ID.
- The OpenAI SIP Dial lacked Twilio `referUrl`. The generated Dial now points
  to a signed carrier callback which must match an already-reserved, current,
  verified tenant target. It emits a bounded human-number Dial with a signed
  result callback. No answer/busy/failure speaks a saved-details fallback and
  hangs up. Carrier connection and human answer are distinct evidence.
- SIP-valued callback `To` no longer loses the known call's tenant signing
  credential. A supplied known call ID takes precedence over a different `To`
  number when choosing signing authority. Carrier callback receipts and their
  outcome writes commit atomically; terminal retries can retry finalization.
- A process-local registry could let another replica attach another sideband.
  The accepted-event database lease now persists, renews, and fences tool work;
  a replay cannot steal a live owner lease. An expired owner can be reattached
  by a replay without accepting the provider call again.
- Recording callbacks incorrectly required an active voice lane after normal
  termination. Signed, consented post-call processing now has its own bounded
  processing claim; failures remain retryable instead of becoming completed
  duplicates. Voice capacity is not recording-processing authorization.

The provider contracts are explicit: an OpenAI REFER 200 means it was relayed
to the carrier; Twilio needs `referUrl` to provide the next Dial instructions.
See [OpenAI SIP controls](https://developers.openai.com/api/docs/guides/voice-sip?voice-api=realtime)
and [Twilio inbound REFER](https://www.twilio.com/docs/voice/api/refer-to-twilio).

## Verification

Environment: Xodus-John, Windows, Node 24.16.0, pinned pnpm 10.34.5,
new task-owned PostgreSQL 16 container on loopback, marked disposable test DB.
The test harness passes only a small OS-variable allowlist plus synthetic
secrets and test configuration; it does not inherit provider credentials.
The frozen offline install completed with zero downloads. Provider requests in
the new regressions are synthetic fixtures.

The initial focused suite passed 47/47. Subsequent new regressions exposed
invalid historical flow fixtures and assertions that expected released
sideband ownership; those fixtures/assertions were corrected to the intended
published-flow and renewable-lease contracts. Final counts are recorded below
only after commands finish.

Commands run through the task-local clean-environment harness:

```powershell
node callcommand-checks.mjs aggregate
node callcommand-checks.mjs typecheck
node callcommand-checks.mjs lint
node callcommand-checks.mjs api-build
node callcommand-checks.mjs test-types
```

The aggregate invokes all `apps/api/test/callcommand-*.test.ts` sequentially.
Typechecking is the repository's four-workspace `corepack pnpm typecheck`;
lint is root `corepack pnpm lint`; compilation is `corepack pnpm --dir apps/api build`.
Full monorepo production/browser/strict release gates are not claimed.
Raw logs and completion JSON live under ignored
`build/callcommand-outcome-oct14/`; no customer data is in the evidence.

Final aggregate completed at 13:44:54 UTC: **187 passed, 0 failed, 0 skipped,
0 canceled, 0 todo**, across all 22 CallCommand API test files. All four workspace
typechecks passed at 13:41:27; SDK/API production compilation passed at 13:44:10.
Zero-warning root lint passed at 13:48:09 after the final test-only type
annotations. The separate strict test typecheck passed at 13:46:34. Earlier failed
checks included corrected fixture assertions, a misplaced catch edit immediately
caught by typechecking, and an incomplete ad hoc compiler invocation; none is
reported as a pass. No unrelated billing/module code was changed to fix them.

New regression evidence covers concurrent repeated summary/end operations,
outbox failure and later synthetic retry, rule disable after connect, a denied
flow branch, provider-confirmed hangup followed by persistence failure without
resending, signed carrier destination validation/no-answer/replay, SIP callback
tenant signing despite a different platform token, and terminal-before-recording
provider failure with retryable receipts. Recording-after-terminal tests prove
authorization and retry handling; they do not prove a real recording's download,
transcription, attachment scanning, or successful human answer.

Review checked tenant predicates, server-owned targets, receipt/write atomicity,
provider-versus-local failure semantics, idempotency, caller fallback and scope.
No independent reviewer, exhaustive security scan or full monorepo release gate
is claimed.

## Fresh production observations and remaining gates

Read-only probes on 2026-10-14 at approximately 13:00 UTC returned HTTP 200:
`https://operatoros.net/api/health` and `https://api.operatoros.net/readyz`.
Both identified commit `7c212305597b77695565f3ec4c7dffcf86149919`, build
`ef276f880c39aa41fc661dca`, database release v65/65; readiness reported configured
email, Twilio and OpenAI. This identifies configured dependencies, not a
successful inference, call, delivery, or provider-account balance. That Replit
commit is absent from the local Git object database, so its tree/ancestry has
not been independently reconciled. Current source main has manifest v66.

Browser initialization was freshly attempted and failed with
`MXC launcher: cannot locate required Windows platform directory: HRESULT
0x80070003`. Therefore authenticated Replit/provider/tenant inspection and
production changes are not completed. No competing shared browser session was
started.

A source-inspection command also printed an inherited GitHub personal access
token while enumerating `Env:GIT*`. Its value has not been repeated, reread or
used; its label/owner are unknown. Other local tasks may inherit the same process
environment source. Parent has alerted the owner to revoke it privately through
GitHub Developer settings / Personal access tokens. Source publication is pending
a verified unaffected credential path or private remediation; no GitHub push is
performed with that token.

The completed local patch is preserved in a scoped commit and a task-local
format-patch artifact. Publication/draft PR creation is pending an unaffected
approved GitHub authentication path or private credential remediation. No CI
workflow was dispatched and no GitHub CI spending occurred from this task.

The owner approved clearly labeled synthetic summaries to
`support@xodus-is.com` and a bounded transfer test to the supplied owner number.
Parent must notify the owner before initiating transfer. The selected receiving
email/number are not yet verified as persisted tenant configuration. No new
credential, credit top-up, number purchase or recurring charge is authorized.

Before a live call:

1. Confirm owner-approved rotation/rebinding of the historically exposed SIP
   route secret through private controls. No subsequent redacted rotation
   evidence was found in the repository. Do not retrieve or reuse the old value.
2. Reconcile the actual Replit source tree, preserved divergent local commits,
   and v65 production database with the candidate's v66 release boundary.
   This patch adds no migration, but publishing main would still carry that
   existing release difference. Do not reset or force-push the Replit work.
3. Verify the active existing tenant business number, signed Twilio tenant
   credential, OpenAI incoming endpoint/project/model/key restrictions, route
   binding, module entitlement, ready lane, notification rule and verified
   transfer target. Provider/security-setting changes need specific approval.
4. Verify existing Twilio/OpenAI credit and actual account-specific call/model
   rates. Do not initiate a paid test before that evidence and parent readiness
   notification. No external notifications have been sent from this task.
5. Capture one correlated inbound answer and clean hangup, and one correlated
   answer/transfer/no-answer fallback. Preserve call IDs, carrier/OpenAI IDs,
   signed receipts, terminal state, lane release and bounded usage evidence.
6. For the summary, separately record outbox ID, provider message ID/acceptance,
   receiving-mailbox receipt, and the RMM intake record. Outbox `delivered` is
   inherited provider API acceptance; it does not prove mailbox receipt. A
   synthetic adapter's `recorded` result proves no external delivery.

Long-call heartbeat, process death, reconnect across replicas and autonomous
recovery remain unverified. This patch fences controllers and permits replay
reattachment; it does not add an autonomous recovery worker. An Autoscale
process-local sideband must not be declared production accepted until those
failure tests and an appropriate serving-runtime decision are completed.

Rollback is the scoped source revert on a verified compatible release. No
database downgrade or provider-settings rollback is introduced.
