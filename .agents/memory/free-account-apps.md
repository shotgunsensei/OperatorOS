---
name: Free-with-any-account apps
description: How a tenant is granted a "free with any account" app, and how to flip a module live when it has no external URL.
---

# Free-with-any-account apps

Some apps (currently TorqueShed, FaultlineLab, Ninja Pool Hall) are free with
any OperatorOS account ($0), independent of any paid core product.

## Grant a free app via tenant_modules, not tenant_entitlements
The grant is `tenant_modules` (status `enabled`, source `included`,
`allow_all_members: true`) plus an owner `tenant_user_module_access` `manager`
row.

**Why:** `resolveTenantModuleAccess` only reads `tenant_modules` +
`tenant_user_module_access` for launchability. `tenant_entitlements` sources are
billing-oriented (e.g. `included_with_core`) and would be semantically wrong for
a free account that has no core subscription.

**How to apply:** grant on both signup and boot backfill, and make every insert
ON CONFLICT DO NOTHING so re-runs never stomp an owner's admin override.

## Flip a module live with no external URL
The SDK catalog seeder treats a module as a launchable `live` surface when it
has an external env URL **OR** `internal: true`. Setting `defaultStatus: 'live'`
alone is NOT enough — without a `*_URL` secret or `internal: true`, the seeder
keeps the module `coming_soon`.

**How to apply:** to launch a module that has no configured URL, set
`internal: true` on its catalog entry (this points baseUrl at an in-app
`/apps/<slug>` shell).
