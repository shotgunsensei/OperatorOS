# TradeFlowKit Risk Register

## Phase 14 Risks

### Standalone Auth Still Exists

The imported source still contains local login, register, password change,
account deletion, and org-switch routes. These are preserved for audit and
compatibility in Phase 14. Phase 15 must prevent standalone TradeFlowKit auth
from becoming a second login system inside OperatorOS.

Priority: high.

### Local Stripe Subscription and Add-On Code Still Exists

TradeFlowKit contains local subscription checkout, customer portal, and Call
Recovery add-on checkout code. Some paths already return
`managed_by_operatoros` for linked orgs, but the source still owns too much
subscription flow for the target platform architecture.

Priority: high.

### Stripe Connect and Invoice Payments Need Separate Classification

Stripe Connect onboarding and invoice payment links are business workflow
payments, not necessarily OperatorOS subscription billing. Removing them
blindly could break field-service revenue workflows. Phase 15 should separate
tenant operational payments from OperatorOS module subscription checkout.

Priority: high.

### Separate Org Model

TradeFlowKit stores local orgs and memberships. OperatorOS owns tenant
membership and selected tenant context. The imported source already has
OperatorOS-linked org fields and entitlement snapshots, but Phase 15 must make
sure org selection cannot bypass OperatorOS tenant isolation.

Priority: high.

### Entitlement Snapshot Freshness

Linked org access depends on OperatorOS SSO and entitlement sync snapshots.
Snapshot failure should fail closed for linked tenants. Confirm all protected
routes consistently use the entitlement-aware middleware paths.

Priority: medium.

### Mobile PWA Surface

No Expo or separate native app was found. TradeFlowKit is mobile-first through
responsive web/PWA patterns. Phase 15 polish should include mobile shell checks
because field-service users are likely to launch it from phones.

Priority: medium.

### External Service Availability

Call Recovery, reminders, invoice/quote delivery, payments, and AI features can
depend on Twilio, SendGrid, Stripe, and OpenAI configuration. Missing env vars
should degrade clearly without leaking secrets or breaking unrelated workflows.

Priority: medium.

### Imported Runtime Artifacts

Runtime artifact folders were excluded from the source import. Keep
`node_modules`, `dist`, coverage, Playwright reports, package locks, local
data, logs, and private env files out of `apps/modules/tradeflowkit/source`.

Priority: medium.

## Manual QA Checklist

- TradeFlowKit loads from `/modules/tradeflowkit`.
- TradeFlowKit launches from the Command Center.
- Direct host route resolves for `tradeflowkit.operatoros.net`.
- Logged-out user is redirected or shown OperatorOS login.
- Missing entitlement is blocked.
- Root admin is allowed through server-side platform admin checks.
- Normal tenant member lands in a non-admin module state.
- Tenant admin can see authorized settings/manage affordances.
- Customer workflow route is present.
- Job workflow route is present.
- Invoice workflow route is present.
- Lead Conversion Center route is present.
- Stripe subscription ownership is not exposed as a new OperatorOS source of truth.
- Duplicate login/register surfaces are removed or redirected in Phase 15.
