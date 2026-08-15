# OperatorOS Command Center Launch Flow

Status: consolidated runtime. The Command Center is registry-driven and starts
module authorization on the target module host. All core hosts are served by
the same OperatorOS Next/Fastify deployment.

## Current Surfaces

- Command Center UI: `apps/web/src/components/pages/MyAppsPage.tsx`
- Registry facade: `apps/web/src/lib/operatoros-registry.ts`
- SSO launch client: `apps/web/src/lib/module-launch.ts`
- Browser callback: `apps/web/src/app/sso/page.tsx`
- Server issue route: `POST /api/sso/issue` -> `POST /v1/sso/issue`
- Server exchange route: `POST /api/sso/browser-exchange` -> `POST /v1/sso/browser-exchange`
- Server access authority: `apps/api/src/lib/tenant-entitlements.ts`

The launchpad uses the central module registry as the baseline list and overlays
the active tenant's server-resolved module access from `GET /api/modules`.

## Launch Flow

1. User opens `/app`.
2. OperatorOS resolves the active tenant through `TenantProvider`.
3. Command Center loads the central module registry.
4. Command Center fetches `GET /api/modules` for the active tenant.
5. Home keeps the first-use decision small and groups cards into two
   customer-facing states:
   - Your tools
   - More tools you can add
   Planned and unavailable catalog entries remain discoverable under
   **Browse tools** without competing with the primary Home workflow.
6. The user chooses **Open {module name}** through a real anchor to the
   registry's exact module launch URL. Ordinary activation reuses the current
   browser page; Ctrl/Cmd-click, Shift-click, middle-click, context-menu, and
   the explicitly labelled new-tab action retain normal browser behavior. The
   frontend does not mint or carry a handoff code.
7. When that host lacks its own `operatoros_session`, middleware creates
   host-only HttpOnly state, nonce, and PKCE verifier cookies and redirects to
   `auth.operatoros.net/login` with the exact callback and S256 challenge.
8. After authentication, the auth host calls `POST /api/sso/issue` with the
   module/tenant plus the complete authorization transaction:

```json
{
  "moduleId": "techdeck",
  "tenantId": "tenant-id",
  "clientId": "operatoros:techdeck",
  "redirectUri": "https://techdeck.operatoros.net/sso",
  "returnTo": "https://techdeck.operatoros.net/",
  "state": "<random base64url>",
  "nonce": "<random base64url>",
  "codeChallenge": "<S256 base64url>",
  "codeChallengeMethod": "S256"
}
```

9. Backend verifies authentication, exact registered client/callback,
   same-origin return path, tenant membership, module status, entitlement, and
   platform-admin override. It stores a short-lived handoff and returns the
   exact `/sso?code=...&state=...` callback.
10. The shared callback posts the code and state to the same-origin browser
    exchange. Fastify proves the request host, state cookie, nonce cookie, and
    PKCE verifier; rechecks user/tenant/entitlement state; atomically consumes
    the code; and sets a host-only `operatoros_session`.
11. The callback removes the code from browser history and navigates to the
    validated local path.

The frontend never computes final entitlement authority. UI state is only a
display hint from server summaries.

## Display Rules

Your tools:

- Registry status is `active`.
- Server summary says the module is unlocked.
- The specific **Open {module name}** anchor opens the module host in the
  current page, which begins the authorization flow.

More tools you can add:

- Registry status is `active` and the tool has a customer-completable next
  action such as comparing plans or asking an organization administrator.
- Planned and unavailable entries appear only in **Browse tools**, where their
  state is explained without blocking the user's ready-to-use tools.

## Admin Visibility

Tenant owners, tenant admins, and server-verified platform admins see a Manage
button that routes to tenant module management.

Only server-verified platform admins see the Platform Command shortcut.
Root-admin authority remains enforced by the API and shared auth helpers; the UI
does not grant root access by email string.

## Error States

- access denied: SSO issue returns `MODULE_ACCESS_DENIED`.
- module disabled: SSO issue returns `MODULE_DISABLED`.
- SSO failure: issue or browser exchange returns a bounded error and does not
  automatically restart authorization.
- network failure: fetch throws or returns no reachable response.
- tenant failure: missing, suspended, or unavailable tenant returns the server
  error code and a user-safe message.

## Manual QA

1. Log in to `/app`.
2. Confirm Workspace home shows the active organization.
3. Switch organizations when multiple memberships are available.
4. Confirm available tools render specific **Open {tool name}** buttons.
5. Ordinary-click an entitled module and confirm the same browser page reaches
   the target host, without adding a browser context page, and redirects to
   auth with state, nonce, and S256 challenge; `/api/sso/issue` then returns the
   exact callback.
6. Use Ctrl/Cmd-click, middle-click, and the explicit new-tab action and confirm
   each deliberately creates exactly one additional page with no opener.
7. Confirm a tool that is not included explains whether a plan, add-on, or
   administrator grant is needed under **Browse tools**.
8. Confirm planned tools cannot be opened and do not crowd Home.
9. Confirm organization admins see **Manage tool access** buttons.
10. Confirm normal users do not see Platform administration.
11. Confirm platform admins see Platform administration.

## Cross-Subdomain Handoff (Task #140)

The hub (`operatoros.net` / `auth.operatoros.net`) and each module live on
different subdomains. Two bugs previously combined into an infinite
login/launch loop when a user launched a module: (1) the session cookie was
scoped host-only instead of `.operatoros.net`, so the module subdomain never
saw the hub session; and (2) an arriving launch could be auth-gated back to
login before it had a chance to establish its own session.

### Cookie scope

Every host receives its own `operatoros_session` with no `Domain` attribute.
Production cookies are `Secure`, `HttpOnly`, `SameSite=Lax`, and path `/`.
Possessing a session on `auth.operatoros.net` therefore does not grant ambient
authority to a module subdomain; the code exchange establishes that host's
copy only after the server validates the full transaction.

### Opaque launch code (preferred) vs. legacy token

Historically the launch URL carried the full handoff JWT in the browser
address bar (`/sso?token=<JWT>`), exposing identity and entitlement claims.
Task #140 replaces this with an opaque, single-use code:

- The hub persists the handoff row (keyed by `jti`) and emits an AES-256-GCM
  sealed code containing the `jti`, audience/client, exact callback, validated
  local return path, state, nonce, and S256 challenge. No identity,
  entitlement, session JWT, or verifier rides in the URL.
- The shared same-origin Fastify exchange verifies the target host and
  transaction cookies, rechecks authority, and consumes the row with
  `consumed_at IS NULL` in the update predicate. A second redemption returns
  `CODE_REPLAYED`.
- Legacy JWT/consume and standalone adapter paths remain dormant only for the
  bounded rollback window. Core clients do not opt between transports.

The callback receives a canonical user/tenant/module summary and a validated
relative return path. It never receives the session JWT value.

### Loop breaker

The middleware exempts `/sso` from the auth gate (it is the endpoint that
establishes the session) and bounds login redirects with a short-lived
host-only counter cookie. After a small number of
bounces without a session cookie taking hold, the visitor is sent to a clean
login surface with `?launch_error=too_many_redirects` instead of looping
forever. The counter is cleared on the first authenticated request.

All of the above authority remains **server-side**: the code only references a
server-persisted, single-use handoff, and entitlement is always resolved by
the API.

## Remaining production gate

Deploy the unified release, run the DB-backed exchange suite against an
isolated PostgreSQL database, and complete authenticated live browser smoke on
all four registered callback hosts. Source completion does not make the older
deployed 404 callbacks green.
