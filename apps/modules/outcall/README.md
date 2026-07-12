# OutCall Module

OutCall is a planned OperatorOS child module for discreet exit assistance and
personal-safety calling. Phase 1 establishes its integration boundary and
architecture without presenting unfinished product screens as production-ready.

## Active Phase 1 Integration

- Registry slug: `outcall`
- Canonical host: `outcall.operatoros.net`
- Source boundary: `apps/modules/outcall/source`
- OperatorOS adapter: `apps/modules/outcall/adapter.ts`
- Lifecycle status: `planned`
- Authentication and billing authority: OperatorOS

The shared module catalog drives the ecosystem card, host mapping, database
module seed, entitlement key, and navigation metadata. Because the module is
`planned`, normal launch and route access remain unavailable.

## Ownership Boundary

OperatorOS owns users, sessions, tenants, memberships, platform roles, module
entitlements, Stripe customers/subscriptions, SSO handoff issuance, and central
audit policy. OutCall owns only its safety workflows, verified phone records,
trigger configuration, calls, schedules, check-ins, trusted contacts, and
privacy-specific audit details.

No standalone login, password store, user-supplied tenant authority, local
Stripe checkout, or production mock provider may be added here.
