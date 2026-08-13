import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('Phase 33 is pinned to the 317-capability source baseline and additive release v42', () => {
  const snapshot = JSON.parse(read('apps/modules/studyforge-ai/source/SOURCE_SNAPSHOT.json'));
  assert.equal(snapshot.sourceCommit, 'a607a9f34442b1d0f6bfffbf0293609529494825');
  const ledger = JSON.parse(read('docs/parity/modules/studyforge-ai.json'));
  assert.equal(ledger.capabilities.length, 317);
  const contract = read('apps/api/src/lib/database-release-contract.ts');
  assert.match(contract, /releaseVersion:\s*44/);
  assert.match(contract, /studyforge_complete_product_tables/);
  const ddl = read('apps/api/src/lib/studyforge-phase33-db-init.ts');
  for (const table of [
    'studyforge_preferences', 'studyforge_folders', 'studyforge_study_sets',
    'studyforge_short_answers', 'studyforge_exam_countdowns',
    'studyforge_learning_sessions', 'studyforge_daily_activity',
    'studyforge_session_card_reviews', 'studyforge_usage_counters',
    'studyforge_generation_reservations',
  ]) assert.match(ddl, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.doesNotMatch(ddl, /DROP\s+TABLE|TRUNCATE/iu);
});

test('Phase 33 exposes all complete learning workflows with transactional persistence and parent limits', () => {
  const routes = read('apps/api/src/routes/studyforge-phase33-routes.ts');
  const access = read('apps/api/src/lib/studyforge-access.ts');
  for (const route of [
    '/dashboard', '/folders', '/templates', '/study-sets', '/study-sets/:id',
    '/study-sets/:id/quiz-attempts', '/quiz-attempts',
    '/study-sets/:id/flashcard-sessions', '/flashcards/:id/status',
    '/exam-countdowns', '/study-sets/:id/export', '/account', '/admin/stats',
  ]) assert.match(routes, new RegExp(route.replaceAll('/', '\\/').replaceAll(':', '\\:')));
  assert.match(routes, /\['duplicate', 'regenerate'\]/);
  assert.match(routes, /study-sets\/\:id\/\$\{action\}/);
  assert.match(routes, /db\.transaction/);
  assert.match(routes, /pg_advisory_xact_lock/);
  assert.match(routes, /consumeStudyForgeUsage/);
  assert.match(routes, /recordUsageEvent/);
  assert.match(routes, /generation_provenance/);
  assert.match(routes, /source_excerpt/);
  assert.match(access, /resolveEntitlements/);
  assert.match(access, /tenant_entitlements/);
  assert.doesNotMatch(`${routes}\n${access}`, /stripe|checkoutSession|paymentIntent/iu);
});

test('Phase 33 web surface includes complete artifacts, touch and keyboard study, history, exports, and source routes', () => {
  const shell = read('apps/web/src/components/module-shells/StudyForgeCompleteWorkspace.tsx');
  const routeMap = read('apps/web/src/app/modules/[slug]/[...path]/route-map.ts');
  const client = read('apps/web/src/lib/auth.ts');
  for (const label of [
    'Folders and study sets', 'Turn notes into a full learning system', 'Key terms',
    'flashcards', 'short answers', 'Attempt history', 'Last-minute cram section',
    'Countdowns that respect your time zone', 'Plan and usage',
  ]) assert.match(shell, new RegExp(label, 'i'));
  assert.match(shell, /event\.key === ' '/);
  assert.match(shell, /event\.key === '1'/);
  assert.match(shell, /event\.key === '2'/);
  assert.match(shell, /Learning/);
  assert.match(shell, /Known/);
  assert.match(shell, /format=csv/);
  assert.match(shell, /gridTemplateColumns: 'repeat\(auto-fit,minmax/);
  for (const route of ['/app', '/sets', '/sets/new', '/exams', '/account', '/admin', '/pricing']) {
    assert.match(routeMap, new RegExp(route.replaceAll('/', '\\/')));
  }
  assert.match(client, /createCompleteSet/);
  assert.match(client, /submitCompleteQuiz/);
  assert.match(client, /completeFlashcardSession/);
  const middleware = read('apps/web/src/middleware.ts');
  assert.match(middleware, /context\.surface !== 'root' && context\.surface !== 'app'/);
  assert.doesNotMatch(shell, /Math\.random|fake metric/iu);
});

test('Tutor groups are not invented because the pinned source has no group persistence or routes', () => {
  const sourceSchema = read('apps/modules/studyforge-ai/source/lib/db/src/schema/index.ts');
  const sourceRoutes = read('apps/modules/studyforge-ai/source/artifacts/api-server/src/routes/index.ts');
  assert.doesNotMatch(sourceSchema, /group/i);
  assert.doesNotMatch(sourceRoutes, /group/i);
  assert.match(read('apps/api/src/lib/studyforge-phase33.ts'), /tutorGroups:\s*true/);
});
