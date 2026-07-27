# Ninjamation module

Status: canonical source imported; active OperatorOS implementation is a
tenant-scoped script library and review workflow.

- Canonical host: `https://ninjamation.operatoros.net`
- Commercial class: paid add-on
- Source repository: `https://github.com/shotgunsensei/AutomationPacks.git`
- Application branch/commit: `master` /
  `cca75338d04ed35b89f28d614eb51559735aa32f`
- Catalog branch/commit: `main` /
  `ca0e55fd086f6751a43964927166bfa69db012b6`
- Imported evidence: `apps/modules/ninjamation/source`
- Active UI: `apps/web/src/components/module-shells/NinjamationShell.tsx`
- Active API: `/v1/modules/ninjamation/*`
- Product decision:
  `docs/adr/ADR-0026-ninjamation-script-library-and-execution-boundary.md`

The source product is a PC automation script library and AI script generator.
OperatorOS owns identity, sessions, tenants, roles, billing, entitlements,
provider selection, usage, audit, approval, and launch routing. Replit Auth,
child Stripe, GitHub credentials/sync authority, mutable download counters,
and the child admin surface are not activated.

Scripts are tenant-private drafts with immutable content versions and
deterministic static analysis. A tenant admin must approve the current version
before an audited download. Editing an approved script creates a new draft
version and clears approval. OperatorOS does not execute scripts locally or on
endpoints. Remote execution requires a separately approved signed-agent,
identity, consent, policy, and rollback boundary.

`C:\Dev\AutoWorkFlowHub-master` was explicitly identified by the owner as a
discontinued project. It is noncanonical and excluded from the snapshot,
product definition, migration plan, and parity claim.
