# BrandForgeOS Phase 11A migration and cutover

## Source finding

The repository contains schemas and runtime code but no authorized frozen
database export. Local child tenant IDs cannot be assumed to map to OperatorOS
tenants. Phase 11A therefore provides a deterministic dry-run contract only;
no apply mode or production data mutation is authorized.

The dry-run verifies the pinned snapshot manifest, selected schema/route hashes,
approved mappings, exclusions, and authority boundaries. A future apply needs
an owner-approved export, immutable tenant/user mapping, duplicate policy,
reference/count reconciliation, file/provider exclusions, backup, rollback,
and a separate human gate.

## Authorized cutover checklist

1. Identify the reviewed commit and PostgreSQL version.
2. Capture and verify the provider snapshot and logical backup.
3. Review the ordered additive release and deterministic dry-run.
4. Apply only through the unified OperatorOS release supervisor.
5. Verify brands, personas, campaigns, copy assets, calendar, generation,
   exports, real analytics, viewer denial and second-tenant 404 behavior.
6. Require `/healthz`, `/readyz`, exact-host SSO, return, deep-link refresh,
   global logout and reauthentication on the deployed target.
7. Confirm child auth/billing/admin, random analytics, integrations and
   template-marketplace purchasing remain absent.
8. Record the deployed commit and reconciliation evidence before state 5.

## Rollback

Freeze writes, restore the verified pre-release backup into a new database,
start the matching prior OperatorOS revision, require auth/tenant/readiness/
browser gates, and switch traffic only after human review.
