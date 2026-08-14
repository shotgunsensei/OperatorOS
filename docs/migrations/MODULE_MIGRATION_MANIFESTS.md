# Phase 13 module migration manifests

The executable source of truth is
`apps/api/src/lib/migration-program.ts`. Every manifest defines source/version,
commit, export method, target release step, mappings, reconciliation, conflict
policy, rollback, write freeze, and cutover blockers.

| Module | Pinned source | Target step | Export and mapping disposition | Exact reconciliation | Production blockers |
|---|---|---|---|---|---|
| TradeFlowKit | Original `6d0c13df5e324f6aba9cdf2cf14a550d0cf0ca55`; restored evidence `37aa67f1da804fc3ac56f36e50e01362077d7a26`; export v1 | `tradeflowkit_tables` | Read-only scoped snapshot; approved source org/target tenant/admin/user map; Directory customers; core jobs/quotes/invoices/leads/tasks/activity; authority/provider tokens excluded; workflows/general tasks/contacts require a later version | Stable export/record fingerprints, counts/refs, minor-unit financial totals, tenant scope, replay/drift, sanitized audit | Real frozen export, v1 exclusion review, identity/tenant map, backup/restore, Phase 16 gap closure, deployed acceptance; guarded production apply remains a human gate |
| TorqueShed | `508b384b6f66a1eacd3d4cd8d9c5edd4bf47fe75`, export v1 | `torqueshed_tables` | Read-only checkout; explicit identities; private bytes; social data only if authoritative | Counts, 14-style refs, integer costs, bytes/SHA-256, ownership | Clean export, social dataset decision, browser and restore evidence |
| TechDeck | `8125f8d89d8d39d60a50c8061a26133a0c917792`, export v1 | `techdeck_tables` | Directory clients/sites; inventory/topology/docs; secret values and remote actions excluded | Counts, refs, relationships, attachment hashes | Frozen export, tenant/user map, vault-reference review |
| PulseDesk | `937849471e489ed23db2a263d04160a388402740`, privacy-minimized export v1 | `pulsedesk_tables` | Directory organizations/sites/contacts; operational records; PHI/credentials rejected | Counts/refs, zero privacy findings, ownership, timestamps, attachment hashes | Privacy-reviewed export and owner sign-off |
| FaultlineLab | `46877aae35565149ccf4f4988dd94627fc6bb92b` | `faultlinelab_tables` | Compiler-discovered `allCases` catalog; every valid definition imported by source hash into a published immutable version | Unique IDs/slugs, references, assets, scoring bounds, compiler/content hashes, zero authority/billing, zero exclusions | Deployed acceptance; future user/session data export separately approved |
| Ninja Pool Hall | `62439c4018ec551ce2891800351200c8ab2cb9e7` | `ninja_pool_hall_tables` | Hash-verified engine promotion; zero durable source rows; localStorage/relay excluded | Five file hashes and zero source/authority rows | Deployed gameplay acceptance |
| BrandForgeOS | `5e78bc2ee6c8086ddd589bb7416f1d4560ffbb4e` | `brandforgeos_tables` | Pinned evidence; future business rows require authorized export and owners | Manifest/file hashes; later exact row/ref counts; zero credentials | Export, tenant/user map, duplicate policy |
| SnapProofOS | `26bded38c13b5b6361d407462c68052b0c30613d` | `snapproofos_tables` | Jobs/findings/notes; private file bytes only; reports regenerated; public URLs excluded | Counts, bytes/SHA-256, custody, ownership, retention | Export, private bytes, mapping, integrity acceptance |
| StudyForge AI | `a607a9f34442b1d0f6bfffbf0293609529494825` | `studyforge_complete_product_tables` (v42; after `studyforge_tables`) | Pinned descriptor; authorized folders/sets/raw notes/all generated artifacts/progress/attempts/plans/countdowns/activity; identity/billing/provider authority excluded | Counts/hashes, exact owners, source grounding/provenance, dates/statuses, attempts/sessions/activity, zero duplicate usage | Authorized frozen export, tenant/user map, target backup/restore, provider and deployed acceptance |
| Ninja Launch Kit | `30bd1abc05846926e97bc7b26c5b7d6625e8f161` | `ninja_launch_kit_tables` | Pinned descriptor; launches/artifacts/bounded brand snapshot | Counts/hash, owners, approval/archive state | Export, owner map, artifact review |
| CallCommand AI | `d49434e1d641d62cc141591c7208539a7afbf11e` | `callcommand_tables` | Safe channels/profiles/calls; consent/suppression; raw payloads/recordings excluded | Counts/hash, phone ownership, consent, suppression, safe provider IDs | Export, privacy approval, live provider |
| Ninjamation | app `cca75338d04ed35b89f28d614eb51559735aa32f`; AutomationPacks `ca0e55fd086f6751a43964927166bfa69db012b6` | `ninjamation_tables` | Dual-pinned catalog; every script becomes an unapproved reviewed draft | Counts/body hashes, secret/static/license review, owners | Export, owner map, human review of every script |
| OutCall | no repository; `owner-phase-prompts-plus-adr-0027` | `outcall_tables` | Explicit zero-row import; do not infer data from CallCommand | Zero source rows, empty target before first use, zero authority/secrets | Live provider and deployed acceptance |

Duplicate IDs, source drift, missing owners/references, privacy or secret-shaped
fields, unsafe provider records, and implicit merges are fatal. There is no
“best effort” production import policy.
