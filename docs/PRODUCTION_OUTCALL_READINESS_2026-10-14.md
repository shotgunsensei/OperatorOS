# OperatorOS and OutCall readiness candidate — 2026-10-14

Historical first-pass evidence for `2f943eed...` and v66 is preserved below.
The bounded continuation adds exact country validation, account resource controls
and additive v67 storage. Its current requirements, verification and remaining
gates are in [the v67 control ledger](outcall/RESOURCE_CONTROLS_V67_2026-10-14.md).
The original geography/aggregate source blockers below are addressed locally;
operator approval, publication, migration and live acceptance remain open.

Verdict: bounded source/local repairs verified; production launch remains
blocked. OutCall is still coming soon. No new module is live accepted.

Branch: `codex/production-outcall-readiness-oct14`, based on preserved
CallCommand `31b00596` and main
`887abe5d7e0bb48aa60987d18bdece8b6a5a779e`. The candidate retains the entire
CallCommand change and all v66 source work. Existing worktrees and untracked
files were not reset, overwritten or cleaned. No remote, provider, billing,
credential or production-database mutation occurred.

## Product and release truth

OutCall provides discreet personal exit-assistance calls to the authenticated
user's own verified mobile. It has neutral profiles, private exact-match SMS
triggers, immediate/delayed schedules, cancellation, history and private
export/deletion. It is not an outbound business campaign system. There is no
arbitrary recipient import, recording, emergency dispatch, caller spoofing,
trusted-contact escalation or autonomous bulk dialing in this slice.

The catalog is `coming_soon` and registry is planned/disabled. Several old
OutCall architecture/checklist/README statements said active; those are now
corrected. Entitlement, privacy keys, controlled Twilio activation and deployed
acceptance are independent of a navigation entry or configured flag.

Anonymous public probes at approximately 14:43 UTC returned health/readiness
200, commit `7c212305597b77695565f3ec4c7dffcf86149919`, build
`ef276f880c39aa41fc661dca`, schema v65/65. Readiness reported healthy database,
worker and queues, configured email/Stripe/Twilio/OpenAI, and unconfigured
shared provider control plane. These flags do not prove successful settlement,
email receipt, model inference or calls. Public home, pricing, app catalog,
signup redirect and `/api/billing/catalog` also responded successfully. The
anonymous OutCall host currently starts an auth-host redirect even though
its launch is unavailable; the candidate shows its unavailable state first.

Production commit `7c212305...` remains absent from the local object database.
Its Replit ancestry/tree is not reconciled. Do not reset or blindly sync it.
The candidate expects v66. Dedicated v65 patch `e274035f...` and integrated
main patch `36458021` have equal contents for their five runtime/test billing
files (verified with a scoped Git diff). This preserves the patch's source
behavior; it does not establish deployed signature recovery or webhook replay.
Reported Stripe retry deadline remains **2026-10-16 18:07:59 UTC** until verified.

## Changes and evidence

| Customer/safety result | Implementation | Local verification | Remotely merged | Deployed | Live accepted |
| --- | --- | --- | --- | --- | --- |
| Unavailable OutCall host does not send users into doomed sign-in | Shared middleware renders existing unavailable module state before auth; callback/auth/security boundaries retained | Actual Next middleware test for root and deep paths; registry/login/pricing set 45/45 | No | No | No |
| Delayed calls stop after access revocation | Re-resolve canonical current user/tenant/module membership, entitlement and write access; require matching job actor; recheck safety, phone owner and destination integrity before provider | 7 revocation variants inside database test; no usage/submission on denial | No | No | No |
| Signed SMS cannot bypass a viewer grant or STOP | Canonical write decision at ingress and handler; suppression at ingress/handler/delayed execution; web self-call consent remains separate | Signed viewer and STOP tests; no call queued and no ordinary SMS reply after STOP | No | No | No |
| Completion does not regress on late callbacks | First terminal state/failure retained; unknown provider status rejected; signed recovery clears uncertainty and records acceptance usage once | Late ringing/in-progress/conflicting failure, failed→completed conflict, unknown status, replay tests | No | No | No |
| Uncertain carrier submission does not redial | 15-second fetch deadline; lost/invalid response or carrier 5xx stays unconfirmed; accepted then DB failure preserved; expired processing lease marks uncertainty; signed callback can reconcile | Synthetic lost response, malformed response, 5xx, accepted/DB-failure, expired-lease and matching-callback tests | No | No | No |
| Retry does not silently create another call intent | UI retains request payload/key until resolved; API returns existing owner-bound receipt before new-time/provider/rate checks; mismatched reuse is 409 | Browser lost-response retry uses one key; DB receipt retry consumes no new rate and does not enqueue twice | No | No | No |
| Older pending calls remain cancelable | Render all returned rows; owner-scoped keyset pages beyond latest 100, owner-scoped exact detail and cancellation | 105-record fixture; foreign cursor/detail 404; desktop 1280px and mobile 390px component cancellation | No | No | No |
| Honest availability and recovery | Readiness on every route, configured versus activation distinction, test mode says no real calls; visible polling, load retry, unconfirmed outcome guidance and correctable definitive rejection | 5 component browser cases pass without overflow | No | No | No |
| Earlier CallCommand work preserved | Branch descends from `31b00596`; no CallCommand source changed | 39 selected realtime/lifecycle/handoff compatibility checks pass; prior 187-test evidence remains historical | No new publication | No | No |

## Verification environment and commands

Windows Xodus-John, Node 24.16.0, pnpm 10.34.5; frozen offline install with
zero downloads. Test children receive only OS/tool variables plus synthetic
test configuration. No inherited GitHub, provider, database or signing
credentials are passed. Two explicitly disposable databases in the task-owned
PostgreSQL 16 container use loopback port 55471. Tests never target production.

The task-local `release-checks.mjs` invokes these exact repository commands:

- OutCall: `corepack pnpm --dir apps/api exec tsx --test --test-concurrency=1 test/outcall-adapter.test.ts test/outcall-provider.test.ts test/outcall-phase12b-db.test.ts test/outcall-phase50-routes.test.ts` — **23 passed, 0 failed/skipped/canceled/todo**.
- Platform: same runner with `public-pricing-catalog.test.ts`, `platform-pricing-driftfix.test.ts`, `pricing-selection.test.ts`, `marketing-pricing-shape.test.ts`, `operatoros-module-registry.test.ts`, `middleware-login-routing.test.ts` — **45 passed, no failures/skips**.
- Compatibility: same runner with `callcommand-realtime-route.test.ts`, `callcommand-realtime.test.ts`, `callcommand-phase35-realtime-handoff.test.ts`, `callcommand-phase35-lifecycle.test.ts` — **39 passed, no failures/skips**.
- UI: `corepack pnpm --dir apps/web exec playwright test --config playwright.outcall-component.config.ts` — **5 passed, no retries/skips**. Actual workspace component, real React/Web Crypto, real canonical colors, synthetic API/navigation boundaries and intercepted loopback document. This does not prove deployed SSO or real telephony.
- `corepack pnpm lint` — passed, zero warnings.
- Four-workspace `corepack pnpm typecheck` and production build stages passed locally; final committed artifact identity is recorded separately with the handoff.
- Changed API tests pass strict standalone TypeScript compilation with ES2022/NodeNext, JSON resolution and strict mode.
- Separate empty rehearsal DB: supported root `db:apply` passed 66 steps in 18,875ms; immediate repeat apply passed in 1,908ms; independent `db:verify` reported v66/66 in 1,212ms. No production upgrade or backup is inferred.
- Task-local `node release-smoke.mjs` starts the real readiness-gated production supervisor against the disposable v66 DB with provider credentials absent and explicit artifact-test isolation. Health/readiness, pricing, unavailable OutCall page and signup routing pass **5/5**. It stops only its own process tree. The final committed build/smoke receipt is preserved separately; earlier uncommitted artifact identity must not be presented as a deployed candidate.

Logs/completion receipts: ignored `build/production-outcall-oct14/`. Initial UI
fixture attempts failed on React alias resolution, palette/chrome CSS imports,
an insecure about:blank origin and an already-verified phone fixture. The
fixture was corrected; no production guard was relaxed. Final 5/5 is the only
accepted UI result. No full monorepo API, exhaustive security scan, exact-host
authenticated deployment E2E or real process-kill test is claimed.

## Remaining gates and smallest owner actions

1. **Credential hold — pending.** Parent must confirm private revocation and a
   verified unaffected authentication path before authenticated GitHub writes,
   push, PR, merge or publication. This task never read, printed, used or
   transmitted the inherited PAT. No Actions CI or paid hosted CI was started.
2. **Replit reconciliation/production v66 — pending.** Inspect/preserve actual
   Replit changes, identify the selected development and production targets,
   obtain verified recoverable snapshot/logical-backup/restore receipts and
   the specific migration approval, then perform supported ordered apply/verify.
   Routine serving remains verify-only. A source candidate is not a release
   receipt or a production backup. See `DATABASE_BACKUP_RESTORE.md`.
3. **Stripe recovery — unverified.** Inspect current masked dedicated signing
   binding, serving generation and rejected-event evidence; prove valid signed
   settlement and eligible retry/replay before the reported deadline. Public
   catalog configured flags and equal patch files do not close this incident.
4. **OutCall geography and aggregate controls — source blockers.** Existing
   +1-prefix US/CA check admits other NANP territories and cannot enforce a
   US-only allowlist. Implement reviewed country determination before Verify
   and voice. Approve then enforce tenant/account daily spend/reservations and
   concurrency; current per-user 5/5min call and 5/15min SMS rates are not a
   monetary ceiling. No budgets, rates, subscriptions or offers were guessed.
5. **Provider/commerce setup — pending.** Verify existing owned voice/SMS number,
   Verify service, canonical signed callbacks, protection-key ownership/rotation,
   country permissions, messaging compliance, entitlements and intended billing
   enrollment. Do not reuse CallCommand test approval or alter its provider
   configuration. No credential generation, account creation, purchases or
   top-ups are authorized here.
6. **Controlled live acceptance — requires specific approval.** Parent must get
   the exact personally owned test number, verification/SMS/voice sequence and
   maximum cost allowance, then coordinate a reviewed release and test. The
   approved CallCommand email/transfer target is not OutCall authorization.
   Capture correlated Verify, call, DTMF, final status, cancellation, suppression,
   outage, real process death and reconciliation without repeat calls. An
   unresolved call remains unconfirmed and blocks privacy deletion until a
   signed callback or independently reviewed carrier reconciliation resolves it.
7. **Main customer acceptance — pending.** Deployed non-admin sign-up/login,
   verified email, exact-host SSO/deep links/logout, tenant/role denial, paid
   entitlement settlement, mobile/accessibility and recovery need production
   browser evidence. CUA again failed to initialize with MXC HRESULT 0x80070003;
   successful headless component tests do not restore that authenticated UI path.

Application rollback is the scoped source revert on a verified compatible
release. This patch adds no migration. Existing v66 remains additive and
requires its own approved production promotion; a v65 application cannot be
assumed compatible with a v66 ledger. Data recovery remains restore into a new
approved database, validation and explicit traffic-switch authority.
