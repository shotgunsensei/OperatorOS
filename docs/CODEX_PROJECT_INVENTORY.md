# OperatorOS Codex Project Inventory

Date: 2026-07-14

OperatorOS is the canonical deployment repository. Standalone projects remain
useful as source-history references, but new runtime consolidation work belongs
in `C:\Dev\OperatorOS` so auth, tenants, billing, entitlements, and release
verification cannot drift.

All 13 applications have final Replit-attached `*.operatoros.net` production
destinations. Standalone branded domains are legacy references only, not
alternate app destinations or pending domain-migration work. A saved Codex
project is source-workspace organization; it does not change runtime routing.

## Saved Codex projects with imported source

| Product | Codex project path | OperatorOS snapshot |
| --- | --- | --- |
| TradeFlowKit | `C:\Dev\TradeFlowKit` | `apps/modules/tradeflowkit/source` |
| TechDeck | `C:\Dev\Tech-Deck` | `apps/modules/techdeck/source` |
| PulseDesk | `C:\Dev\PulseDesk` | `apps/modules/pulsedesk/source` |
| FaultlineLab | `C:\Dev\Faultline-Lab` | `apps/modules/faultlinelab/source` |
| Ninja Pool Hall | `C:\Dev\Shotgun-ninja-pool-hall` | `apps/modules/ninja-pool-hall/source` |
| BrandForgeOS | `C:\Dev\BrandForge-OS` | `apps/modules/brandforgeos/source` |
| SnapProofOS | `C:\Dev\snapproof` | `apps/modules/snapproofos/source` |
| StudyForge AI | `C:\Dev\Study-Forge` | `apps/modules/studyforge-ai/source` |
| Ninja Launch Kit | `C:\Dev\Ninja-Launch-Kit` | `apps/modules/ninja-launch-kit/source` |
| CallCommand AI | `C:\Dev\Call-Command-AI` | `apps/modules/callcommand-ai/source` |

The saved-project list was rechecked on 2026-07-14. The ten imported module
source projects above are present. Every imported snapshot has a
`SOURCE_SNAPSHOT.json` containing the exact Git commit, remote, counts, and
exclusions. Raw source servers remain outside the executable pnpm workspace.

## User actions still required in Codex

1. Add/open `C:\Dev\TorqueShed-Codex` as a Codex project. The directory exists
   and its source is already safely imported at
   `apps/modules/torqueshed/source`, but it is not present in the saved-project
   list.
2. Identify or create the canonical Ninjamation repository, add it as a Codex
   project, and provide its path. The current OperatorOS-native MVP remains the
   only observed implementation.
3. OutCall has no recovered canonical repository. ADR-0027 and the owner's
   recovered prompt set are the approved Phase 12B product boundary; the
   OperatorOS-native workload is authoritative unless a future source archive
   is explicitly reconciled.

Adding a folder to Codex does not publish it, attach a domain, or activate its
database migrations. All canonical Replit subdomains are already attached;
deploying the current OperatorOS source to those destinations remains a
separate release gate, and the 2026-07-14 live probes still show the old runtime.

## Drift rule

After a workflow is ported and accepted in OperatorOS, treat the corresponding
standalone route as historical. Do not continue feature development in both
places. Archive or mark the standalone repository read-only only after its
required history/assets have been preserved and the OperatorOS production
smoke passes.
