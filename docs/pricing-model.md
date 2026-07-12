# OperatorOS Pricing Model

OperatorOS is the free command and entitlement layer. It provides SSO, tenant
and user management, billing, module launch, entitlement enforcement, and audit
history. Tenants pay for applications, not OperatorOS.

## Core products

| Core product | Monthly price | Included seats |
| --- | ---: | ---: |
| TradeFlowKit | $149 | 5 |
| PulseDesk | $149 | 5 |
| TechDeck | $99 | 5 |

An active core product is fully unlocked. OperatorOS does not apply
feature-level restrictions inside a purchased application.

Every active core product also grants:

- TorqueShed
- FaultlineLab
- Ninja Pool Hall
- One selectable companion module at $0

Eligible companion modules are SnapProofOS, BrandForgeOS, StudyForge AI, Ninja
Launch Kit, CallCommand AI, and Ninjamation. Additional companion modules cost
$29/month each. Additional operator seats default to $15/month each and are
configured with `ADDITIONAL_SEAT_PRICE_CENTS`.

The authoritative shared catalog is
`packages/sdk/src/products.ts`. Public pricing, checkout line items, webhook
grants, and tests must consume that catalog rather than duplicating amounts.

## OperatorOS workspace capacity

The legacy Starter, Pro, and Elite subscriptions remain as a compatibility
layer for OperatorOS-native workspace allowances: workspaces, projects, tasks,
team-member limits, AI actions, and related platform features. They do not
define the customer-facing application stack and should not be presented as a
module-access tier system.

Customer-facing billing surfaces use two explicit lanes:

- **Application stack:** core product, included apps, companion modules, and
  tenant seats. This is the primary commercial model and uses the stack checkout.
- **Workspace capacity:** OperatorOS-native usage allowances. This preserves
  existing subscriptions and quota enforcement while the legacy plan model is
  gradually retired or folded into the stack.

Locked module CTAs should route customers to stack options. Resource-limit CTAs
may continue opening the workspace-capacity selector. This separation prevents
Starter/Pro/Elite language from conflicting with the finalized core-product
pricing model.

