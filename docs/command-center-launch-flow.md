# OperatorOS Command Center Launch Flow

Status: Phase 7 implementation notes. The Command Center launchpad is now
registry-driven and launches modules through the shared OperatorOS SSO issue
endpoint. No module source was imported.

## Current Surfaces

- Command Center UI: `apps/web/src/components/pages/MyAppsPage.tsx`
- Registry facade: `apps/web/src/lib/operatoros-registry.ts`
- SSO launch client: `apps/web/src/lib/module-launch.ts`
- Server issue route: `POST /api/sso/issue` -> `POST /v1/sso/issue`
- Server access authority: `apps/api/src/lib/tenant-entitlements.ts`

The launchpad uses the central module registry as the baseline list and overlays
the active tenant's server-resolved module access from `GET /api/modules`.

## Launch Flow

1. User opens `/app`.
2. OperatorOS resolves the active tenant through `TenantProvider`.
3. Command Center loads the central module registry.
4. Command Center fetches `GET /api/modules` for the active tenant.
5. Cards are grouped into:
   - Active modules
   - Locked modules
   - Planned modules
   - Unavailable modules
6. User clicks Launch.
7. Frontend calls `POST /api/sso/issue` with:

```json
{
  "moduleId": "techdeck",
  "tenantId": "tenant-id"
}
```

8. Backend verifies authentication, tenant membership, module registry status,
   tenant entitlement, per-user module access, and root platform admin override
   server-side.
9. Backend returns `launchUrl`.
10. Frontend opens the returned URL through the existing web/Capacitor-safe
    external launch helper.

The frontend never computes final entitlement authority. UI state is only a
display hint from server summaries.

## Display Rules

Active modules:

- Registry status is `active`.
- Server summary says the module is unlocked.
- Launch button calls SSO issue.

Locked modules:

- Registry status is `active`.
- Server summary is not unlocked.
- Card shows upgrade, add-on, access denied, or access-options state.

Planned modules:

- Registry status is `planned`, or server module status is `coming_soon`.
- Launch is disabled.

Unavailable modules:

- Registry/server status is disabled, tenant is missing, or the registry entry is
  not present in the API module catalog.
- Launch is disabled with a controlled state.

## Admin Visibility

Tenant owners, tenant admins, and server-verified platform admins see a Manage
button that routes to tenant module management.

Only server-verified platform admins see the Platform Command shortcut.
Root-admin authority remains enforced by the API and shared auth helpers; the UI
does not grant root access by email string.

## Error States

- launching: the launch button shows an in-progress state.
- access denied: SSO issue returns `MODULE_ACCESS_DENIED`.
- module disabled: SSO issue returns `MODULE_DISABLED`.
- SSO failure: SSO issue returns `SSO_SECRET_NOT_CONFIGURED` or an invalid
  response.
- network failure: fetch throws or returns no reachable response.
- tenant failure: missing, suspended, or unavailable tenant returns the server
  error code and a user-safe message.

## Manual QA

1. Log in to `/app`.
2. Confirm Command Center shows the active tenant.
3. Switch tenant when multiple tenants are available.
4. Confirm active modules render Launch buttons.
5. Click Launch on an entitled module and confirm `/api/sso/issue` returns a
   `launchUrl`.
6. Confirm a locked module shows upgrade/add-on/access-options state.
7. Confirm planned modules cannot be launched.
8. Confirm tenant admins see Manage buttons.
9. Confirm normal users do not see Platform Command.
10. Confirm platform admins see Platform Command.

## Remaining Follow-Up

Phase 8 should add admin entitlement management routes and UI so tenant/module
grants can be managed centrally without relying on seed data or direct database
helpers.
