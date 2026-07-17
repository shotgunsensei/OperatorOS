# OperatorOS architecture decision index

Status: current accepted-decision index. A decision remains accepted until a
new ADR explicitly supersedes it.

| ID | Decision | Status | Authoritative record |
| --- | --- | --- | --- |
| ADR-0001 | OperatorOS exclusively owns identity, sessions, tenants, memberships, platform roles, billing, entitlements, registry, launch policy, and platform audit. | Accepted | `docs/OPERATOROS_ECOSYSTEM_INTEGRATION_CONTRACT.md` |
| ADR-0002 | Browser SSO v1 uses exact registered hosts and callbacks, opaque 60-second single-use codes, state, nonce, PKCE S256, and independent host-only cookies. Parent-domain cookies and JWT query handoffs are retired. | Accepted | `docs/auth/OPERATOROS_SSO_CONTRACT_V1.md` |
| ADR-0003 | The canonical deployment is one host-aware Next/Fastify OperatorOS runtime unless an approved workload-specific ADR justifies a separate module deployment. | Accepted | `README.md`, `docs/subdomain-routing.md` |
| ADR-0004 | `apps/modules/<slug>/source` is quarantined migration evidence outside the executable workspace. Child servers, migrations, auth, tenant, entitlement, and billing systems are never activated in OperatorOS. | Accepted | `docs/MODULE_CONSOLIDATION_STATUS.md` |
| ADR-0005 | The canonical My Apps destination is `https://app.operatoros.net/`; return targets are exact registered origins plus validated relative paths. | Accepted | `docs/OPERATOROS_ECOSYSTEM_INTEGRATION_CONTRACT.md` |
| ADR-0006 | OutCall remains registered but disabled and unpurchasable until a distinct/merge/cancel product ADR is accepted. | Accepted interim decision | `docs/outcall/ARCHITECTURE.md`, `docs/MODULE_CONSOLIDATION_STATUS.md` |
| ADR-0007 | Module completion uses consolidation states 1-5; a shell or partial vertical slice cannot be reported as state 4/5 parity. | Accepted | `docs/MODULE_CONSOLIDATION_STATUS.md`, `docs/modules/MODULE_PARITY_INDEX.md` |
| ADR-0008 | OperatorOS owns one tenant-scoped Business Directory; external organizations are distinct from subscriber tenants and modules use profile extensions instead of duplicate identity records. | Accepted | `docs/adr/ADR-0008-shared-business-directory.md` |

## Required future ADRs

- TradeFlowKit project versus job/work-order semantics (Phase 4).
- PulseDesk facility/client/ticket language and PHI boundary (Phase 6).
- Torque Assist safety, provider, and ledger semantics (Phase 8).
- Ninja Launch Kit source/product alignment (Phase 11D).
- CallCommand AI versus OutCall product boundary (Phases 11E/12B).
- Ninjamation canonical source or newly specified product boundary (Phase 12A).

ADRs must state context, decision, consequences, data/security impact,
migration/rollback implications, and superseded records.
