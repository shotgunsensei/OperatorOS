# Tech Deck OperatorOS Smoke Test

Use this checklist before a demo, release, or OperatorOS handoff. Tech Deck is a child app: OperatorOS owns login launch, billing, subscription state, module entitlement, and plan changes. Tech Deck consumes the signed SSO launch/session and enforces the synced entitlement snapshot locally.

## Environment

Configure the child app with real values for the target environment:

- `DATABASE_URL`
- `SESSION_SECRET`
- `OPERATOROS_SSO_SHARED_SECRET`
- `OPERATOROS_SSO_AUDIENCE`
- `OPERATOROS_SSO_ISSUER`
- `OPERATOROS_SSO_RETURN_URL`
- `OPERATOROS_ENTITLEMENTS_WEBHOOK_SECRET`
- `OPERATOROS_BILLING_URL`
- `VITE_OPERATOROS_BASE_URL`
- `VITE_OPERATOROS_REQUEST_ACCESS_URL`

Do not configure Tech Deck-local Stripe plan mutation as the production subscription authority. Local billing write endpoints should remain decommissioned and return `410`.

## Manual Launch Matrix

1. Launch from OperatorOS as tenant owner.
   - Expected: lands on `/`, dashboard renders, role badge shows `OWNER`, sidebar includes administration and OperatorOS billing.
   - Verify `/api/me/entitlements` returns `managedBy: "operatoros"` with an active snapshot.

2. Launch from OperatorOS as tenant admin or module admin.
   - Expected: dashboard renders, admin routes such as `/team`, `/audit`, `/billing`, `/api-tokens` are available according to entitlement.
   - Verify feature-gated routes show a useful locked or `402` state when the feature is not entitled.

3. Launch as module user or technician.
   - Expected: dashboard renders, service desk, clients/assets, field ops, evidence, reports if entitled, IT Ops Console, and `/m` mobile view are available.
   - Expected: admin-only routes are hidden from sidebar and return `403` server-side.

4. Launch as viewer/client.
   - Expected: `/` redirects to `/portal`.
   - Expected: client can see only portal tickets, invoices, evidence, and scoped client records.
   - Expected: non-portal workspace routes do not expose cross-tenant data.

5. Launch with disabled Tech Deck module.
   - Expected: SSO reject or app state routes to `/access-denied`.
   - Expected: copy says access is managed by OperatorOS and provides OperatorOS/contact-admin recovery.

6. Launch with inactive subscription snapshot.
   - Test statuses: `past_due`, `unpaid`, `canceled`.
   - Expected: shell shows managed billing state, write routes return `402`, and only safe read/export paths remain available.

7. Launch with expired SSO token.
   - Expected: token is rejected and user is not signed in.
   - Expected: no tenant is created locally from an expired launch.

8. Replay a consumed SSO token.
   - Expected: replay is rejected.
   - Expected: existing session state is not changed by the replay attempt.

9. Verify entitlement snapshot.
   - Open `/billing`.
   - Expected: page is read-only, displays access level, status, role, limits, features, and last sync.
   - Expected: Manage Billing links to OperatorOS.

10. Verify billing/admin controls.
    - Check admin panel.
    - Expected: no local `Change Subscription`, pause, unpause, or local plan mutation controls render.
    - API expectations: `/api/billing/checkout-session`, `/api/billing/customer-portal`, and admin subscription mutation routes return `410`.

11. Verify key modules load.
    - Dashboard `/`
    - Tickets `/tickets`
    - Clients `/clients`
    - Sites `/sites`
    - Assets `/assets`
    - Calendar `/calendar`
    - Time `/time`
    - Evidence `/evidence`
    - IT Ops Console `/itops`
    - Secure Intake `/secure-intake`
    - Reports `/reports`
    - Billing `/billing`

12. Verify blocked feature behavior.
    - Remove one feature from the OperatorOS snapshot, such as `reports`, `webhooks`, `api`, `status`, `intake`, or `portal`.
    - Expected: sidebar indicates OperatorOS-managed lock where visible.
    - Expected: server route returns a useful `402` feature/plan response.

13. Verify revocation kills session.
    - Revoke or disable the module in OperatorOS.
    - Expected: next entitlement refresh blocks access or requires relaunch.
    - Expected: mutation routes fail closed.

14. Verify mobile `/m`.
    - Launch as `OWNER`, `ADMIN`, or `TECH` on mobile viewport.
    - Expected: `/m`, `/m/tickets`, `/m/time`, `/m/calendar` use the mobile layout.
    - Expected: `/mfa-setup` does not get treated as a mobile route.
    - Expected: `CLIENT` users stay in the portal and are not hijacked into technician mobile views.

15. Verify public pages.
    - `/`
    - `/pricing`
    - `/privacy`
    - `/terms`
    - `/refund`
    - `/status/:slug`
    - `/t/upload/:token`
    - Expected: pricing/legal copy does not claim Tech Deck-local Stripe controls production subscriptions.

## Local Commands

Run:

```bash
npm run check
npx vitest run
npm run build
```

Record exact pass/fail output in the release notes. Do not count live SSO replay, expiry, webhook, or revocation checks as passed unless tested against a real OperatorOS environment or a signed-token harness that matches production secrets.
