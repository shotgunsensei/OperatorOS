# Phase 39 RBAC and entitlement matrix

OperatorOS is the sole identity, tenant membership, role, subscription and
module-entitlement authority. Module guards may narrow authority but may never
widen it. Record IDs from another tenant are returned as masked not-found or
forbidden responses according to the route contract; they are never projected
into the caller tenant.

| Capability class | Owner | Admin | Member/technician | Viewer/requester | Additional server gate |
| --- | --- | --- | --- | --- | --- |
| Read tenant/module records | allow | allow | allow when assigned/module policy permits | scoped read only | active membership plus module entitlement |
| Create/update ordinary work | allow | allow | allow by module role/assignment | deny except explicit requester reply/intake | tenant predicate, validation, optimistic/idempotency control |
| Delete/archive/restore ordinary work | allow | allow when module policy permits | usually deny or archive own draft only | deny | tenant predicate and audit |
| Team, role, tenant or provider administration | allow | allow where tenant policy delegates | deny | deny | tenant-admin guard plus feature entitlement |
| Billing, plans, global flags and cross-tenant administration | platform super-admin/owner only | deny unless explicit platform role | deny | deny | OperatorOS billing/platform authority and audit |
| Premium AI, exports, integrations, realtime or workflow destination | plan feature must allow | plan feature must allow | plan feature plus module role | plan feature plus scoped read, where supported | server-side entitlement/usage meter at execution time |
| Public intake/share/status | token/policy scoped, not membership-derived | token/policy scoped | token/policy scoped | token/policy scoped | entropy/hash, expiry/revocation, rate, content and tenant-routing controls |
| Runner or script execution | no unified-runtime authority | no unified-runtime authority | no unified-runtime authority | no unified-runtime authority | production runner disabled; future isolated gateway requires separate approval policy |

## Required negative matrix

Every table-backed route family must prove at least: unauthenticated denial,
wrong-tenant non-enumeration, viewer/requester write denial, member admin denial,
missing-module denial, missing-feature denial, revoked-entitlement denial and
record-restart persistence. Public routes substitute invalid/expired/revoked
token and rate-limit/spoof/replay negatives. Provider callbacks additionally
require missing/invalid signature and replay fixtures.

The cumulative API suites and module-specific Phase 26–38 tests are the
executable evidence. Phase 39 adds production-preflight, runner-boundary,
worker/readiness, security-scan, dependency-patch, accessibility/performance
and recovery gates; it does not weaken earlier module tests.
