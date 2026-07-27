# OperatorOS Phase 15 production acceptance report

- Evidence date: 2026-07-27
- Candidate branch: `codex/phase-15-deployed-acceptance`
- Decision: **RELEASE STOPPED**
- State 5 certifications issued: **0**

## Executive result

The OperatorOS ecosystem is not accepted for production release. The current
public deployment passed 31 of 48 hardened read-only checks. The first Phase 15
deployment attempt failed during Replit's automatic package installation,
before the repository build, runtime supervisor, or database release ran.
Consequently, authenticated end-to-end module workflows and production data
cutover were not attempted.

## Deployment iteration 1

| Field | Evidence |
| --- | --- |
| Deployment ID | `0a34bd3d-5706-434d-87ee-fffd3bf6e5cd` |
| Build ID | `c49eeb9c-5f0b-40b3-9f31-44813446124c` |
| Stage | Replit security scan automatic `npm install` |
| Failure | `npm ERR! code EINVALIDTAGNAME` |
| Responsible repository | `OperatorOS` |
| Root cause | Root `package.json` duplicated pnpm-only `parent>child` override selectors; npm parsed them as invalid package/tag names |
| Fix | Removed npm-invalid duplicate selectors from the root manifest, retained them in `pnpm-workspace.yaml`, and used npm `$name` references for direct Vite/ws overrides |
| Regression | npm install dry-run, frozen pnpm install, zero-vulnerability audit, 5/5 focused contracts, workspace typecheck, and production build pass |
| Runtime/database effect | None; build did not start |
| Rollback | Not required; prior deployment remained active |

## Current public read-only result

`corepack pnpm verify:production` ran on 2026-07-27 without authentication or
mutation: **31 passed, 17 failed, 48 total**.

Passed:

- Authentication response headers.
- All 17 public host diagnostics.
- All 13 registered module callbacks.
- OutCall's fail-closed callback boundary.

Failed:

- `https://operatoros.net/healthz` returned 404.
- API readiness did not expose the required release commit and build ID.
- Anonymous apex `/app` did not produce the registered PKCE authorization
  request.
- The app host and all 13 module authorization responses lacked the expected
  state, nonce, and PKCE verifier transaction cookies.

This remains evidence of the older public runtime, not acceptance of the Phase
15 candidate.

## Acceptance sequence status

| Area | Result | Evidence/blocker |
| --- | --- | --- |
| Unauthenticated OperatorOS entry | FAIL | Apex health/auth behavior does not match the candidate |
| Configured test-user authentication | NOT RUN | Public deployment gate failed |
| Entitled My Apps filtering | NOT RUN | Authenticated gate unavailable |
| TradeFlowKit CRUD/persistence | NOT RUN DEPLOYED | Local state-4 evidence only |
| PulseDesk CRUD/persistence | NOT RUN DEPLOYED | Local state-4 evidence only |
| TechDeck CRUD/persistence | NOT RUN DEPLOYED | Local state-4 evidence only |
| TorqueShed diagnostics/Assist/ledger/community/marketplace | NOT RUN DEPLOYED | Module remains state 3 |
| Return navigation/deep links/refresh | NOT RUN DEPLOYED | Candidate not running publicly |
| Coordinated logout/expired session | NOT RUN DEPLOYED | Candidate not running publicly |
| Disabled entitlement | NOT RUN DEPLOYED | Candidate not running publicly |
| Second-tenant isolation | NOT RUN DEPLOYED | Candidate not running publicly |
| Unauthorized direct API calls | NOT RUN DEPLOYED | Candidate not running publicly |
| Production build | PASS LOCALLY | Fresh Phase 15 production build completed |
| Health/readiness | FAIL PUBLICLY | Apex health is 404; candidate release identity not deployed |
| Backup/restore | PASS LOCALLY, NOT RUN PRODUCTION | Phase 14 disposable rehearsal only |
| Provider acceptance | NOT RUN | Live Stripe/Twilio/OpenAI/scanner configuration is human-gated |

## Release closure requirements

The next exact candidate must be deployed through `.replit`, expose its full
commit and build ID in `/readyz`, and pass 48/48 before authenticated testing.
Then run the complete acceptance sequence with configured test users and two
tenants, preserve request/response/log evidence for every failure, and re-run
related regressions after each correction. Production backup, database apply,
provider use, promotion, and rollback remain explicit human gates.

No production-ready or state-5 claim is authorized by this report.
