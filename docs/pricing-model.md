# OperatorOS Pricing Model

OperatorOS is the free command and entitlement layer. It provides SSO, tenant
and user management, billing, module launch, entitlement enforcement, and audit
history. Tenants pay for the operating application they need, not the command
center that secures and launches it.

This is the only forward-sale model. It is monthly-only and tenant-owned. A
tenant may purchase one flagship stack; adding another flagship requires a
separate future commercial offer and is not accepted by the current checkout.

## Core products

| Flagship product | Monthly price | Included tenant seats |
| --- | ---: | ---: |
| TradeFlowKit | $149 | 5 |
| PulseDesk | $149 | 5 |
| TechDeck | $99 | 5 |

An active flagship is fully unlocked for the purchasing tenant. OperatorOS
does not apply artificial feature restrictions inside a purchased
application. The five included seats are shared by the tenant; they are not
five additional seats per user or per companion.

## Free applications

These applications are available at $0 and do not require a Stripe
subscription:

- TorqueShed
- FaultlineLab
- Operator Pool Hall

They remain tenant-isolated, authenticated where required, and subject to
their normal role and safety policies. Free does not mean public access to
another organization's data.

## Companion applications

Every active flagship includes one tenant-wide companion application selected
at checkout. The six eligible companions are:

- SnapProofOS
- BrandForgeOS
- StudyForge AI
- Deploy Ops (stable key and route: `ninja-launch-kit`)
- CallCommand AI
- Script Ops (stable key and route: `ninjamation`)

Additional companion applications cost $29/month each. A companion is enabled
for the entitled tenant, not purchased separately by each member. OutCall is
coming soon and is not a purchasable or included companion.

Additional operator seats cost $15/month each. Checkout uses one shared monthly
Stripe Price for paid companion quantity and one shared monthly Stripe Price
for additional-seat quantity; it does not create a separate sellable Price for
each companion.

## Existing-contract compatibility

Starter, Pro, Elite, and individual module add-on sales are closed. Their
catalog records, subscription rows, Stripe references, and compatibility
aliases remain because deleting them would break existing customers, audits,
quota history, cancellation, or rollback. They must not appear as a new
purchase, upgrade, plan-change, reactivation, or local entitlement-grant path.

Only subscriptions explicitly marked as existing before the forward-model
database release may retain legacy plan-to-application access. A later plan
assignment can still carry OperatorOS-native workspace-capacity data, but it
must not silently grant application access. Existing customers retain safe
read/portal/cancellation handling; every new locked-application CTA routes to
the flagship stack configurator.

## Commercial authority and permissions

- OperatorOS owns Stripe checkout, portal, webhook verification, subscription
  state, and application entitlements.
- Billing customer and subscription identity belong to the tenant rather than
  whichever member happened to initiate checkout.
- The tenant owner may start checkout, select the included companion, add paid
  companions or seats, and open the billing portal. Tenant administrators have
  billing visibility but cannot mutate the commercial contract.
- Platform superadministrators retain audited support authority without
  turning browser-supplied tenant or role values into authorization.
- A paid entitlement is created or changed only from verified Stripe state. A
  missing provider configuration never produces a local "successful" sale.

The authoritative shared catalog is `packages/sdk/src/products.ts`. Public
pricing, checkout line items, webhook grants, billing screens, and tests must
consume that catalog rather than duplicating amounts or sellable sets.

