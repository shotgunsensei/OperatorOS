# CallCommand canonical adapter and process restart proof

This is the historical signed-replay proof at `92fd545d`. The later isolated
[automatic recovery candidate](AUTOMATIC_RECOVERY_2026-10-22.md) adds bounded
reattachment for positively confirmed calls. It does not retroactively change
the results or limitations recorded for this earlier snapshot.

Implementation verified locally; deployment and real-provider acceptance remain unverified.
This bounded follow-on is based on combined local candidate
`27589d3b61541d7e4e88dc5d030febb15cb29b7e`. The published Lunch Break baseline,
component branches and production configuration remain unchanged.

## Demonstrated defect and correction

The actual signed incoming route returned HTTP 400 before accepting a call:
`Realtime JSON must use plain objects`. The canonical
`buildOpenAiRealtimeAcceptConfig` compiler in `callcommand-number-provider.ts`
produces validated null-prototype tool schemas. The route passes these into the
actual `OpenAiRealtimeSipAdapter`, whose second validation rejected them.
Earlier route fixtures replaced that adapter and did not prove this composition.

The adapter now permits `Object.prototype` and null-prototype JSON objects.
It still copies/revalidates every key/value and rejects custom prototypes,
`__proto__`/`prototype`/`constructor` keys, excessive depth/nodes/arrays/objects,
invalid text and nonfinite numbers. No tool, provider, model or authorization
allowlist is widened. There is no schema, worker, routing or provider change.

The direct compiler-to-actual-adapter regression failed against the original
runtime (7 passed, 1 failed), then passed with the bounded correction. Explicit
custom/nested prototypes, banned null-prototype keys, nested `__proto__`, depth
and array limits still fail before any synthetic provider action.

## New process-death journey

This is one new lifecycle test with seven checkpoints, not the stopped
108-case integration action or a substitute for a complete platform pass.
It uses actual PostgreSQL 16.14, the actual OpenAI SDK's local signature
verification, real route-token HMAC and actual registered incoming route.
Only remote provider operations and media sockets are synthetic.

1. A forged signature returns 401 before any provider action or socket.
2. Valid incoming data persists connected ownership, accepts once and greets
   once. The harness verifies its own child PID and random IPC marker, then
   terminates that exact OS child with SIGKILL.
3. A fresh process receives an immediate signed replay, returns duplicate and
   opens no socket while the prior durable processing lease remains current.
4. The test waits for the actual persisted 30-second lease to expire, without
   modifying its timestamp. A newly signed replay reattaches once, changes
   durable owner/attempt, and repeats neither accept nor greeting. Another replay
   remains duplicate.
5. A conflicting signed event cannot rebind the provider call (409).
6. After the second verified process kill, a third fresh process rechecks the
   current tenant module authority; disabled access returns 403 without a socket.
7. The actual terminal-domain reconciliation records terminal usage once and
   releases the lane. A second reconciliation is duplicate; an ended call cannot
   reattach (409). This step does not exercise the signed Twilio HTTP callback.

All three owned child exits are recorded: two verified SIGKILL exits and one
graceful code-0 exit. All 35 checked tenant/user/module row counts are zero and
the parent database pool closed. The exact cached, task-labelled, loopback-only
tmpfs container was identity-verified, stopped and removed; port 55521 is
bindable afterward. An optional independent CIM process query was unavailable
under the sandbox and is recorded as unavailable; child lifecycle evidence
comes from the harness's own exit events.

## Exact completed checks and evidence

From the task workspace, with `run.cjs` constructing a sterile environment and
blocking TCP except `127.0.0.1:55521`, all TLS and global fetch:

| Command | Completed result |
| --- | --- |
| `node evidence/resume-oct22/callcommand-restart/run.cjs unit unit-v1` | 32 passed, 0 failed, 0 skipped across number-provider, realtime and composition tests |
| `node evidence/resume-oct22/callcommand-restart/run.cjs restart process-v5` | 1 passed, 0 failed, 0 skipped; seven journey checkpoints; about 39 seconds |
| `node evidence/resume-oct22/callcommand-restart/run.cjs strict strict-final-v1` | Strict compilation of the four new test files and their imports passed |
| `node evidence/resume-oct22/callcommand-restart/run.cjs lint lint-final-v1` | Changed runtime and four new test files passed, zero warnings |
| `node evidence/resume-oct22/callcommand-restart/run.cjs api-types api-types-v1` | Complete API `tsc --noEmit -p apps/api/tsconfig.json` passed |
| `node evidence/resume-oct22/callcommand-restart/run.cjs sdk-build sdk-build-v1` | SDK TypeScript compilation passed |
| `node evidence/resume-oct22/callcommand-restart/run.cjs api-build api-build-v1` | API emitted TypeScript compilation passed after SDK compilation |

Private receipts/logs and final source hashes are under
`evidence/resume-oct22/callcommand-restart/` in the task workspace. The final
`CANDIDATE.json` binds the local commit, changed files, logs, runtime dependency
versions, failed baselines and cleanup evidence. Existing installed assets were
reused without acquisition; these checks are not a canonical frozen-lockfile
installation, full web production build or full platform CI pass.

Retained failed preparation receipts distinguish sandbox loopback EACCES, a
missing synthetic `consent_script` fixture field and a strict-check configuration
omission from the reproduced runtime mismatch. Exact partial fixture cleanup is
recorded. No failed result was relabelled as a full pass.

## Recovery limit and Friday acceptance

Recovery requires a newly signed replay after lease expiry. There is no
autonomous sideband reattachment worker, and immediate delivery before expiry
is acknowledged as duplicate. Success depends on a later signed delivery; the
test signs a new envelope over the same persisted body after waiting for expiry.
It does not establish a provider's retry cadence, raw-body stability, signature
delivery through actual ingress, media survival, multi-replica reconnection,
long-call operation, mailbox receipt or human transfer answer.

Current CallCommand UI source does not promise automatic active-call restart
recovery. The selected architecture still specifies abandoned-lease/provider
reconciliation (`CALLCOMMAND_COMMERCIAL_RUNTIME_ARCHITECTURE.md:217`) and bounded
worker-interruption/missed-callback behavior (failure rows at lines 334 and 338;
acceptance at line 365). Those production outcomes remain requirements, not
implemented automatic recovery proven by this test. Historical
`INBOUND_OUTCOME_2026-10-14.md:164-168` and
`POST_REBOOT_PREFLIGHT_2026-10-14.md:54-59` already record the absence of an
autonomous recovery scanner. This proof closes the real local process-kill
evidence gap only.

Before production sign-off, the owner must confirm the serving runtime and
approved fallback/reconciliation behavior under a real interrupted call, plus
existing account/project/number/routing/consent/budget, signed ingress, received
summary and controlled live acceptance gates. No live call, account, recipient,
credential, security setting, production database, publication, merge or
deployment was used here. The held SSO file was not read, edited, executed or
published; the stopped integration command was not retried.

Rollback of this isolated correction is a scoped source revert on a compatible
reviewed release. It requires no database downgrade, key rotation or provider
configuration change. Local acceptance does not authorize activation.
