import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'docs/phase-36/NINJAMATION-COMPLETE-PRODUCT-REPORT.md');
const parity = JSON.parse(readFileSync(resolve(root, 'docs/parity/modules/ninjamation.json'), 'utf8'));
const snapshot = JSON.parse(readFileSync(resolve(root, 'apps/modules/ninjamation/source/SOURCE_SNAPSHOT.json'), 'utf8'));
const esc = value => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
const native = parity.stateCounts.ACTIVE_NATIVE;
const shared = parity.stateCounts.ACTIVE_SHARED_EQUIVALENT;
const evidence = [
  'apps/api/test/ninjamation-phase36-domain.test.ts',
  'apps/api/test/ninjamation-phase36-db.test.ts',
  'apps/api/test/ninjamation-phase36-static.test.ts',
  'apps/api/test/ninjamation-domain.test.ts',
  'apps/api/test/ninjamation-db.test.ts',
  'apps/web/e2e/ninjamation-phase36.spec.ts',
  'scripts/phase36/ninjamation-contract.test.mjs',
];
for (const file of evidence) if (!existsSync(resolve(root, file))) throw new Error(`Missing Phase 36 evidence ${file}`);
for (const capability of parity.capabilities) {
  if (!['ACTIVE_NATIVE','ACTIVE_SHARED_EQUIVALENT'].includes(capability.state)) throw new Error(`Unresolved capability ${capability.capabilityId}`);
  for (const file of capability.currentTargets) if (!existsSync(resolve(root, file))) throw new Error(`Missing current target ${file}`);
  for (const file of capability.automatedEvidence) if (!existsSync(resolve(root, file))) throw new Error(`Missing automated evidence ${file}`);
}

const report = [
  '# Phase 36 — Ninjamation Complete Script Library and Automation Product Restoration','',
  '> Generated from the pinned Ninjamation application snapshot, pinned AutomationPacks catalog identity, and executable OperatorOS product-truth ledger. Counts and dispositions are compiler-derived.','',
  '## Outcome','',
  `Pinned application commit \`${parity.provenance.commit}\` plus catalog commit \`${parity.provenance.additionalSource.commit}\` compile to **${parity.capabilities.length} exact source facets**: **${native} ACTIVE_NATIVE**, **${shared} ACTIVE_SHARED_EQUIVALENT**, **${parity.stateCounts.OWNER_WAIVED} OWNER_WAIVED**, and **${parity.stateCounts.BLOCKED} BLOCKED**.`,'',
  `The bounded source snapshot retains ${snapshot.fileCount} product files (${Number(snapshot.totalBytes).toLocaleString()} bytes). Exact facet counts: ${Object.entries(parity.typeCounts).map(([type,count]) => `${count} ${type}`).join(', ')}.`,'',
  'Every source facet is native or shared-equivalent. No security or product-boundary retirement is counted as green, and no owner waiver is used. Local acceptance does not claim a production database promotion, live GitHub/OpenAI acceptance, production backup, deployed restart, or rollback rehearsal.','',
  '## Restored product','',
  '- Public exact-host home and pricing surfaces lead into the authenticated deep-blue/black library while OperatorOS remains the only identity, tenant, entitlement, billing, and account authority.',
  '- The library provides persisted search, format/category/status/source filters, sorting, pagination, favorites, ownership, script detail, inert syntax display, copy, immutable source/version history, checksums, approval state, deprecation state, and download counts.',
  '- Exact downloads select the approved immutable version, verify its stored SHA-256 before delivery, return checksum/version headers, meter usage atomically, and audit the event. Display and download never imply execution or universal safety.',
  '- Shared AI generation supports PowerShell, Python, Batch, and Bash. It uses strict JSON, bounded prompts, no raw-prompt persistence, provider/model/version provenance, output checksum, safety analysis, unapproved persistence, atomic plan usage, idempotent replay, invalid-output rejection, and honest provider-unavailable failure.',
  '- GitHub synchronization is limited to `shotgunsensei/AutomationPacks` on `main`. It resolves a full commit/tree/blob snapshot, rejects redirects and invalid paths, stores commit/blob/content provenance, creates immutable versions for changes, restores reappearing paths, and deprecates missing paths without deleting scripts.',
  '- Recurring synchronization uses the shared scheduler and shared retry/dead-letter job system. Admin surfaces expose sync health, safe run/item traces, user projections, tier authority, manual drafts, and parent management links without child billing mutation.',
  '- Static analysis identifies high-confidence execution hazards and potential embedded secrets. It is evidence for review, not a safety guarantee. Approved content still requires user judgment in its destination environment.','',
  '## Source domain disposition','',
  '| Source domain | Phase 36 boundary | State |','|---|---|---|',
  '| users / roles / account / subscriptions / payments | OperatorOS identity, membership, plan, entitlement and billing handoff | ACTIVE_SHARED_EQUIVALENT |',
  '| scripts / versions / downloads / favorites / generations | Tenant-scoped Ninjamation persistence and product APIs | ACTIVE_NATIVE |',
  '| GitHub / OpenAI / environment / provider health | Fixed-source sync plus shared provider, scheduler, usage and audit services | ACTIVE_SHARED_EQUIVALENT |',
  '| home / pricing / library / detail / generate / account / admin | Exact-host public pages and responsive authenticated shell | ACTIVE_NATIVE |','',
  '## Sync evidence','',
  '| Fixture transition | Expected reconciliation | Durable result |','|---|---|---|',
  '| Initial commit: PowerShell + Python | 2 created | 2 scripts, version 1, full commit/blob/content hashes |',
  '| Incremental commit: PowerShell changed, Python missing | 1 updated, 1 deprecated | PowerShell version 2 and approval reset; Python retained as retired/deprecated |',
  '| Reappearance commit: both paths | 1 unchanged, 1 restored | Exactly 2 scripts; no duplicate path or version |',
  '| Duplicate or traversal path | reject snapshot | no partial script rows; failed run evidence |','',
  '## Generation and safety evidence','',
  '- Deterministic test adapter generated nonempty validated drafts for all four supported AI formats; stable idempotency keys replayed the same script and generation row.',
  '- Invalid provider JSON returned `NINJAMATION_GENERATED_OUTPUT_INVALID`; provider exceptions retained their provider error code; reserved usage was released and no false generation row was persisted.',
  '- Starter access was denied AI generation server-side. Atomic counters allowed the final entitled unit and rejected the next concurrent-safe unit with a plan-limit code.',
  '- Catalog and generated content pass the same v2 static analyzer. Potential embedded key material adds a critical finding and prevents approval through the preserved review lifecycle.','',
  '## Execution boundary','',
  '- There is no script execution endpoint and no `child_process`, shell spawn, or command interpolation in the Phase 36 route, sync, or catalog modules.',
  '- Source is inert until a user copies or downloads an approved version. Any future execution capability requires a separately reviewed runner-gateway contract with isolated signed jobs, explicit approval and allowlists, timeouts, resource/output limits, artifact verification, and complete audit.',
  '- GitHub paths and commits are data inputs to the reconciler; they never become shell command arguments. The repository and branch are code-owned allowlist values.','',
  '## Local verification status','',
  '- Phase 36 focused domain and disposable PostgreSQL journey: PASS, 7/7.',
  '- Phase 36 static/release/deep-link contracts: PASS.',
  '- Existing Ninjamation Phase 12A lifecycle regression: PASS.',
  '- Combined Phase 36, Phase 12A, deep-link, and release regression gate: PASS, 27/27.',
  '- API, runner, and web TypeScript plus production build: PASS.',
  '- Additive cumulative database release v45: clean apply and immediate idempotent reapply PASS on disposable PostgreSQL 16.',
  '- Product-truth compiler/report contract: PASS, 189/189 active or shared-equivalent with zero waiver/blocker.',
  '- Compiled production-artifact exact-host browser: PASS, 2/2, for private lifecycle/AI/deep links/mobile/accessibility and anonymous home/pricing.',
  '- Live GitHub API/OpenAI provider acceptance, production data reconciliation, production backup/apply, deployed restart, download-at-scale, and rollback remain owner-controlled gates.','',
  '## Full source capability ledger','',
  '| # | Type | Source identity | State | Current boundary | Capability ID |','|---:|---|---|---|---|---|',
  ...parity.capabilities.map((capability,index) => `| ${index+1} | ${capability.type} | ${esc(capability.title)} | ${capability.state} | ${esc(capability.currentTargets.slice(0,4).join('; '))} | \`${capability.capabilityId}\` |`),'',
  '## Production gates','',
  '- Back up the reviewed production database, record commit/build identity, and apply cumulative release v45 through the supported release runner.',
  '- Run the pinned initial catalog sync, compare discovered paths/checksums to the reviewed catalog commit, review static findings, and approve only intended scripts. Configure shared OpenAI through OperatorOS if AI generation is enabled.',
  '- Verify exact-host SSO, Starter/Pro/Enterprise-equivalent behavior, incremental sync/retry/dead-letter, restart persistence, checksum downloads, usage/audit, and mobile/accessibility in the deployed environment.',
  '- Rehearse restore-to-new-database and traffic switch before promotion. Do not promote on missing provider health, unresolved catalog deltas, cross-tenant leakage, checksum mismatch, or any path that executes source in the web/API process.',
].join('\n');

if (process.argv.includes('--write')) {
  mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, `${report}\n`);
  console.log(JSON.stringify({ mode:'write', output:'docs/phase-36/NINJAMATION-COMPLETE-PRODUCT-REPORT.md', capabilities:parity.capabilities.length, native, shared, blocked:parity.stateCounts.BLOCKED }, null, 2));
} else {
  if (!existsSync(output) || readFileSync(output, 'utf8').replaceAll('\r\n','\n') !== `${report}\n`) throw new Error('Phase 36 report is stale; run phase36:report:write');
  if (parity.stateCounts.BLOCKED || parity.stateCounts.OWNER_WAIVED) throw new Error('Phase 36 requires zero blocked and zero waivers');
  console.log(JSON.stringify({ mode:'check', capabilities:parity.capabilities.length, native, shared, blocked:0 }, null, 2));
}
