# OperatorOS production acceptance report

- Evidence date: 2026-07-29
- Candidate branch: `codex/phase-17-production-truth`
- Decision: **PHASE 17 DEPLOYABLE CANDIDATE; NOT DEPLOYED; RELEASE STOPPED**
- State 5 certifications issued: **0**

## Phase 17 result

Current public health/readiness identifies commit
`48b8691fca5c8a8d79f53b309cb44db79698bbcd`, build
`932f83cb0d7c15ce994eb04e`. That commit matched refreshed `origin/main` at the
start of the phase and passed the pre-Phase-17 48/48 public verifier.

The Phase 17 branch establishes one complete, non-secret release identity:
Git commit, deterministic build ID, lockfile hash, build timestamp, deployment
timestamp, and database release v29/29. It also corrects the documented
planned OutCall boundary by disabling it in the deployment registry and
reconciling its persisted catalog status to `coming_soon`.

Fresh isolated candidate evidence passes 46/46 focused contracts, clean and
idempotent 29-step release, workspace typecheck, production build/core
preflight, compiled supervisor health/readiness, and three focused
production-host browser gates. Those browser gates cover all 12 enabled module
hosts, PKCE/host-only sessions, deep links, silent sibling SSO, local/global
logout, entitlement denial, planned OutCall denial, and no credential
URL/storage leakage.

The strengthened verifier returns 45/48 against the unchanged public release:
the two public health snapshots lack the new deployment/database identity and
the old OutCall callback still renders. This is an expected pre-deployment
failure. The exact remaining owner actions and commands are recorded in
`docs/PHASE17_PRODUCTION_RELEASE_RUNBOOK.md`; full evidence is in
`docs/PHASE17_PRODUCTION_EVIDENCE_REPORT.md`.

## Executive result

The OperatorOS ecosystem is not yet accepted for the Phase 17 production
release. The current deployment is the healthy pre-phase baseline; the Phase
17 candidate has not been merged or deployed. No production data cutover has
been attempted.

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

## Historical Phase 15 public read-only result

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

## Historical Phase 15 acceptance sequence status

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

## Phase 17 release closure requirements

Merge and deploy the Phase 17 pull request through the existing Replit
workflow, require 48/48 from the commit-pinned public verifier, then require
3/3 from the production-safe authenticated gate with the two pre-provisioned
synthetic accounts. Production backup, provider use, promotion, and rollback
remain explicit human gates.

No production-ready or state-5 claim is authorized by this report.
