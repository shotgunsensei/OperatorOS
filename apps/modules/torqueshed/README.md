# TorqueShed Module Import

Status: Phase 8 automotive foundation and Torque Assist source implemented in the shared runtime;
isolated-database/runtime verification remains blocked by the local Docker
daemon and consolidation state 4 is not yet claimed.

- Canonical host: `https://torqueshed.operatoros.net`
- Commercial class: free account module
- Source provenance and exclusions: `source/SOURCE_SNAPSHOT.json`

The snapshot remains a non-executed migration reference. It contains a legacy
token-query SSO receiver, long-lived child sessions, and a single-user tenant
projection; none is an active OperatorOS authority. Active vehicle,
mileage, maintenance, repair, parts/vendor/cost, build, reminder, diagnostic,
template, attachment, dashboard, and deep-link workflows live under
`/v1/modules/torqueshed/*`. Phase 8 adds server-context Torque Assist, strict
safety-ranked results, OperatorOS-owned package checkout and signed payment
webhook processing, and an append-only computed-balance token ledger.
Marketplace/community remain Phase 9. OperatorOS continues to own users, tenants,
roles, sessions, free-module grants, billing, and entitlement decisions.

Architecture and accounting boundaries are documented in
`docs/modules/torqueshed/TORQUE_ASSIST_ARCHITECTURE.md` and
`docs/modules/torqueshed/TOKEN_LEDGER.md`.

