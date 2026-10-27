# CallCommand bounded automatic sideband recovery

Isolated local follow-on to `92fd545dbb863bf68f06fe638ce4d2b3adb4a040`.
This implements the worker-interruption portion of the existing commercial
runtime architecture. It is not deployed or accepted against real providers.
The published Lunch Break hub, component candidates and production settings
remain unchanged. No schema or database release is added.

## Recovery contract

The API starts one non-overlapping scan after database readiness, every two
seconds, with at most two candidates per scan. It considers an expired incoming
processing lease only when the durable receipt has positive provider proof,
the call is still active, and the exact tenant, OpenAI call, Twilio call,
capacity lane and server-precision admission generation still match. Current
module, channel, custodian and consent authority are revalidated before attach,
callback mutations and new tool reservations. Competing processes claim one
owner under the same PostgreSQL lock order.

Confirmation is an internal ingestion proof written after successful provider
accept or a successfully opened, owner-validated sideband. A status label alone
is insufficient. Unknown accept outcomes and legacy records without this proof
are excluded. A valid signed replay can reattach an ambiguous/legacy call after
expiry and establish proof only when the connection actually opens. Failed or
incomplete open does not manufacture confirmation. Accept is never replayed.

Automatic retries have a durable per-call budget of three. Failed attempts defer
the next scan by 30, 60 and 90 seconds respectively; no automatic attempt occurs
after the third. A failed initial connection uses a 30-second delay. Normal
process shutdown releases its processing lease for immediate recovery without
changing the retry budget. A later explicitly signed replay can reattach after
expiry, but cannot reset the automatic budget or take a still-owned controller.
Ineligible candidates back off so they do not starve eligible later candidates.

Recovery never sends an initial greeting. Initial greeting has one durable
reservation and is sent only after validated socket open. A late old socket
cannot greet after ownership handover. Delivery remains unknown if the process
dies between reservation and delivery; the greeting is not blindly repeated.

## Ownership, effects and capacity

Protected callbacks and tool reservations acquire tenant capacity advisory,
per-call advisory, call, receipt and lane locks in that order. Validation and
mutation are atomic; no transaction is held across a provider effect. Exact
lane generation uses PostgreSQL epoch text, retaining microseconds. Incoming
lease expiry uses the database clock rather than application wall-clock time.

An already-authorized external effect may finish after handover and retain its
own receipt. The old controller cannot reserve new effects, mutate/release a
replacement, or send function output/model continuation after losing ownership.
A successful same-owner terminal tool remains a completed, single effect.
This is not retroactive cancellation or exactly-once network delivery.

Socket error, local close, accept timeout and exhausted recovery are not
authoritative carrier termination. No inferred hangup or lane release occurs.
An expired lane bound to an unresolved active Realtime call remains counted
without renewing its expiry or granting controller authority. A same-call
expired admission requires reconciliation; other genuinely spare lanes remain
available. Authoritative terminal domain reconciliation clears the hold. Lost
terminal evidence therefore reduces availability until actual reconciliation;
there is no invented provider-status query or automatic Twilio polling here.

Heartbeats renew only a current unexpired exact-generation lane, within the
existing configured maximum measured from original admission. Expired or
reassigned lanes cannot be revived by recovery. Tenant/module revocation,
terminal state or authority loss prevents new work.

Shutdown stops scans and heartbeats and tracks closed controllers until their
queued callbacks settle, including late callback-error work. Drainage is bounded
at 30 seconds. Incomplete drainage raises
`CALLCOMMAND_REALTIME_DRAIN_INCOMPLETE`; the API must not acknowledge success
and close its database pool while owned work is pending.

## Local verification and limits

The new `apps/api/test/callcommand-realtime-recovery.test.ts` suite uses actual
disposable PostgreSQL 16.14, official SDK signature validation, actual route and
sideband controller composition, and identity-verified owned OS child processes.
The first journey kills the original child, waits real lease expiry and proves
automatic background reattachment with **no additional incoming webhook**, no
repeat accept and no greeting. Remote OpenAI operations/media remain synthetic.

Additional cases cover independent contenders; stale usage/transcript/error,
close and actual socket tool messages; an in-flight effect after handover;
successful same-owner end; failed open and durable retry exhaustion; unknown
accept provenance; revoked-candidate fairness and foreign proof; held expired
capacity/spare lanes/terminal reconciliation; late greeting; exact generation;
application clock skew; closed-but-pending callback drainage; finite stop timeout.
Exact completed results, failed fixture baselines, source hashes, dependency
provenance and owned cleanup are bound by the private external candidate
manifest under `evidence/resume-oct22/callcommand-recovery/`.

Completed sequence: `recovery-edges-v1` passed 12/13; its fairness scenario
stopped on a duplicated synthetic channel phone during setup. After unique
fixture phones, `recovery-edges-v2` passed 12/13; its fairness assertion assumed
an order that concurrent shutdown does not promise. The corrected test fixes
candidate expiry order explicitly without changing runtime behavior.
`corrected-targeted-v1` passed the selected fairness and late-callback cases
2/2, with zero reported skips. Thus thirteen unique recovery scenarios have
successful coverage across these receipts on identical eight production-file
hashes; neither earlier full run is relabelled 13/13. The final fixture also
supplies its required callback call ID. Failed strict-check receipts remain.

Affected canonical-adapter/number-provider/realtime tests passed 32/32. Final
new-test strict compilation, zero-warning affected lint, complete API types,
SDK compilation and API emitted build passed. Only changed fixture cases were
rerun after the final fixture-only corrections. No unrelated platform suite
or held integration operation was executed.

Existing installed assets are reused without acquisition, with a sterile child
environment and network guard allowing only the exact loopback fixture port.
These checks do not establish real media survival, provider retry cadence,
full-platform CI, a canonical frozen installation or production readiness.

## Rollout and remaining human gates

Old binaries do not fence callbacks. Mixed old/new active controllers are not
protected. Rollout requires an approved quiet/drained-call window and updating
all serving replicas before using this behavior. Legacy records need successful
signed reattachment or explicit provider reconciliation; they are not silently
adopted by status alone. No rollout or provider change was performed.

Friday acceptance still requires the exact approved deployment, existing
OpenAI/Twilio account/project/number bindings, signed ingress, consent/budget and
authorized real call/recipient. Verify a controlled interruption, real media,
no duplicate greeting/effect, received summary, terminal accounting and capacity
release. Unknown accept and missed terminal callbacks still need genuine
provider reconciliation; no credentials or account-bound polling are added.

Rollback uses an approved drained-call window and compatible source revert,
with no schema downgrade or destruction of receipts. Preserve unknown calls
for reconciliation rather than releasing them as a rollback shortcut. No source
publication, deployment, production write, paid call, held SSO operation or
stopped integration command occurred in this local implementation.
