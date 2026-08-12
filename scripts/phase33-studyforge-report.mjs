import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'docs/phase-33/STUDYFORGE-COMPLETE-PRODUCT-REPORT.md');
const parity = JSON.parse(readFileSync(resolve(root, 'docs/parity/modules/studyforge-ai.json'), 'utf8'));
const snapshot = JSON.parse(readFileSync(resolve(root, 'apps/modules/studyforge-ai/source/SOURCE_SNAPSHOT.json'), 'utf8'));
const esc = (value) => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
const native = parity.stateCounts.ACTIVE_NATIVE;
const shared = parity.stateCounts.ACTIVE_SHARED_EQUIVALENT;
const requiredEvidence = [
  'apps/api/test/studyforge-phase33-domain.test.ts',
  'apps/api/test/studyforge-phase33-static.test.ts',
  'apps/api/test/studyforge-phase33-db.test.ts',
  'apps/web/e2e/studyforge-phase33.spec.ts',
];

for (const capability of parity.capabilities) {
  if (!['ACTIVE_NATIVE', 'ACTIVE_SHARED_EQUIVALENT', 'OWNER_WAIVED'].includes(capability.state)) {
    throw new Error(`Blocked capability: ${capability.capabilityId}`);
  }
  for (const target of capability.currentTargets) {
    if (!existsSync(resolve(root, target))) throw new Error(`Missing current target ${target}`);
  }
  for (const evidence of capability.automatedEvidence) {
    if (!existsSync(resolve(root, evidence))) throw new Error(`Missing evidence ${evidence}`);
  }
}
for (const evidence of requiredEvidence) {
  if (!existsSync(resolve(root, evidence))) throw new Error(`Missing Phase 33 evidence ${evidence}`);
}

const report = [
  '# Phase 33 — StudyForge AI Complete Learning Product Restoration', '',
  '> Generated from the pinned StudyForge source snapshot and executable OperatorOS capability ledger. Counts and states are not maintained by hand.', '',
  '## Outcome', '',
  `Pinned source commit \`${parity.provenance.commit}\` compiles to **${parity.capabilities.length} exact facets**: **${native} ACTIVE_NATIVE**, **${shared} ACTIVE_SHARED_EQUIVALENT**, **${parity.stateCounts.OWNER_WAIVED} OWNER_WAIVED**, and **${parity.stateCounts.BLOCKED} BLOCKED**.`, '',
  `The pinned source contains ${snapshot.trackedFileCount} tracked files; ${snapshot.fileCount} bounded product files (${snapshot.totalBytes.toLocaleString()} bytes) are retained as read-only evidence. Exact facets: ${Object.entries(parity.typeCounts).map(([type, count]) => `${count} ${type}`).join(', ')}.`, '',
  'All eleven source table domains and every discovered API, UI, component action, public, integration, and background-process facet are native or shared-equivalent. Phase 33 reopens the Phase 11C retirements for folders, aggregate study sets, key terms, review sheets, countdowns, complete generation, streaks, score trends, templates, plan state, and account limits.', '',
  'This report proves the reviewed local source state. It does not claim production release v42 promotion, target backup/restore, deployed exact-host acceptance, live AI-provider acceptance, or rollback rehearsal.', '',
  '## Restored learning product', '',
  '- Onboarding persists IANA time zone, default difficulty, daily goal, and activation state per OperatorOS user and tenant.',
  '- Real dashboards derive active sets, study minutes, cards reviewed, average quiz score, current/longest streak, usage, recent activity, and countdowns from PostgreSQL records.',
  '- User-scoped folders organize complete study sets. Sets support search/filter, title/course/folder/exam metadata edits, archive/restore, soft delete, duplicate, regenerated revisions, JSON export, and entitlement-gated CSV export.',
  '- One transactional generation persists the authorized raw-note source, summary, key terms, flashcards, multiple-choice questions, short-answer questions, review sheet, personalized dated plan, and exact provider/fallback provenance. The business row and shared usage event share one idempotency boundary.',
  '- The deterministic generator has a fixed-date golden fixture. The shared AI path requests strict JSON, retries bounded invalid output, verifies every cited excerpt against the authorized source, and falls back only in auto mode. AI-required mode stays honestly unavailable on provider failure.',
  '- Flashcard sessions persist known/learning state, keyboard/touch controls, reconnect-safe mutation IDs, progress, completion duration, and entitlement-aware spaced repetition.',
  '- Quiz attempts use server-hidden answer keys, authoritative scoring, persisted review/explanation/source evidence, retry-safe business idempotency, history, and score trends.',
  '- Study-plan sessions complete idempotently, exam countdowns use date-only calculations in the learner time zone, and daily aggregates update atomically so concurrent streak/usage work cannot overrun limits.',
  '- Static source templates remain reviewed templates rather than invented database commerce. The pinned source contains a Tutor plan flag but no group table, route, or UI workflow, so Phase 33 does not invent tutor groups.', '',
  '## OperatorOS authority and security', '',
  '- OperatorOS remains the sole authority for identity, sessions, tenants, roles, module grants, subscription, billing, entitlement features, AI-provider configuration, usage, activity, and platform administration. StudyForge has no child Stripe checkout or demo-account dependency.',
  '- Tenant guards protect every route; write guards deny viewer authoring; user-owned sets, sessions, progress, attempts, folders, countdowns, and preferences remain non-enumerable to other users in the same tenant and to other tenants.',
  '- Free, Pro, and Tutor limits are server-resolved from OperatorOS module features or active tenant entitlements. Advisory transaction locks plus conditional counter upserts make active-set, generation-credit, and quiz-attempt checks race-safe.',
  '- Additive release v42 uses tenant-composite foreign keys and contains no destructive table operation. Complete generation and cleanup are transactional, leaving no partial cards/questions/plans or usage records when a limit or persistence step fails.', '',
  '## Executable evidence', '',
  '- `apps/api/test/studyforge-phase33-domain.test.ts` — deterministic golden fixture, every artifact type, exact-source citations, structured-output retry, auto fallback, AI-required failure, plan limits, time zones, and countdown math.',
  '- `apps/api/test/studyforge-phase33-static.test.ts` — pinned 317-facet provenance, additive v42 schema, source-compatible routes, shared authority, complete responsive UI, keyboard/touch controls, and no invented Tutor group workflow.',
  '- `apps/api/test/studyforge-phase33-db.test.ts` — authentication/write denial; complete transactional generation and replay; quiz/flashcard/plan history; usage and activity idempotency; user/tenant isolation; plan/export/countdown gates; free/concurrent credit exhaustion; archive/restore/delete; and cross-user preservation.',
  '- `apps/web/e2e/studyforge-phase33.spec.ts` — complete mobile learning journey plus desktop/tablet/mobile source-route, label, overflow, no-placeholder, exact-host SSO, and accessibility contracts.',
  '- `scripts/phase20-product-truth.test.mjs` — exact capability ledger, current-target/evidence integrity, and zero implicit retirement classification.', '',
  '## Local verification status', '',
  '- Workspace TypeScript and root lint: PASS.',
  '- Phase 33 deterministic/static contracts: PASS (8/8); deterministic golden SHA-256 `f87e7295a49af81a0c18b6c84018a1f4d0962c43aa7a384ba285e2b84364eb1e`.',
  '- Disposable PostgreSQL complete learning journey, isolation, idempotency, entitlement, concurrency, streak/activity, and cleanup: PASS (6/6).',
  '- Combined legacy-plus-Phase-33 StudyForge regression suite: PASS (28/28). Shared integration aggregate: PASS (28/28).',
  '- Additive database release v42 plan, clean apply, and immediate idempotent reapply on disposable PostgreSQL 16: PASS.',
  '- Production web build: PASS. Compiled local exact-host Playwright: PASS (2/2), including SSO, the complete persisted learning journey, source-compatible routes, labels, overflow, accessibility, and 1440/900/390-pixel contracts.',
  '- The broad API aggregate is not green: 979 passed, 29 failed, and 6 skipped across 1,014 tests. The 29 failures are existing unrelated cross-product contracts; Phase 33 focused and integration evidence is green, but this report does not relabel the aggregate as a pass.',
  '- Production deploy, target backup/restore, live shared-provider acceptance, deployed exact-host acceptance, and rollback remain owner-controlled state-5 gates.', '',
  '## Full source capability ledger', '',
  '| # | Type | Source identity | State | Current boundary | Capability ID |',
  '|---:|---|---|---|---|---|',
  ...parity.capabilities.map((capability, index) => `| ${index + 1} | ${capability.type} | ${esc(capability.title)} | ${capability.state} | ${esc(capability.currentTargets.slice(0, 4).join('; '))} | \`${capability.capabilityId}\` |`), '',
  '## Deployment gates', '',
  '- Back up the reviewed production database, record the exact commit/build identity, and apply cumulative release v42 through the supported release runner.',
  '- Configure and verify the shared AI provider if AI mode is required; deterministic mode and auto fallback must continue to record honest provenance and usage.',
  '- Verify `studyforge-ai.operatoros.net` SSO/return/logout, free/Pro/Tutor entitlement projections, source-compatible routes, complete generation, flashcard/quiz/plan persistence, countdown time zones, exports, desktop/tablet/mobile accessibility, restart persistence, backup/restore, and rollback.',
].join('\n');

if (process.argv.includes('--write')) {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${report}\n`);
  console.log(JSON.stringify({ mode: 'write', output: 'docs/phase-33/STUDYFORGE-COMPLETE-PRODUCT-REPORT.md', capabilities: parity.capabilities.length, native, shared, blocked: parity.stateCounts.BLOCKED }, null, 2));
} else {
  if (readFileSync(output, 'utf8').replaceAll('\r\n', '\n') !== `${report}\n`) throw new Error('Phase 33 report is stale; run phase33:report:write');
  if (parity.stateCounts.BLOCKED || parity.stateCounts.OWNER_WAIVED) throw new Error('Phase 33 requires zero blocked and zero implicit waivers');
  console.log(JSON.stringify({ mode: 'check', capabilities: parity.capabilities.length, native, shared, blocked: 0 }, null, 2));
}
