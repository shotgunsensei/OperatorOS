# TorqueShed Module Import

Status: Phase 7 automotive foundation implemented in the shared runtime;
isolated-database/runtime verification remains blocked by the local Docker
daemon and consolidation state 4 is not yet claimed.

- Canonical host: `https://torqueshed.operatoros.net`
- Commercial class: free account module
- Source provenance and exclusions: `source/SOURCE_SNAPSHOT.json`

The snapshot remains a non-executed migration reference. It contains a legacy
token-query SSO receiver, long-lived child sessions, and a single-user tenant
projection; none is an active OperatorOS authority. Active Phase 7 vehicle,
mileage, maintenance, repair, parts/vendor/cost, build, reminder, diagnostic,
template, attachment, dashboard, and deep-link workflows live under
`/v1/modules/torqueshed/*`. Torque Assist/ledger and marketplace/community are
later phases. OperatorOS continues to own users, tenants,
roles, sessions, free-module grants, billing, and entitlement decisions.

