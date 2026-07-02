# OperatorOS Entitlements

OperatorOS is the authority for Tech Deck plan, subscription status, module access, feature access, billing state, and upgrade/downgrade management.

## What OperatorOS Controls

- Tenant/account billing relationship.
- Plan and access level.
- Subscription status.
- Tech Deck module enablement.
- Feature keys: `api`, `portal`, `status`, `webhooks`, `reports`, `intake`.
- Limits: `usersMax`, `storageGb`, `reportsPerMonth`, `webhooksMax`, `intakeSpacesMax`, `intakeRequestsPerMonth`, `intakeStorageGb`.
- Revocation through `target_module_enabled=false` or `module_role=none`.

OperatorOS must send feature keys and limit values explicitly. Tech Deck stores
and enforces those snapshot fields; it does not infer features or quotas from a
local plan catalog or from `plan_slug`.

## What Tech Deck Stores

Tech Deck stores a read-only snapshot on `users.entitlement_snapshot_json`.

The snapshot is created on `/sso` login and updated through `POST /api/operatoros/entitlements/sync`.

Useful local fields:

- `users.operatoros_user_id`
- `users.operatoros_tenant_id`
- `users.entitlement_snapshot_json`
- `users.last_entitlement_sync_at`
- `users.local_role`
- `users.revoked_at`

Legacy local billing tables may remain for audit/reference, but they are not production access authority.

## Access Rules

Authenticated routes hydrate the user from the local session. OperatorOS-managed users fail closed when no entitlement snapshot is present.

Blocking statuses:

- `past_due`
- `unpaid`
- `canceled`

Allowed statuses:

- `active`
- `trialing`

Feature-gated modules use `requireFeature()`:

- API access: `api`
- Client portal: `portal`
- Status pages: `status`
- Webhooks: `webhooks`
- Reports: `reports`
- Secure Intake: `intake`

Tenant-level public/API surfaces use a tenant snapshot lookup so public status pages, API tokens, and public intake links cannot bypass OperatorOS feature state.

## Verifying a User Snapshot

1. Find the user by `operatoros_user_id` or `sso_subject`.
2. Confirm `entitlement_snapshot_json.accessLevel`.
3. Confirm `entitlement_snapshot_json.subscriptionStatus`.
4. Confirm `entitlement_snapshot_json.features`.
5. Confirm `entitlement_snapshot_json.enabled`.
6. Confirm `last_entitlement_sync_at` is recent.
7. Confirm `revoked_at` is null for enabled users.

## If Entitlement Sync Fails

- Ask the user to launch Tech Deck again from OperatorOS so `/sso` refreshes the snapshot.
- Check `OPERATOROS_SERVICE_TOKEN` and `CHILD_APP_MODULE_KEY=techdeck`.
- Check OperatorOS sync logs for `POST /api/operatoros/entitlements/sync`.
- A missing snapshot blocks OperatorOS-managed users rather than falling back to local billing state.

## Testing Revocation

Send an OperatorOS sync payload with either:

- `target_module_enabled=false`
- `module_role=none`

Expected result:

- `users.revoked_at` is set.
- Active sessions for the user are deleted.
- New protected requests return `403 module_access_denied` or entitlement middleware returns `402 module_access_denied`.
