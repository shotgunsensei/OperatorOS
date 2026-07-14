# Ninjamation Module

Status: OperatorOS-native MVP; external canonical source project not located.

- Canonical host: `https://ninjamation.operatoros.net`
- Commercial class: paid add-on
- Active UI: `apps/web/src/components/module-shells/NinjamationShell.tsx`
- Active API: `/v1/modules/ninjamation/automations`

The current tenant-gated implementation activates/deactivates bounded
automation templates in the shared runtime. OperatorOS owns identity, tenants,
roles, billing, entitlements, and audit. Before expanding into arbitrary
cross-module execution, add typed trigger/action schemas, per-module service
permissions, idempotency, rate/usage limits, secrets isolation, retries,
observability, and tenant-safe audit records.

The user still needs to identify or create and add the canonical standalone
Ninjamation Codex project if one exists. Until then, OperatorOS is the only
observed source of truth and no external snapshot is claimed.

