# SSO Module Access

Before issuing or consuming an app handoff, OperatorOS verifies:

1. The user is authenticated and active.
2. The tenant exists and the user is a tenant member.
3. The tenant has an active entitlement whose key matches the app/module slug.
4. The user is within the tenant seat limit.
5. The module is launchable in the current environment.

Purchased core products are fully unlocked. Child apps should use the
OperatorOS entitlement snapshot or introspection endpoint as the access
authority and must not recreate feature-level pricing checks.

Seat assignment is deterministic: tenant owners and admins are prioritized,
then remaining members are ordered by join time. Memberships beyond
`tenants.seat_limit` remain in the tenant but cannot launch paid modules until
capacity is added or an active seat is freed.

Service-token introspection:

```text
GET /v1/sso/entitlements/introspect?user_id=<user>&tenant_id=<tenant>
```

Interactive viewers can inspect their current tenant snapshot through:

```text
GET /v1/entitlements/me
```
