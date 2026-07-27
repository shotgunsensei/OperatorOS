# OperatorOS Phase 15 production acceptance report

- Evidence date: 2026-07-27
- Candidate branch: `codex/phase-15-deployed-acceptance-fix2`
- Decision: **PUBLIC GATE PASSED; RELEASE STOPPED PENDING AUTHENTICATED ACCEPTANCE**
- State 5 certifications issued: **0**

## Executive result

The OperatorOS ecosystem is not yet accepted for production release. The
current deployment identifies exact merge
`c249a75396104e7aabd773e564be6a95ada56467`, build
`2eb701089a539d9e6da5af80`, and passes the contract-corrected 48/48 public
read-only gate. Authenticated end-to-end module workflows and production data
cutover have not been attempted.

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

## Deployment iteration 2

| Field | Evidence |
| --- | --- |
| Git revision | `c249a75396104e7aabd773e564be6a95ada56467` |
| Runtime build ID | `2eb701089a539d9e6da5af80` |
| Readiness | 200; database healthy; auth, SSO encryption, registry, worker, and release identity configured |
| Initial verifier | 32/48 after deployment; implementation behavior was correct but three verifier assumptions were stale |
| Verifier correction | Root authorization uses `/login`; transaction cookies use authoritative `operatoros_sso_*` names; Replit-reserved `/healthz` is checked through the same Fastify snapshot at `/api/health` |
| Focused regression | 8/8 middleware and production-verifier contracts pass |
| Public result | 48/48, no authentication or mutation |
| Production build | Pass after workspace typecheck |

## Current public read-only result

`corepack pnpm verify:production` ran on 2026-07-27 without authentication or
mutation: **48 passed, 0 failed, 48 total**.

Passed:

- API health/readiness and exact release identity.
- Authentication response headers.
- All 17 public host diagnostics.
- Root/app plus all 13 module PKCE authorization transactions, including
  state, nonce, S256, safe return, and host-only secure transaction cookies.
- All 13 registered module callbacks.
- OutCall's fail-closed callback boundary.

No public read-only check failed. This does not replace authenticated
acceptance.

## Acceptance sequence status

| Area | Result | Evidence/blocker |
| --- | --- | --- |
| Unauthenticated OperatorOS entry | PASS | 48/48 public gate on exact release |
| Configured test-user authentication | BLOCKED | No test-user credentials are configured in the acceptance environment |
| Entitled My Apps filtering | NOT RUN | Requires configured test user |
| TradeFlowKit CRUD/persistence | NOT RUN DEPLOYED | Local state-4 evidence only |
| PulseDesk CRUD/persistence | NOT RUN DEPLOYED | Local state-4 evidence only |
| TechDeck CRUD/persistence | NOT RUN DEPLOYED | Local state-4 evidence only |
| TorqueShed diagnostics/Assist/ledger/community/marketplace | NOT RUN DEPLOYED | Module remains state 3 |
| Return navigation/deep links/refresh | NOT RUN AUTHENTICATED | Requires configured test user |
| Coordinated logout/expired session | NOT RUN AUTHENTICATED | Requires configured test user |
| Disabled entitlement | NOT RUN AUTHENTICATED | Requires configured test user/tenant |
| Second-tenant isolation | NOT RUN AUTHENTICATED | Requires two configured test tenants |
| Unauthorized direct API calls | NOT RUN AUTHENTICATED | Requires configured sessions |
| Production build | PASS LOCALLY | Fresh Phase 15 production build completed |
| Health/readiness | PASS PUBLICLY | API health and exact readiness identity pass |
| Backup/restore | PASS LOCALLY, NOT RUN PRODUCTION | Phase 14 disposable rehearsal only |
| Provider acceptance | NOT RUN | Live Stripe/Twilio/OpenAI/scanner configuration is human-gated |

## Release closure requirements

The exact deployed candidate passes 48/48. Next, run the complete acceptance
sequence with configured test users and two
tenants, preserve request/response/log evidence for every failure, and re-run
related regressions after each correction. Production backup, database apply,
provider use, promotion, and rollback remain explicit human gates.

No production-ready or state-5 claim is authorized by this report.
