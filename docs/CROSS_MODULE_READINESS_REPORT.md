# Cross-module readiness report

Assessment date: 2026-07-16. Scope: OperatorOS, TradeFlowKit, PulseDesk,
TechDeck, and TorqueShed in the consolidated `C:\Dev\OperatorOS` runtime.

## Release rule

No row may be marked production-ready until authenticated SSO, return
navigation, persisted functionality, server authorization, cross-tenant
isolation, production build, live health/readiness, and end-to-end browser
tests all pass in the target deployment.

## Current matrix

| Module | Real shared-runtime workload | Auth/tenant enforcement | Build | DB tests | Live health | Browser E2E | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- |
| OperatorOS | Identity, tenant, entitlement, billing, audit, launcher | Local SSO/RBAC/tenant tests pass | Pass | Pass | Local pass; deployed target not run | Local 2/2; deployed target not run | **Not production-ready** |
| TradeFlowKit | Leads, customers, jobs, quotes, invoices, manual payments | Server guards, persistence, viewer denial, and cross-tenant tests pass | Pass | Pass | Shared local runtime pass; deployed target not run | Shared local SSO/shell pass; deployed target not run | **Not production-ready** |
| PulseDesk | Departments and PHI-minimized operations escalation queue | Server guards, manager capability, persistence, and cross-tenant tests pass | Pass | Pass | Shared local runtime pass; deployed target not run | Shared local SSO/shell pass; deployed target not run | **Not production-ready** |
| TechDeck | Tickets, assets, approval-gated runbooks | Server guards, assignment, approval, audit, and cross-tenant tests pass | Pass | Pass | Shared local runtime pass; deployed target not run | Shared local SSO/deep-link pass; deployed target not run | **Not production-ready** |
| TorqueShed | Persistent diagnostic-case CRUD and status workflow | Server guards, persistence, viewer denial, and cross-tenant tests pass | Pass | Pass | Shared local runtime pass; deployed target not run | Shared local SSO/shell pass; deployed target not run | **Not production-ready** |

## Final E2E acceptance update

The full 35-step production-host browser sequence was executed locally on
2026-07-16. It emitted 28 passing evidence records and 10 failures. Shared SSO,
exact My Apps entitlement filtering, module launch/return, global logout and
revocation, implemented-data persistence, expired-session handling, disabled
entitlements, foreign-tenant denial, unauthorized API denial, production
builds, health/readiness, and primary navigation checks passed.

Release remains blocked by missing persistent product contracts: TradeFlowKit
projects/tasks; PulseDesk clients/contacts/assets/tickets/internal notes/time
entries; TechDeck clients/sites/VLANs/subnets; and TorqueShed first-class
vehicles/diagnostic sessions/trouble codes/measurements, Torque Assist, token
ledger, marketplace/community, and `/diagnostics` deep route. See
`docs/FINAL_E2E_ACCEPTANCE_REPORT.md` for captured URLs, request IDs, responses,
retests, and the final matrix.

## Hardening delivered in this pass

- One shared module header/configuration for My Apps, Profile, Billing,
  Support, globally coordinated logout, module name, current tenant, and user.
- Rolling session refresh inside the final 24 hours with scope preservation and
  revocation of the replaced token fingerprint.
- Production JSON logging, request IDs, safe user/tenant/module correlation,
  and secret redaction.
- Database-aware readiness with auth/SSO/registry and optional dependency
  state.
- Non-migrated workflow cards explicitly say `Migration pending — disabled`.
- Shared integration, error, health, and backup/restore contracts.

## Known release blockers

- The local production-host SSO browser matrix passes, but it must be rerun
  against the deployed target to prove its proxy, cookies, callback routing,
  direct deep links, return navigation, sibling tabs, and global logout.
- `/healthz` and `/readyz` pass through the local HTTPS host-preserving proxy;
  both must pass against the deployed production database and SSO secret.
- Optional providers are not module readiness claims. Provider-backed UI must
  stay disabled until its configuration and signed webhook/callback tests pass.
- Database restore has documentation but still requires a recorded rehearsal.

## Verification evidence

- `corepack pnpm typecheck`: pass across API, runner gateway, and web.
- `INTERNAL_API_URL=http://localhost:5001 corepack pnpm build`: pass for API,
  runner gateway, and the Next production build. The API production entrypoint
  also started from compiled output; an unconfigured web build failed safely
  on the missing API URL as designed.
- Full isolated-PostgreSQL API suite: 671 tests, 665 passed, 0 failed, 6
  explicit live-HTTP skips. The aggregate covers auth/SSO, server-side RBAC,
  tenant masking and cross-tenant denial, module persistence, entitlement,
  audit, and API contracts for all five assessed products.
- Focused ecosystem contract suite: 30/30 passed.
- Post-fix focused ecosystem/navigation suite: 15/15 passed; targeted
  database-backed tenant/module RBAC suite: 8/8 passed.
- Production-host HTTPS Playwright SSO matrix: 2/2 passed locally across the
  canonical app host and all 12 enabled module hosts, including direct
  TechDeck deep-link return, silent PulseDesk sibling launch, clean URLs,
  host-only cookies, local logout, and global revocation.
- Local shared runtime: `operatoros.net/healthz` returned 200 and
  `api.operatoros.net/readyz` returned 200 with database, auth, SSO encryption,
  and module registry healthy/configured.

The imported module source trees are quarantined migration snapshots, not
independent deployable repositories. Their production behavior is therefore
validated through the consolidated OperatorOS build, database suite, shared
API, and host-routed browser matrix. Every module remains explicitly not
production-ready until deployed-target health and browser gates pass and a
restore rehearsal is recorded.
