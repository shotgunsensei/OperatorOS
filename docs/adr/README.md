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
| ADR-0006 | OutCall remains registered but disabled until a distinct/merge/cancel product ADR is accepted. | Superseded by ADR-0027 | `docs/adr/ADR-0027-outcall-personal-safety-and-provider-boundary.md` |
| ADR-0007 | Module completion uses consolidation states 1-5; a shell or partial vertical slice cannot be reported as state 4/5 parity. | Accepted | `docs/MODULE_CONSOLIDATION_STATUS.md`, `docs/modules/MODULE_PARITY_INDEX.md` |
| ADR-0008 | OperatorOS owns one tenant-scoped Business Directory; external organizations are distinct from subscriber tenants and modules use profile extensions instead of duplicate identity records. | Accepted | `docs/adr/ADR-0008-shared-business-directory.md` |
| ADR-0009 | OperatorOS owns shared attachments, notifications/providers, leased jobs/outbox, verified webhooks, append-only usage/activity, and idempotency. | Accepted | `docs/adr/ADR-0009-shared-platform-services.md` |
| ADR-0010 | TradeFlowKit uses jobs/work orders as the primary operational entity with first-class tasks beneath jobs; projects are excluded absent real multi-job semantics. | Accepted | `docs/adr/ADR-0010-tradeflowkit-job-task-model.md` |
| ADR-0011 | TradeFlowKit approved scope is deterministic lead-to-cash field operations; duplicate authority, overlapping Call Recovery, unsafe autonomous/provider paths, and destructive legacy surfaces are intentionally excluded. | Accepted | `docs/adr/ADR-0011-tradeflowkit-approved-product-scope.md` |
| ADR-0012 | TechDeck owns documentation-grade network/IPAM and configuration records linked to shared Directory clients/sites; it does not claim discovery or device mutation. | Accepted | `docs/adr/ADR-0012-techdeck-network-ipam-ownership.md` |
| ADR-0013 | TechDeck stores bounded external vault references only and exposes no plaintext secret or reveal path. | Accepted | `docs/adr/ADR-0013-techdeck-credential-references.md` |
| ADR-0014 | TechDeck runbooks are documentation-only; remote execution requires a separately approved signed endpoint-agent boundary. | Accepted | `docs/adr/ADR-0014-techdeck-remote-action-boundary.md` |
| ADR-0015 | PulseDesk owns PHI-minimized healthcare operations service delivery; TechDeck retains technical configuration/network ownership and neither product duplicates shared Directory authority. | Accepted | `docs/adr/ADR-0015-pulsedesk-healthcare-operations-boundary.md` |
| ADR-0016 | TorqueShed separates private/personal, tenant/team, and future public-build views; plaintext VINs are never retained and diagnostics are never public-build data. | Accepted | `docs/adr/ADR-0016-torqueshed-ownership-vin-public-build-boundary.md` |
| ADR-0017 | Torque Assist uses server-selected providers, strict evidence/safety output, signed OperatorOS credits, and an append-only computed-balance ledger with atomic exact debits. | Accepted | `docs/adr/ADR-0017-torque-assist-provider-safety-ledger.md` |
| ADR-0018 | TorqueShed marketplace/community is authenticated and tenant-scoped; transactions remain off-platform, protection/verification claims are prohibited, and privacy/abuse/moderation controls are server-enforced. | Accepted | `docs/adr/ADR-0018-torqueshed-marketplace-community-policy.md` |
| ADR-0019 | FaultlineLab uses immutable versioned challenges, append-only investigation evidence, server-only scoring, and no certificate claim; only four validated source cases are playable. | Accepted | `docs/adr/ADR-0019-faultlinelab-server-scored-challenge-boundary.md` |
| ADR-0020 | Ninja Pool Hall approves Free Shoot, CPU, and hot-seat play; physical simulation remains local, server rules persist explicitly unverified results, and the unauthenticated relay is excluded. | Accepted | `docs/adr/ADR-0020-ninja-pool-hall-local-result-trust-boundary.md` |
| ADR-0021 | BrandForgeOS owns a tenant-scoped creative workspace and provider-backed generation; OperatorOS retains identity, tenant, billing, entitlement, usage and provider authority, while random analytics and fake integrations are excluded. | Accepted | `docs/adr/ADR-0021-brandforgeos-creative-workspace-boundary.md` |
| ADR-0022 | SnapProofOS owns tenant-scoped evidence cases, private captures, append-only custody, review and defensible reports; OperatorOS retains identity, tenant, entitlement, upload, audit and integration authority, while public raw URLs and legacy share links are excluded. | Accepted | `docs/adr/ADR-0022-snapproofos-evidence-integrity-boundary.md` |
| ADR-0023 | StudyForge AI owns tenant-scoped sources and reviewed learning workflows; OperatorOS retains identity, tenant, entitlement, billing, provider and usage authority, and unverifiable source attribution is rejected. | Accepted | `docs/adr/ADR-0023-studyforge-learning-and-ai-boundary.md` |
| ADR-0024 | Ninja Launch Kit owns time-bounded tenant launch execution, reviewed artifacts and evidence-based readiness; OperatorOS and BrandForgeOS retain their platform and reusable-brand authority. | Accepted | `docs/adr/ADR-0024-ninja-launch-kit-product-and-readiness-boundary.md` |
| ADR-0025 | CallCommand AI owns consent-first business call operations; providers fail closed, callbacks are signed/deduplicated, and recording URLs are never exposed. | Accepted; OutCall reservation superseded by ADR-0027 | `docs/adr/ADR-0025-callcommand-outcall-consent-and-provider-boundary.md` |
| ADR-0026 | Ninjamation owns tenant-scoped PC automation script authoring, immutable versions, static review, admin approval and audited downloads; OperatorOS never executes scripts and AutoWorkFlowHub is excluded. | Accepted | `docs/adr/ADR-0026-ninjamation-script-library-and-execution-boundary.md` |
| ADR-0027 | OutCall is a distinct verified-self exit-assistance and personal-safety add-on; CallCommand remains business call operations and live safety/provider features fail closed until separately accepted. | Accepted | `docs/adr/ADR-0027-outcall-personal-safety-and-provider-boundary.md` |

## Required future ADRs

- OutCall live Twilio/consent/abuse-control activation decision after controlled provider acceptance.

ADRs must state context, decision, consequences, data/security impact,
migration/rollback implications, and superseded records.
