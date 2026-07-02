# TechDeck Manual QA

Use this checklist after Phase 10 and again before Phase 11 polish.

## Launch and Routing

- Launch from Command Center: Command Center launches TechDeck through the central module registry.
- `/modules/techdeck` renders the TechDeck module shell for an authenticated and entitled user.
- `techdeck.operatoros.net` resolves to the TechDeck module shell through host-based routing.
- Direct visit while logged out redirects to OperatorOS login.
- Direct visit without TechDeck entitlement shows the OperatorOS access denied state before shell render.

## Roles

- Root platform super-admin access: `john@shotgunninjas.com` receives root platform super-admin access from server-side OperatorOS authority.
- Platform super-admin sees the TechDeck Platform Command management link.
- Tenant admin can launch TechDeck when the tenant has entitlement.
- Normal tenant user can launch TechDeck when entitled and resolves to the TechDeck adapter `TECH` role.
- A user without tenant membership cannot access tenant-scoped TechDeck routes.

## Removed Duplicate Auth

- TechDeck `/login` redirects to OperatorOS login.
- TechDeck `/register` redirects to OperatorOS request-access or billing flow.
- TechDeck local password form is not visible.
- TechDeck local registration form is not visible.
- TechDeck reviewer login redirects to OperatorOS and does not accept a local password.
- Account security page does not offer local password change.
- MFA setup page redirects to OperatorOS identity/security management.
- TechDeck unauthorized-client redirect goes to OperatorOS, not `/login`.

## Removed Duplicate Pricing and Billing

- TechDeck `/pricing` redirects to OperatorOS billing.
- TechDeck landing page does not advertise an internal pricing section.
- TechDeck sitemap does not promote `/pricing` or `/login`.
- TechDeck billing page is read-only and says OperatorOS manages billing.
- Local checkout endpoint returns `410 managed_by_operatoros`.
- Local customer portal endpoint returns `410 managed_by_operatoros`.

## Major Feature Routes

The following imported workflows should be smoke-tested once their routes are mounted through OperatorOS:

- dashboard
- tickets
- ticket detail
- clients
- client detail
- sites
- assets
- evidence
- evidence upload
- IT ops console
- secure intake
- calendar
- time entries
- invoices
- knowledge base
- reports
- webhooks
- API tokens

## Failure States

- Missing entitlement produces a clear access-denied state.
- Disabled module produces a controlled unavailable state.
- SSO failure does not expose token values.
- Local auth disabled response does not leak stack traces.
- Billing redirects do not expose private Stripe keys or price IDs.
