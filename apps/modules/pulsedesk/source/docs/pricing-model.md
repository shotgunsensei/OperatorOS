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

