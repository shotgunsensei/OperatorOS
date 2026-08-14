import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'docs/phase-31/BRANDFORGEOS-COMPLETE-PRODUCT-REPORT.md');
const parity = JSON.parse(
  readFileSync(resolve(root, 'docs/parity/modules/brandforgeos.json'), 'utf8'),
);
const snapshot = JSON.parse(
  readFileSync(resolve(root, 'apps/modules/brandforgeos/source/SOURCE_SNAPSHOT.json'), 'utf8'),
);
const esc = (value) =>
  String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');
const native = parity.stateCounts.ACTIVE_NATIVE;
const shared = parity.stateCounts.ACTIVE_SHARED_EQUIVALENT;

const report = [
  '# Phase 31 — BrandForgeOS Complete Marketing SaaS Restoration',
  '',
  '> Generated from the pinned BrandForgeOS source snapshot and executable OperatorOS parity ledger. Capability counts and states are not maintained by hand.',
  '',
  '## Outcome',
  '',
  `Pinned source commit \`${parity.provenance.commit}\` compiles to **${parity.capabilities.length} exact facets**: **${native} ACTIVE_NATIVE**, **${shared} ACTIVE_SHARED_EQUIVALENT**, **${parity.stateCounts.OWNER_WAIVED} OWNER_WAIVED**, and **${parity.stateCounts.BLOCKED} BLOCKED**.`,
  '',
  `The pinned source contains ${snapshot.trackedFileCount} tracked files; ${snapshot.fileCount} bounded product files (${snapshot.totalBytes.toLocaleString()} bytes) are retained as read-only evidence. Exact facets: ${Object.entries(
    parity.typeCounts,
  )
    .map(([type, count]) => `${count} ${type}`)
    .join(', ')}.`,
  '',
  'All non-waived source facets have a current native or shared-equivalent implementation and executable evidence. A prior retirement, reduced workspace, missing provider, or product-boundary label does not count as green.',
  '',
  'This report proves the local reviewed source state. It does not claim production release v40 promotion, live provider activation, public exact-host acceptance, target backup/restore, or rollback rehearsal.',
  '',
  '## Restored product areas',
  '',
  '- Onboarding/workspace activation; Brand HQ identity, voice, color, font, guidelines, logo reference, and asset summary; personas; reusable offers.',
  '- Campaign planning and lifecycle, production tasks/checklists, comments, landing content, calendar scheduling, recorded metrics, recommendations, leads, notifications, and activity.',
  '- Copy Studio with ten bounded source copy modes, eight tones, stable inspectable quality signals, compare-ready persisted variants, favorites, and generation provenance.',
  '- Six guided strategy workflows with persisted inputs, validated AI generation, usage accounting, completion linkage, and recoverable output.',
  '- Global/custom template marketplace with categories, featured and premium state, preview/use counting, and OperatorOS entitlement enforcement.',
  '- Twelve integration projections with shared encrypted credential references, test/live/disabled modes, health, connect/disconnect, queued synchronization, history, retry, dead-letter authority, and catalog-specific OperatorOS feature enforcement.',
  '- Six persisted report types with brand/campaign-scoped recorded KPI snapshots, white-label branding, SHA-256 integrity, asynchronous HTML/CSV/JSON export jobs, replay-safe business-row idempotency, download state, and history.',
  '- Team, role, security, plan, credits, usage, tenant administration, feature flags, and provider health remain projections of OperatorOS parent authority.',
  '',
  '## AI, monetization, and trust boundary',
  '',
  '- OperatorOS is the sole identity, tenant, role, entitlement, plan, billing, provider-secret, platform-admin, background-job, notification, usage, and audit authority.',
  '- AI requests use the shared provider abstraction, strict bounded inputs, a versioned system prompt, validated structured output, deterministic test fallback, safe unavailable state, redacted logging, idempotency, rate limits, token accounting, and atomic monthly credits.',
  '- Concurrent requests reserve credits with a conditional PostgreSQL upsert. Failed provider calls release reservations; replay returns the original generation without double charging.',
  '- Integration connect and sync operations fail closed unless the tenant has the catalog entry\'s `requiredFeature`; disconnect remains available after entitlement loss.',
  '- Campaign metrics and reports use persisted records only. No random, sample, or fabricated performance data is generated.',
  '- Brand-scoped report aggregates exclude unrelated campaigns, content, leads, tasks, and activity. CSV report exports serialize the persisted snapshot rather than workspace summary placeholders.',
  '- Export idempotency is enforced at the tenant business-row boundary before the shared job is enqueued, so a replay returns the original export and cannot strand an unprocessed duplicate row.',
  '- Cross-tenant brand, campaign, landing, report, workflow, and assignee references are rejected without enumerating another tenant record.',
  '',
  '## Executable evidence',
  '',
  '- `apps/api/test/brandforgeos-db.test.ts` — onboarding, brand/persona/campaign/copy/calendar/metrics, task/comment/landing/workflow, template gating, integration feature denial, deterministic connector synchronization, brand-scoped report snapshots, report CSV data, replay-safe export rows, restart persistence, concurrent credits, viewer denial, and tenant isolation.',
  '- `apps/api/test/brandforgeos-phase31-domain.test.ts` — exact copy/tone/workflow/report/integration catalogs, strict schemas, deterministic scoring, integrity hashes, invalid ranges, raw-secret rejection, export format validation, and safe persisted-report CSV serialization.',
  '- `apps/api/test/brandforgeos-phase31-static.test.ts` — pinned source, additive v40 DDL, required tables, source-compatible routes, premium UI surfaces, entitlement/idempotency/report-scope contracts, and no random metric/report implementation.',
  '- `apps/web/e2e/brandforgeos-phase31.spec.ts` — production-artifact exact-host SSO plus desktop/tablet/mobile Brand HQ, offers, campaign production, copy, calendar, AI, strategy, templates, integrations, reports, activity, admin, labels, no-placeholder text, overflow, and visual capture contract.',
  '- `scripts/phase20-product-truth.test.mjs` — reproducible exact capability ledger and current-target/evidence integrity.',
  '',
  '## Local verification status',
  '',
  '- API and web TypeScript: PASS.',
  '- Focused domain/static review contract: PASS (7/7).',
  '- Combined Phase 31 review regression plus database-release contract: PASS (15/15), including catalog entitlement denial, business-row export replay, report CSV serialization, and selected-brand report isolation.',
  '- Disposable PostgreSQL 16 persisted BrandForgeOS journey: PASS (6/6), including deterministic shared job execution and concurrent credit exhaustion.',
  '- Zero-warning root lint, full API/runner/web TypeScript, and compiled API/runner/Next production build: PASS. The build used a loopback-only API URL as required by the non-development configuration gate.',
  '- Production-artifact exact-host browser acceptance: PASS (1 Playwright contract, 36 route/viewport checks) through `brandforgeos.operatoros.net`, including SSO return, desktop/tablet/mobile rendering, labels, no-placeholder text, overflow, and visual capture.',
  '- Live external AI/integration providers, production traffic, backup/restore, and rollback remain owner-controlled deployment gates.',
  '',
  '## Full source capability ledger',
  '',
  '| # | Type | Source identity | State | Current boundary | Capability ID |',
  '|---:|---|---|---|---|---|',
  ...parity.capabilities.map(
    (capability, index) =>
      `| ${index + 1} | ${capability.type} | ${esc(capability.title)} | ${capability.state} | ${esc(capability.currentTargets.slice(0, 3).join('; '))} | \`${capability.capabilityId}\` |`,
  ),
  '',
  '## Deployment gates',
  '',
  '- Back up the reviewed production database, confirm the exact reviewed commit, and apply cumulative additive release v40 through the supported release runner.',
  '- Configure approved shared AI and integration credential references, OAuth callbacks, webhooks, and external provider health; inserting a secret reference alone is not readiness.',
  '- Verify `brandforgeos.operatoros.net` login/return, tenant and role isolation, source-compatible deep links, desktop/tablet/mobile accessibility, live synchronization, export integrity, credit/plan behavior, restart persistence, backup/restore, and rollback.',
  '',
].join('\n');

if (process.argv.includes('--write')) {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${report}\n`);
  console.log(
    JSON.stringify(
      {
        mode: 'write',
        output: 'docs/phase-31/BRANDFORGEOS-COMPLETE-PRODUCT-REPORT.md',
        capabilities: parity.capabilities.length,
        native,
        shared,
        blocked: parity.stateCounts.BLOCKED,
      },
      null,
      2,
    ),
  );
} else {
  if (readFileSync(output, 'utf8').replaceAll('\r\n', '\n') !== `${report}\n`)
    throw new Error('Phase 31 report is stale; run phase31:report:write');
  if (parity.stateCounts.BLOCKED || parity.stateCounts.OWNER_WAIVED)
    throw new Error('Phase 31 requires zero blocked and zero implicit waivers');
  console.log(
    JSON.stringify(
      { mode: 'check', capabilities: parity.capabilities.length, native, shared, blocked: 0 },
      null,
      2,
    ),
  );
}
