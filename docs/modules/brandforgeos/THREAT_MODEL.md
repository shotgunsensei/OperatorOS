# BrandForgeOS Phase 11A threat model

## Phase 39 platform-hardening overlay (2026-08-14)

Tenant/role/entitlement negatives, metered AI idempotency, provider secret
references, webhook/redirect validation, report/export integrity, and
BrandForgeOS-to-Launch-Kit provenance are release-gated by the platform threat
model and [Phase 39 register](../../phase-39/THREAT-MODEL-REGISTER.md).

| Threat | Control |
| --- | --- |
| Browser tenant override | No tenant route/body/header field is accepted as authority; validated session context scopes every query |
| Foreign brand/campaign references | References are reloaded with tenant and non-deleted predicates before writes; foreign IDs return the same 404 |
| UI-only authorization | Read/write/admin guards execute server-side; viewers cannot mutate or generate |
| Duplicate generation charges/results | Tenant/user/idempotency key uniqueness plus transactional result and usage commit |
| Provider prompt/response abuse | Bounded allowlisted inputs, fixed system prompts, response-size/schema checks, timeouts and safe errors |
| Token or prompt leakage | No provider key/client token in browser, URL, record, audit metadata or completion logs |
| Fake business analytics | Only persisted records and committed generation usage contribute; sample/random counters are prohibited |
| Cross-tenant exports | Export queries repeat trusted tenant scope and never accept tenant input |
| Unsafe URLs/uploads | Brand kits store bounded text/color/font fields; remote logo fetching and unscanned uploads are excluded |
| Child authority revival | Static tests reject source imports, child auth/billing/admin routes, local plan controls and provider credentials |
| Stale concurrent writes | Expected version is mandatory and database updates include tenant, ID, version and non-deleted predicates |
| Destructive deletion | User records use soft delete; platform hard-delete removes dependent rows transactionally and audits the action |
