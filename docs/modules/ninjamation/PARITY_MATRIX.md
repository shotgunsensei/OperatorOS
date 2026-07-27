# Ninjamation parity matrix

Status: Phase 12A source/local state 4 candidate. Imported source remains
read-only evidence, not an executable child application. Deployment and
cutover gates remain open.

## Provenance

| Evidence | Value |
| --- | --- |
| Standalone checkout | `C:\Dev\Ninjamation` |
| Remote | `https://github.com/shotgunsensei/AutomationPacks.git` |
| Replit application branch | `master` |
| Pinned application commit | `cca75338d04ed35b89f28d614eb51559735aa32f` |
| Endpoint catalog branch | `main` |
| Pinned catalog commit | `ca0e55fd086f6751a43964927166bfa69db012b6` |
| Imported snapshot | `apps/modules/ninjamation/source` |
| Snapshot inventory | 263 tracked; 184 retained; 2,855,775 bytes |
| Exclusions | 79 generated/mock/attached/environment artifacts |
| High-confidence secret findings | 0 |
| License evidence | application `package.json`: MIT; no application-branch LICENSE; main-branch LICENSE: Apache-2.0 |
| Explicit non-source | AutoWorkFlowHub; owner identified it as discontinued |
| Authority decision | `docs/adr/ADR-0026-ninjamation-script-library-and-execution-boundary.md` |

## Product parity

| Source capability | OperatorOS target | Phase 12A acceptance |
| --- | --- | --- |
| Script library | Tenant-private persistent library | Filtered by trusted tenant; no public/global leakage |
| Script formats | PowerShell, Python, batch, Bash | Constrained formats and safe extensions |
| Script detail/download | Immutable versioned bodies and approved download | Current approved version only; hash and audit evidence |
| Search/category metadata | Name, description, category, format, risk, status | Persistent bounded metadata; no fake counters |
| AI script generator | Shared provider-backed draft generation | Idempotent, usage-recorded, monthly bounded, review required |
| Safety review | Deterministic static analysis plus human workflow | Critical findings block admin approval |
| Administration | OperatorOS tenant role and module grants | No child admin, users, sessions, or plan authority |
| Subscription | OperatorOS add-on entitlement | No child Stripe checkout or webhook |
| GitHub sync | Commit-pinned dry-run provenance only | No live credential, automatic sync, or silent code import |
| Downloads | Append-only exact-version ledger | Derived counts; no client mutation |
| Execution | Explicitly unsupported | No server/browser/endpoint run claim |

## Explicit exclusions

- AutoWorkFlowHub and all of its architecture/data.
- Replit Auth, mobile bearer exchange, users, sessions, roles, password flows.
- Child Stripe products, prices, customers, subscriptions, checkout, portal,
  and webhooks.
- GitHub tokens, automatic repository synchronization, and unreviewed
  repository code activation.
- Mutable/fake download counters and static dashboard totals.
- Child admin authority.
- Script execution, remote endpoint mutation, background command jobs, and
  claims that code was tested or deployed.
- Embedded credentials, obfuscated commands, dynamic eval, remote
  pipe-to-shell, persistence/security-control bypass, and destructive root
  operations.
- Cross-module trigger/action orchestration advertised by the retired
  placeholder shell.

## Threat model and controls

| Threat | Control |
| --- | --- |
| Cross-tenant script read/reference | Trusted predicates plus composite tenant FKs; foreign IDs are not found |
| UI-only authorization | Read/write/admin guards on the server |
| Unreviewed code distribution | Draft/review/admin-approval lifecycle; only approved current version downloads |
| Approval bypass after edit | Every edit resets status and approval; new bodies become immutable versions |
| AI hallucinated/dangerous code | Draft-only output, static analysis, critical block, human review, no execution |
| Replay/double charging | Shared idempotency plus unique generation key and append-only usage event |
| Secret/code leakage | Bodies excluded from lists/logs/audit; prompt hash only; no public URLs |
| Malicious filename/content sniffing | Server safe filename, plain text, `nosniff`, private no-store |
| Fake popularity | Download count derives from exact-version download rows |
| Supply-chain/license ambiguity | Commit pins, quarantined snapshot, per-script license/review gate |
| Endpoint compromise | Execution is unsupported; signed-agent boundary requires a future ADR |

## State-5 gate

Phase 12A satisfies its source/local state 4 gate: focused contracts and 4/4
PostgreSQL workflows, clean API aggregate 836/836, clean/idempotent 28-step
release, typecheck, production build/core preflight, compiled health/readiness,
production-host SSO matrix 9/9, and first-screen workflows 2/2 pass locally.

State 5 additionally requires deployment of the exact reviewed commit,
deployed-host acceptance, an authorized no-data/source-data reconciliation and
cutover record, backup/restore evidence, and explicit release approval. Local
source implementation is not production readiness.
