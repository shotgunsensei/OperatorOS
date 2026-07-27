import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('Phase 11C routes enforce OperatorOS tenant and module authority', () => {
  const routes = read('apps/api/src/routes/studyforge-routes.ts');
  assert.match(routes, /const readGuards = \[requireTenantModuleAccess\('studyforge-ai'\)\]/);
  assert.match(routes, /const writeGuards = \[\.\.\.readGuards, requireTenantModuleWriteAccess\]/);
  assert.doesNotMatch(routes, /request\.body.*tenantId/);
  assert.match(routes, /WHERE tenant_id=\$\{tenantId\}/);
  assert.match(routes, /source_references/);
  assert.match(routes, /Idempotency-Key/);
  assert.match(routes, /recordUsageEvent/);
});

test('Phase 11C schema is additive, tenant-composite, indexed, and lifecycle constrained', () => {
  const ddl = read('apps/api/src/lib/studyforge-db-init.ts');
  for (const table of [
    'studyforge_subjects', 'studyforge_sources', 'studyforge_generations',
    'studyforge_decks', 'studyforge_cards', 'studyforge_quizzes',
    'studyforge_questions', 'studyforge_quiz_attempts', 'studyforge_plans',
    'studyforge_plan_sessions', 'studyforge_card_progress',
  ]) assert.match(ddl, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(ddl, /FOREIGN KEY \(tenant_id,source_id\)/);
  assert.match(ddl, /FOREIGN KEY \(tenant_id,deck_id\)/);
  assert.match(ddl, /uq_studyforge_generation_key/);
  assert.match(ddl, /studyforge_card_citation_check/);
  assert.match(ddl, /studyforge_question_citation_check/);
  assert.match(read('apps/api/src/lib/database-release-contract.ts'), /id: 'studyforge_tables'/);
  assert.match(read('apps/api/src/lib/database-release.ts'), /studyforge_card_progress/);
});

test('Phase 11C exposes a real workspace and canonical deep-link destinations', () => {
  const workspace = read('apps/web/src/components/module-shells/StudyForgeShell.tsx');
  const client = read('apps/web/src/lib/auth.ts');
  const routes = read('apps/web/src/app/modules/[slug]/[...path]/route-map.ts');
  const apiRoutes = read('apps/api/src/routes/studyforge-routes.ts');
  assert.match(workspace, /data-evidence="persisted_records_only"/);
  assert.match(apiRoutes, /questions\/:id/);
  assert.match(apiRoutes, /plan-sessions\/:id\/content/);
  assert.match(workspace, /Edit card/);
  assert.match(workspace, /Edit question/);
  assert.match(workspace, /Edit session/);
  assert.match(workspace, /moduleShellApi\.studyforge\.workspace/);
  assert.match(workspace, /review required/i);
  assert.match(workspace, /Source-grounded AI studio/);
  assert.doesNotMatch(workspace, /Math\.random/);
  assert.match(client, /\/modules\/studyforge-ai\/generations/);
  for (const section of ['dashboard', 'subjects', 'sources', 'studio', 'decks', 'quizzes', 'plans', 'analytics']) {
    assert.match(routes, new RegExp(`studyforge-${section}`));
  }
});

test('Phase 11C excludes child authority and documents parity, threats, and migration', () => {
  const parity = read('docs/modules/studyforge-ai/PARITY_MATRIX.md');
  const threat = read('docs/modules/studyforge-ai/THREAT_MODEL.md');
  const migration = read('docs/modules/studyforge-ai/MIGRATION_AND_CUTOVER.md');
  assert.match(parity, /OperatorOS SSO/);
  assert.match(parity, /Stripe.*Exclude/i);
  assert.match(threat, /fabricated/i);
  assert.match(threat, /cross-tenant/i);
  assert.match(migration, /dry-run/i);
  assert.match(migration, /No apply mode/i);
});
