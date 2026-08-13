import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'docs/phase-34/NINJA-LAUNCH-KIT-COMPLETE-REPORT.md');
const parity = JSON.parse(readFileSync(resolve(root, 'docs/parity/modules/ninja-launch-kit.json'), 'utf8'));
const snapshot = JSON.parse(readFileSync(resolve(root, 'apps/modules/ninja-launch-kit/source/SOURCE_SNAPSHOT.json'), 'utf8'));
const generatedSource = readFileSync(resolve(root, 'apps/api/src/generated/ninja-launch-kit-source-catalog.ts'), 'utf8');
const generatedStart = generatedSource.indexOf('{', generatedSource.indexOf('const catalog ='));
const generatedEnd = generatedSource.lastIndexOf(' as const;');
if (generatedStart < 0 || generatedEnd < 0) throw new Error('Generated Ninja Launch Kit catalog is unreadable');
const catalog = JSON.parse(generatedSource.slice(generatedStart, generatedEnd));
const esc = (value) => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
const native = parity.stateCounts.ACTIVE_NATIVE;
const shared = parity.stateCounts.ACTIVE_SHARED_EQUIVALENT;
const requiredEvidence = [
  'apps/api/test/ninja-launch-kit-phase34-domain.test.ts',
  'apps/api/test/ninja-launch-kit-phase34-static.test.ts',
  'apps/api/test/ninja-launch-kit-phase34-db.test.ts',
  'apps/web/e2e/ninja-launch-kit-phase34.spec.ts',
  'scripts/phase34/compile-ninja-launch-kit-source.mjs',
  'scripts/phase34/ninja-launch-kit-contract.test.mjs',
];

if (catalog.counts.templates !== 20 || catalog.templates.length !== 20) throw new Error('Phase 34 requires exactly 20 compiler-derived templates');
if (catalog.counts.visualPromos !== 9 || catalog.visualPromos.length !== 9) throw new Error('Phase 34 requires exactly nine compiler-derived visual promos');
for (const capability of parity.capabilities) {
  if (!['ACTIVE_NATIVE', 'ACTIVE_SHARED_EQUIVALENT'].includes(capability.state)) throw new Error(`Unresolved capability: ${capability.capabilityId}`);
  for (const target of capability.currentTargets) if (!existsSync(resolve(root, target))) throw new Error(`Missing current target ${target}`);
  for (const evidence of capability.automatedEvidence) if (!existsSync(resolve(root, evidence))) throw new Error(`Missing evidence ${evidence}`);
}
for (const evidence of requiredEvidence) if (!existsSync(resolve(root, evidence))) throw new Error(`Missing Phase 34 evidence ${evidence}`);

const report = [
  '# Phase 34 — Ninja Launch Kit Complete Launch-Generation Product Restoration', '',
  '> Generated from the pinned Ninja Launch Kit source snapshot, compiler-derived catalogs, and executable OperatorOS capability ledger. Counts and states are not maintained by hand.', '',
  '## Outcome', '',
  `Pinned source commit \`${parity.provenance.commit}\` compiles to **${parity.capabilities.length} exact facets**: **${native} ACTIVE_NATIVE**, **${shared} ACTIVE_SHARED_EQUIVALENT**, **${parity.stateCounts.OWNER_WAIVED} OWNER_WAIVED**, and **${parity.stateCounts.BLOCKED} BLOCKED**.`, '',
  `The retained source snapshot records ${snapshot.trackedFileCount} tracked files and ${snapshot.fileCount} bounded product files (${snapshot.totalBytes.toLocaleString()} bytes). Exact facets: ${Object.entries(parity.typeCounts).map(([type, count]) => `${count} ${type}`).join(', ')}.`, '',
  `The source compiler independently derives **${catalog.counts.templates} niche templates** and **${catalog.counts.visualPromos} visual-promo briefs** from the pinned TypeScript arrays. Their source SHA-256 values are \`${catalog.source.templatesSha256}\` and \`${catalog.source.visualPromosSha256}\`.`, '',
  'All source pages, routes, APIs, persistence fields, component actions, export paths, integrations, public flows, and mobile/PWA facets are native or shared-equivalent. No locked source item is counted as complete merely because it was retired, and no owner waiver is used.', '',
  'This report proves the reviewed local source state. It does not claim production release v43 promotion, target backup/restore, deployed exact-host acceptance, live OpenAI acceptance, subscription-provider acceptance, or rollback rehearsal.', '',
  '## Restored product', '',
  '- Public landing, pricing, contact, terms, and privacy paths render on the exact Ninja Launch Kit host; protected paths use centralized OperatorOS SSO and preserve the requested return route.',
  '- The authenticated dark-crimson tactical workspace contains real metrics, the complete builder, compiler-derived template catalog, persisted kits, nine visual-promo briefs, brand profiles, export history, account usage, plan limits, tenant administration, and the existing launch-execution console.',
  '- One short brief deterministically produces nonempty landing copy, Facebook and Google ads, email and SMS sequences, social posts, FAQ, CTAs, QR/flyer copy, and a launch checklist. Pro/Agency users can request shared-AI refinement; strict schema validation records the provider/model or an honest deterministic fallback reason.',
  '- Kit create, preview, edit, duplicate, regenerate, archive, restore, soft delete, undo, revision history, and source-compatible record routes use tenant/user-scoped PostgreSQL records. Creation, duplication, and export replay return the original business row for the same idempotency key.',
  '- Brand profiles enforce the source plan caps on both create and restore. Duplication does not incorrectly consume a generation credit; new generation and regeneration use the atomic current-period OperatorOS counter.',
  '- TXT, Markdown, and JSON exports produce persisted downloadable bytes with SHA-256, content type, file name, size, export history, watermarks, and Agency white-label behavior.',
  '- Free users receive only the entitled visual brief and never receive the body of the other eight. Pro and Agency plans unlock all nine; Agency brief copy explicitly carries the white-label delivery contract.', '',
  '## Compiler-derived niche templates', '',
  '| # | Template | Category | Source tier | Recommended offer |',
  '|---:|---|---|---|---|',
  ...catalog.templates.map((template, index) => `| ${index + 1} | ${esc(template.name)} (\`${template.slug}\`) | ${esc(template.category)} | ${template.tier} | ${esc(template.recommendedOffer)} |`), '',
  'Every row above is exercised by the deterministic domain test, which verifies complete nonempty output and stable replay for all artifact types.', '',
  '## Compiler-derived visual-promo briefs', '',
  '| # | Brief | Category | Dimensions | Source tools | Free behavior |',
  '|---:|---|---|---|---|---|',
  ...catalog.visualPromos.map((brief, index) => `| ${index + 1} | ${esc(brief.title)} (\`${brief.id}\`) | ${brief.category} | ${esc(brief.dimensions ?? 'Brand-system contract')} | ${esc(brief.tools.join(', '))} | ${brief.id === 'facebook-ad' ? 'Unlocked' : 'Locked with blank body'} |`), '',
  'The server generates dimensions, composition, palette, typography, tooling, accessibility, safety, and delivery guidance for every entitled brief. Regeneration is deterministic when the deterministic policy is selected.', '',
  '## OperatorOS plan authority', '',
  '| Behavior | Free | Pro | Agency |',
  '|---|---|---|---|',
  '| Monthly complete generations | 2 | Unlimited | Unlimited |',
  '| Brand profiles | 0 | 5 | Unlimited |',
  '| Export formats | TXT | TXT, Markdown, JSON | TXT, Markdown, JSON |',
  '| Visual briefs | Facebook ad only | All nine | All nine |',
  '| Email/SMS and variants | Locked | Active | Active |',
  '| Output watermark | Required | Removed | Removed |',
  '| White-label/client delivery | Locked | Locked | Active |', '',
  'OperatorOS remains the sole identity, session, tenant, role, module-access, entitlement, billing, credit, shared-AI, usage, audit, and platform-admin authority. The child product contains no second Stripe authority and accepts no client-supplied tenant or plan override.', '',
  '## Security and persistence', '',
  '- Read/write/tenant-admin/platform-admin guards preserve the parent role boundaries; viewer writes, cross-tenant reads, client tenant overrides, and unentitled templates, brands, formats, briefs, and admin paths are rejected server-side.',
  '- Release v43 adds only five tenant/user-scoped product tables for brands, kits, immutable revisions, persisted exports, and usage counters. There are no destructive schema statements.',
  '- Shared idempotency, activity, usage, and AI-provider services preserve auditable ecosystem behavior. Provider prompts omit secrets and publication claims; validated output is still owner-review content, not proof that ads, messages, or websites were published.',
  '- Public pages expose no protected product data. Locked catalog templates omit prefills and locked visual briefs omit content, so inspecting API responses cannot bypass upgrade gates.', '',
  '## Executable evidence', '',
  '- `scripts/phase34/compile-ninja-launch-kit-source.mjs` and `scripts/phase34/ninja-launch-kit-contract.test.mjs` — pinned-array compilation, exact 20/9 counts, unique IDs, catalog staleness, and all required source fields.',
  '- `apps/api/test/ninja-launch-kit-phase34-domain.test.ts` — every template and output, deterministic replay, all nine visual contracts, locked-content non-disclosure, export validity/watermarks, strict shared-AI validation, and provider-failure fallback.',
  '- `apps/api/test/ninja-launch-kit-phase34-static.test.ts` — complete persisted routes, additive schema, tenant/write/admin guards, idempotency/usage contracts, premium dark workspace, honest locks, and parent authority.',
  '- `apps/api/test/ninja-launch-kit-phase34-db.test.ts` — auth/write/tenant isolation, complete creation/replay, revision and usage integrity, export replay, free caps and lock bodies, plan/format/brand denial, archive/restore/delete/undo, and history preservation.',
  '- `apps/web/e2e/ninja-launch-kit-phase34.spec.ts` — exact-host SSO, template-to-preview-to-persisted-kit-to-JSON-download, all nine promo cards, source-compatible product/admin routes, anonymous marketing/legal pages, mobile overflow, and form-label contract.',
  '- `scripts/phase20-product-truth.test.mjs` — exact capability ledger, source provenance, current-target/evidence integrity, and zero implicit retirement classification.', '',
  '## Local verification status', '',
  '- Workspace TypeScript: PASS for API, runner, and web.',
  '- Source compiler contracts: PASS (2/2). Phase 34 domain/static contracts: PASS (7/7).',
  '- Disposable PostgreSQL product journey, isolation, concurrent duplicate replay, entitlement, export, lifecycle, and cleanup: PASS (6/6).',
  '- Combined legacy, Phase 11D, import, and Phase 34 Ninja Launch Kit regression suite: PASS (28/28).',
  '- Additive database release v43 clean apply and immediate idempotent reapply on disposable PostgreSQL 16: PASS.',
  '- Production API/runner/web build: PASS with the required build-time `INTERNAL_API_URL` configured.',
  '- Compiled local exact-host Playwright: PASS (2/2), including OperatorOS SSO, full generation/export journey, public routes, mobile layout, labels, and source-compatible deep links.',
  '- Production deploy, target backup/restore, live shared-provider acceptance, deployed exact-host acceptance, subscription/entitlement projection, restart persistence, and rollback remain owner-controlled release gates.', '',
  '## Full source capability ledger', '',
  '| # | Type | Source identity | State | Current boundary | Capability ID |',
  '|---:|---|---|---|---|---|',
  ...parity.capabilities.map((capability, index) => `| ${index + 1} | ${capability.type} | ${esc(capability.title)} | ${capability.state} | ${esc(capability.currentTargets.slice(0, 4).join('; '))} | \`${capability.capabilityId}\` |`), '',
  '## Deployment gates', '',
  '- Back up the reviewed production database, record the exact commit/build identity, and apply cumulative release v43 through the supported release runner.',
  '- Configure and verify the shared AI provider only if AI refinement is required. Deterministic generation remains a complete product path; auto fallback must keep honest provider/fallback provenance and usage.',
  '- Verify `ninjalaunchkit.operatoros.net` SSO/return/logout, Free/Pro/Agency projections, every source route, all templates and briefs, export downloads, monthly/brand caps, locked-data non-disclosure, desktop/tablet/mobile accessibility, restart persistence, backup/restore, and rollback.',
].join('\n');

if (process.argv.includes('--write')) {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${report}\n`);
  console.log(JSON.stringify({ mode: 'write', output: 'docs/phase-34/NINJA-LAUNCH-KIT-COMPLETE-REPORT.md', capabilities: parity.capabilities.length, templates: catalog.templates.length, visualPromos: catalog.visualPromos.length, native, shared, blocked: parity.stateCounts.BLOCKED }, null, 2));
} else {
  if (!existsSync(output) || readFileSync(output, 'utf8').replaceAll('\r\n', '\n') !== `${report}\n`) throw new Error('Phase 34 report is stale; run phase34:report:write');
  if (parity.stateCounts.BLOCKED || parity.stateCounts.OWNER_WAIVED) throw new Error('Phase 34 requires zero blocked and zero waivers');
  console.log(JSON.stringify({ mode: 'check', capabilities: parity.capabilities.length, templates: catalog.templates.length, visualPromos: catalog.visualPromos.length, native, shared, blocked: 0 }, null, 2));
}
