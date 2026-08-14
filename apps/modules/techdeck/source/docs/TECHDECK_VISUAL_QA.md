# Tech Deck Visual QA Checklist

Use this checklist after UI changes and before sales/demo use. Capture screenshots when possible and note the browser, viewport, role, theme, and seed data state.

## Viewports

- Desktop 1440px: dashboard, sidebar, command header, tables, dialogs.
- Laptop 1366px: same checks with browser devtools closed and open.
- Tablet: sidebar sheet behavior, cards, table overflow, forms, modals.
- Mobile: `/m`, login, access denied, public landing, client portal, long lists.

## Themes

- Dark mode: default command-center look, readable cyan/blue accents, green status accents, no washed-out primary button text.
- Light mode: usable contrast, readable cards, borders visible, no low-contrast muted text.
- Toggle theme from authenticated shell and public landing.

## Shell

- Sidebar expanded.
- Sidebar collapsed.
- Mobile sidebar sheet.
- Sticky operations header does not cover content.
- Long tenant names truncate without pushing controls off-screen.
- Role badge and OperatorOS-managed badge remain readable.
- Active route highlighting is exact: `/mfa-setup` must not mark `/m` active.

## Role States

- `OWNER`: administration, billing, integrations, and system-adjacent controls appear as expected.
- `ADMIN`: admin routes visible, system admin hidden unless account is system admin.
- `TECH`: operational modules visible, admin/billing controls hidden.
- `CLIENT`: portal-only navigation, safe minimal UI, no technician/admin routes.
- System admin: `/system-admin` visible and server-protected.

## Data States

- Empty data: dashboard, tickets, clients, evidence, secure intake, reports.
- Loading data: page skeletons and list skeletons match command surfaces.
- Failed API: actionable error state with retry where supported.
- Revoked or inactive user: OperatorOS-managed messaging and no confusing local billing CTA.
- Missing feature entitlement: locked sidebar state or useful `402` UI.

## Module Pass

- Dashboard: first screen shows open tickets, SLA risk, evidence, active clients, recent activity, OperatorOS status, and next actions.
- Tickets: top actions are obvious, status/SLA priority can be scanned, destructive actions confirm.
- IT Ops Console: feels like a senior-engineer command console, input and response blocks do not overflow.
- Evidence: hash, audit, secure storage, and download/export actions are visually clear.
- Secure Intake: upload links, audit status, expiration, password/one-time controls are clear.
- Clients/Sites/Assets: tables and bulk actions remain usable on laptop and tablet widths.
- Calendar/Time: mobile and desktop controls remain tappable and readable.
- Knowledge Base: search, empty state, and article view are readable.
- Reports: generated packet jobs, downloads, and entitlement errors are clear.
- Billing: read-only, OperatorOS-managed, no local subscription mutation controls.
- Settings/Team/Audit: admin context and dangerous actions are clear.
- Client Portal: scoped, minimal, and safe; no cross-tenant or internal admin copy.
- Mobile `/m`: bottom navigation and detail pages work on phone viewport.

## Public Pages

- Landing: Tech Deck is visible in the first viewport; CTA is OperatorOS-first.
- Pricing: plans are described as OperatorOS-managed.
- Login: local/admin purpose is clear, OperatorOS launch path is primary recovery.
- Register: local/dev/legacy purpose is clear, no production subscription promise.
- Access denied: reason, OperatorOS management, contact tenant admin, and return action are clear.
- Not found: polished recovery state, no developer placeholder copy.

## Content Safety

- No local Stripe copy implies Tech Deck owns production subscriptions.
- No stack traces or secrets are visible in user-facing errors.
- No PHI/customer-sensitive placeholder data appears in public pages.
- Product names remain unchanged: Tech Deck, OperatorOS, Shotgun Ninjas Productions.
