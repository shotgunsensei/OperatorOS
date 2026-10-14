# CallCommand post-reboot preflight

Checkpoint: 2026-10-14, 18:55-19:05 UTC. No calls, emails, publication,
production migration, provider/security setting change or credential creation
occurred. The original application patch remains commit `31b00596`.

## Production and release coordination

Fresh read-only public probes at 18:55:55 UTC returned HTTP 200/healthy/ready:

- `https://operatoros.net/api/health`
- `https://api.operatoros.net/readyz`

Both identify commit `7c212305597b77695565f3ec4c7dffcf86149919`, build
`ef276f880c39aa41fc661dca`, and database v65/65. The reported deployed/wake
timestamp changed to 18:54:48 UTC; the identified application build did not.
Email, Twilio and OpenAI are reported configured. This is neither successful
inference nor tenant/provider/live-call acceptance.

The separate OutCall candidate `24e15d2b8b2bd22bd82593cd2078d9a6cd3c0cef`
has manifest v67 and already contains `31b00596` in its ancestry. Its four
CallCommand implementation files differ from pre-patch main as expected.
No edits were made to that candidate's worktree. The new tests in this
checkpoint are a separate local follow-up for the release owner to integrate.
Production v65 versus candidate v67 remains a coordinated backup/release/
migration/deployment decision, not a CallCommand-only database change.

## New local lifecycle evidence

Three selected regressions pass, with zero failures/skips/cancellations/todos:

1. An open simulated call retains its owner beyond the original 30-second
   ownership lease through real heartbeat timer renewals; the final end tool
   still works after a 35-second wait.
2. Repeated abnormal sideband-close callbacks produce one hangup request,
   release the lane, persist failure and incomplete-intake state, and queue
   exactly one configured notification.
3. An expired owner cannot execute tools; a signed replay reattaches without
   accepting the provider call again; the old owner's close callback cannot
   hang up the successor controller.

The targeted run completed at 19:01:52 UTC in 69,249 ms. Strict typing of the
changed tests passed at 19:04:37; scoped zero-warning lint passed at 19:04:48.
The original 187/187 aggregate, workspace types and SDK/API compilation remain
the previously recorded evidence. Application code did not change in this
checkpoint, so those completed gates were not rerun.

Only this task's existing disposable PostgreSQL container was restarted on
loopback port 55461. No OfficeExit database, Sandbox test or browser was used.
The test harness excludes inherited provider credentials. Logs are retained
under `build/callcommand-outcome-oct14/` (`lifecycle`, `test-types`, and
`lifecycle-lint`).

This proves timer renewal, sideband-loss fallback and replay-driven recovery
with synthetic adapters. It does **not** prove a real process-kill test,
provider media survival, autonomous recovery without webhook replay, multi-hour
calling, mailbox receipt or human answer. The shared worker has no CallCommand
controller-recovery scanner. Autoscale process-death acceptance remains open;
do not infer autonomous recovery from replay success.

## Browser and provider preflight blocker

The task's callable tool set has no browser/node-repl/Computer Use runtime.
The bundled native-host diagnostic succeeds for Chrome under the real user
context. An earlier non-escalated diagnostic incorrectly appeared to lack the
registry key; it was not used as a reason to alter or reinstall the host.
The remaining blocker is runtime availability in this task, not a confirmed
native-host installation fault. No app input or browser session was opened.

Therefore existing balances, account-specific rates, active tenant routing,
persisted destinations, project/model restrictions and private SIP rotation
evidence remain **unverified**. They are not claimed absent. Resume in an
approved Browser-enabled execution context; do not extract browser cookies,
credentials, or use a scripting workaround to control the user's browser.

Public reference prices were checked only to prepare the next review:

- [Twilio US list prices](https://www.twilio.com/en-us/voice/pricing/us): local
  inbound $0.0085/min, SIP interface $0.0040/min, and US outbound $0.0140/min.
  Applicable call legs, account discounts, taxes and available credit are not
  established by these published rates.
- [OpenAI Realtime 2.1 Mini](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini):
  audio input/output $10/$20 per million tokens.
- [OpenAI Realtime 2.1](https://developers.openai.com/api/docs/models/gpt-realtime-2.1):
  audio input/output $32/$64 per million tokens. The configured live model and
  account credit must be checked privately before estimating a test charge.

## Credential incident and safe path forward

Later trusted owner history says the expired GitHub entries labeled Replit and
Codex were deleted; the Codex entry showed never used, the Replit entry showed
use within four months, and no classic-token entry was present. Those facts
do not map the inherited exposed PAT to an issuing entry. Available nonsecret
metadata identifies only the inherited variable name, not whether the value
was platform-provisioned or user-configured. No raw environment/config/credential
dump, credential value, or credential-store retrieval was performed here.

Do not ask the owner to guess another token or revoke unrelated OAuth apps.
GitHub Desktop's existing browser-authenticated/system-keychain path is a
candidate independent release path. Its own active authentication must be
verified through app account metadata and a read-only repository operation,
with the suspect environment credential unused. That is a risk assessment,
not confirmation of this machine's authentication mechanism or PAT revocation.
See [GitHub Desktop authentication](https://docs.github.com/en/desktop/installing-and-authenticating-to-github-desktop/authenticating-to-github-in-github-desktop).
This task cannot inspect the app session because the required runtime is
unavailable. Existing authenticated-write/publication holds remain in effect.

## Precise remaining actions

1. Execution owner: restore a Browser-enabled task context, then finish read-only
   Replit/provider/tenant and independently authenticated release preflight.
2. Release owner: integrate the new test/evidence follow-up into the existing
   OutCall v67 candidate; reconcile its source with actual preserved Replit work
   and the v65 production database before any separately approved release.
3. With private provider access, establish existing credit, active model and
   account-specific applicable charges. No new test-spending approval newer than
   the hold is present in this task. Set a bounded test duration/cost ceiling
   before authorizing paid calls; no top-up, number purchase or recurring charge
   is requested.
4. Verify whether SIP rotation and private rebinding already happened. If they
   did, record redacted completion evidence. If not, identify the exact private
   owner action before changing security-sensitive settings.
5. Keep approved synthetic summary destination `support@xodus-is.com` and
   human transfer target `+19102494162`. Do not ask to reselect them. Parent
   must notify the owner before a live transfer begins.

Provider preflight and release actions are pending, not denied. No uncertain
external write or paid-test outcome exists in this checkpoint.
