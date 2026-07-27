# OperatorOS Phase 15 release-candidate notes

Status: **candidate only; not released**

## Candidate scope

- Consolidates OperatorOS authority for identity, sessions, tenants, roles,
  entitlements, billing, module registry, launch, and logout.
- Carries the locally verified Phase 2-14 shared services, module workflows,
  migration rehearsal, security headers, tenant/role negatives, bounded
  database shutdown, fail-closed provider behavior, dependency remediation,
  load baseline, and backup/restore evidence.
- Adds a non-secret build-time release manifest containing the exact Git
  commit, lockfile digest, build timestamp, and deterministic build ID.
- Makes production readiness fail closed when release identity is unavailable.
- Extends the public verifier to require a valid deployed commit and build ID.
- Makes the root package manifest compatible with Replit's automatic npm
  preinstall while retaining pnpm's scoped security overrides.

## Compatibility and operations

- Package manager remains pnpm `10.34.5`; the lockfile remains authoritative.
- Replit continues to build through `.replit` and starts through
  `scripts/start-unified-runtime.mjs`.
- Database changes remain governed only by the ordered release contract and
  `OPERATOROS_DATABASE_RELEASE_MODE=apply`.
- No module-local identity, billing authority, parent-domain cookie, URL token,
  or client-supplied tenant authority was added.

## Known release blockers

- The current public deployment is 31/48 and does not expose the candidate
  authorization transaction behavior.
- Deployment iteration 1 failed before build; the local fix requires a new
  reviewed deployment.
- Authenticated all-module workflows, two-tenant negatives, global logout,
  expiry, disabled entitlements, production backup/apply, live providers,
  monitoring alerts, and rollback rehearsal are not yet proven on the exact
  deployed revision.
- No module is state 5 or production-certified by these notes.
