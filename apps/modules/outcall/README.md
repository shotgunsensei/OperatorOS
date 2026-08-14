# OutCall Module

OutCall is an active OperatorOS add-on for discreet, verified-self
exit-assistance calls. The shared Next/Fastify runtime provides the customer
workspace and persistent product API; the imported `source/` tree remains
read-only migration evidence and is never started or migrated independently.

## Active integration

- Registry slug: `outcall`
- Canonical host: `outcall.operatoros.net`
- Customer shell: `apps/web/src/components/module-shells/OutCallShell.tsx`
- Product API: `apps/api/src/routes/outcall-routes.ts`
- Ordered database release: v33 step `outcall_product_operations`
- Lifecycle status: active source/local state 4
- Authentication, tenant, entitlement, billing, and launch authority:
  OperatorOS

The active workflow supports safety acknowledgement, phone ownership
verification, encrypted rescue profiles and exact-match private triggers,
immediate or scheduled calls to the verified number, cancellation and history,
signed/replay-safe provider callbacks, private export, and
password-confirmed deletion. Recording, arbitrary destinations, emergency
dispatch claims, impersonation, and autonomous/bulk dialing remain excluded.

## Deployment boundary

The source candidate fails closed until the reviewed OutCall protection keys,
explicit live-provider switch, canonical public URL, Twilio account/auth token,
Verify service, owned caller number, and country allowlist are configured.
Follow `docs/outcall/GO_LIVE_CHECKLIST.md` for provider and deployed exact-host
acceptance. Local state 4 is not a claim that the Replit deployment or live
Twilio flow has passed state 5.

No standalone login, password store, client-supplied tenant authority,
module-local Stripe checkout, or production test provider may be added here.
