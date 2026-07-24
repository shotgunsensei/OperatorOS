# BrandForgeOS Phase 11A parity matrix

Assessment date: 2026-07-23

Candidate status: implementation and local verification in progress. This
document does not claim consolidation state 5 or production readiness.

## Provenance

The clean standalone checkout and quarantined snapshot resolve to
`5e78bc2ee6c8086ddd589bb7416f1d4560ffbb4e`. The snapshot records 348 tracked
files, 272 retained files, 1,254,117 bytes, and zero high-confidence secret
findings. The child runtime, dependencies, server, and migrations are not used.

## Capability disposition

| Source capability | Source reality | Phase 11A disposition |
| --- | --- | --- |
| Auth, tenants, members | Replit OIDC/mobile token plus local tenants/memberships | Exclude; OperatorOS SSO/session/tenant/member authority only |
| Plans, billing, credits, admin | Child subscription, credit, plan and platform-admin mutation | Exclude; OperatorOS billing/entitlement/usage authority only |
| Brands | Persistent CRUD | Retain as versioned tenant-scoped brand kits |
| Personas | Persistent CRUD | Retain as versioned tenant-scoped audience personas |
| Campaigns | Persistent CRUD with loose status/budget/reference rules | Retain with strict lifecycle, tenant-valid references and integer budget |
| Copy assets | Persistent CRUD plus AI variants | Retain with lifecycle, references, versions and generated provenance |
| Calendar | Persistent CRUD | Retain with validated dates/status/references |
| AI copy/strategy/ideas | Real provider call, but non-atomic child credit mutation | Route through OperatorOS provider, idempotency and shared usage |
| Dashboard | Real counts mixed with random analytics | Replace with persisted counts and derived channel/status/date series |
| Reports/exports | Persisted jobs without guaranteed output | Provide synchronous real JSON/CSV exports; no fake file job |
| Integrations | Connection and sync actions include random counters | Exclude until provider OAuth/webhook contracts exist |
| Templates marketplace | Global/tenant templates mixed with prices/purchases | Exclude marketplace/billing; no fake catalog |
| Onboarding/settings | Mutates child tenant name/plan profile | Store module workspace settings only; link shared admin surfaces |
| Notifications/activity | Duplicate tables | Use shared OperatorOS activity/notifications |

## Completion boundary

State 4 requires persistent workflows, restart persistence, tenant/user
non-enumeration, viewer denial, versions/idempotency, deterministic import
reconciliation, a clean ordered release, production build/start, health,
canonical deep-link refresh, SSO return/logout, and local production-host
browser acceptance. State 5 additionally requires the exact revision deployed
and accepted on the target environment with an authorized data cutover record.
