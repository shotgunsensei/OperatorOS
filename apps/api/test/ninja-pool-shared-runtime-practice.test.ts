import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

test('Ninja Pool practice persistence remains a tenant/user-scoped bounded summary', () => {
  const schema = readRepoFile('apps/api/src/schema.ts');
  const start = schema.indexOf('export const ninjaPoolPracticeSessions');
  const end = schema.indexOf('export type NinjaPoolStoredPreferences', start);
  assert.ok(start >= 0 && end > start, 'Ninja Pool practice schema block should exist');
  const block = schema.slice(start, end);

  assert.match(block, /pgTable\('ninja_pool_practice_sessions'/);
  assert.match(block, /tenantId: varchar\('tenant_id',[\s\S]*references\(\(\) => tenants\.id\)/);
  assert.match(block, /userId: varchar\('user_id',[\s\S]*references\(\(\) => users\.id\)/);
  assert.match(block, /enum: \['active', 'completed', 'abandoned'\]/);
  assert.match(block, /index\('idx_ninja_pool_practice_tenant_user_started'\)\.on\(t\.tenantId, t\.userId, t\.startedAt\.desc\(\)\)/);
  assert.match(block, /index\('idx_ninja_pool_practice_tenant_status'\)\.on\(t\.tenantId, t\.status\)/);
  assert.match(block, /uniqueIndex\('idx_ninja_pool_practice_one_active'\)[\s\S]*\.where\(sql`\$\{t\.status\} = 'active'`\)/);
  assert.doesNotMatch(block, /jsonb|ballState|coordinates|roomId|opponent|leaderboard|score|subscription|priceId/i);
});

test('Ninja Pool startup DDL is idempotent and constrains every stored counter', () => {
  const init = readRepoFile('apps/api/src/lib/saas-db-init.ts');
  const start = init.indexOf('-- Ninja Pool Hall shared-runtime slice');
  const end = init.indexOf('-- TradeFlowKit shared-runtime slice', start);
  assert.ok(start >= 0 && end > start, 'Ninja Pool practice DDL block should exist');
  const block = init.slice(start, end);

  assert.match(block, /CREATE TABLE IF NOT EXISTS ninja_pool_practice_sessions/);
  assert.match(block, /tenant_id VARCHAR\(36\) NOT NULL REFERENCES tenants\(id\)/);
  assert.match(block, /user_id VARCHAR\(36\) NOT NULL REFERENCES users\(id\)/);
  assert.match(block, /CREATE INDEX IF NOT EXISTS idx_ninja_pool_practice_tenant_user_started\s+ON ninja_pool_practice_sessions\(tenant_id, user_id, started_at DESC\)/);
  assert.match(block, /CREATE INDEX IF NOT EXISTS idx_ninja_pool_practice_tenant_status\s+ON ninja_pool_practice_sessions\(tenant_id, status\)/);
  assert.match(block, /CREATE UNIQUE INDEX IF NOT EXISTS idx_ninja_pool_practice_one_active\s+ON ninja_pool_practice_sessions\(tenant_id, user_id\)\s+WHERE status = 'active'/);
  assert.match(block, /CHECK \(status IN \('active','completed','abandoned'\)\)/);
  assert.match(block, /CHECK \(shots BETWEEN 0 AND 1000\)/);
  assert.match(block, /CHECK \(object_balls_pocketed BETWEEN 0 AND 15\)/);
  assert.match(block, /CHECK \(scratches >= 0 AND scratches <= shots\)/);
  assert.match(block, /CHECK \(version >= 1\)/);
  assert.equal((block.match(/EXCEPTION WHEN duplicate_object THEN NULL/g) ?? []).length, 5);
});

test('Ninja Pool routes use OperatorOS tenant/module guards on the complete route surface', () => {
  const routes = readRepoFile('apps/api/src/routes/ninja-pool-hall-routes.ts');
  const parentRoutes = readRepoFile('apps/api/src/routes/module-shell-routes.ts');

  assert.match(parentRoutes, /import \{ registerNinjaPoolHallRoutes \} from '\.\/ninja-pool-hall-routes\.js'/);
  assert.match(parentRoutes, /await registerNinjaPoolHallRoutes\(app\)/);
  assert.match(routes, /const ninjaPoolReadGuards = \[requireTenantModuleAccess\('ninja-pool-hall'\)\]/);
  assert.match(routes, /const ninjaPoolWriteGuards = \[\.\.\.ninjaPoolReadGuards, requireTenantModuleWriteAccess\]/);

  const registered = [...routes.matchAll(/app\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)]
    .map((match) => `${match[1]} ${match[2]}`)
    .sort();
  assert.deepEqual(registered, [
    'get /v1/modules/ninja-pool-hall/matches',
    'get /v1/modules/ninja-pool-hall/matches/:id',
    'get /v1/modules/ninja-pool-hall/practice-sessions',
    'get /v1/modules/ninja-pool-hall/profile',
    'patch /v1/modules/ninja-pool-hall/practice-sessions/:id',
    'post /v1/modules/ninja-pool-hall/matches',
    'post /v1/modules/ninja-pool-hall/matches/:id/abandon',
    'post /v1/modules/ninja-pool-hall/matches/:id/choices',
    'post /v1/modules/ninja-pool-hall/matches/:id/shots',
    'post /v1/modules/ninja-pool-hall/practice-sessions',
    'post /v1/modules/ninja-pool-hall/practice-sessions/:id/abandon',
    'put /v1/modules/ninja-pool-hall/profile',
  ]);
  assert.equal((routes.match(/preHandler: \[\.\.\.ninjaPoolReadGuards\]/g) ?? []).length, 4);
  assert.equal((routes.match(/preHandler: \[\.\.\.ninjaPoolWriteGuards\]/g) ?? []).length, 8);
});

test('practice lookups and mutations enforce both tenant and user ownership', () => {
  const routes = readRepoFile('apps/api/src/routes/ninja-pool-hall-routes.ts');

  assert.match(routes, /async function loadScopedSession\(id: string, tenantId: string, userId: string\)[\s\S]*eq\(ninjaPoolPracticeSessions\.tenantId, tenantId\)[\s\S]*eq\(ninjaPoolPracticeSessions\.userId, userId\)/);
  assert.ok((routes.match(/loadScopedSession\(id, ctx\.tenantId, user\.id\)/g) ?? []).length >= 4);
  assert.match(routes, /tenantId: ctx\.tenantId/);
  assert.match(routes, /userId: user\.id/);
  assert.match(routes, /code: 'NINJA_POOL_PRACTICE_NOT_FOUND'/);

  const viewStart = routes.indexOf('function sessionView');
  const viewEnd = routes.indexOf('function handleNinjaPoolError', viewStart);
  assert.ok(viewStart >= 0 && viewEnd > viewStart);
  const publicView = routes.slice(viewStart, viewEnd);
  assert.doesNotMatch(publicView, /tenantId|userId/);
});

test('practice lifecycle and concurrency state remain server-owned', () => {
  const routes = readRepoFile('apps/api/src/routes/ninja-pool-hall-routes.ts');
  const domain = readRepoFile('apps/api/src/lib/ninja-pool-practice.ts');

  assert.match(routes, /status: 'active'/);
  assert.match(routes, /shots: 0/);
  assert.match(routes, /objectBallsPocketed: 0/);
  assert.match(routes, /scratches: 0/);
  assert.match(routes, /version: 1/);
  assert.ok((routes.match(/eq\(ninjaPoolPracticeSessions\.version, (?:progress|input)\.expectedVersion\)/g) ?? []).length >= 2);
  assert.ok((routes.match(/eq\(ninjaPoolPracticeSessions\.status, 'active'\)/g) ?? []).length >= 2);
  assert.ok((routes.match(/version: sql`\$\{ninjaPoolPracticeSessions\.version\} \+ 1`/g) ?? []).length >= 2);
  assert.match(routes, /nextStatus === 'completed' \? now : null/);
  assert.match(routes, /row\.status === 'completed'/);
  assert.match(routes, /entityType: 'ninja_pool_practice_session'/);
  assert.match(routes, /mode: 'local_practice'/);
  assert.match(routes, /evidence: 'client_reported'/);
  assert.match(routes, /NINJA_POOL_STARTS_PER_HOUR/);
  assert.match(routes, /NINJA_POOL_RETAINED_SESSIONS/);
  assert.match(routes, /pg_advisory_xact_lock/);
  assert.match(routes, /progressWasAlreadyApplied/);
  assert.match(routes, /session: sessionView\(currentSession\)/);
  assert.match(domain, /exactly one new local shot with monotonic counters/);
  assert.doesNotMatch(routes, /app\.delete\(/);
  assert.doesNotMatch(routes, /new WebSocket|\/ws\/pool|leaderboard|matchmaking|stripe|checkout/i);
});

test('native shell uses the typed API and keeps unsafe snapshot runtimes quarantined', () => {
  const page = readRepoFile('apps/web/src/app/apps/[slug]/page.tsx');
  const shell = readRepoFile('apps/web/src/components/module-shells/NinjaPoolHallShell.tsx');
  const practice = readRepoFile('apps/web/src/components/module-shells/NinjaPoolHallPractice.tsx');
  const recovery = readRepoFile('apps/web/src/lib/ninja-pool-hall/practice-recovery.ts');
  const client = readRepoFile('apps/web/src/lib/auth.ts');

  assert.match(page, /'ninja-pool-hall':\s+NinjaPoolHallRouteShell/);
  assert.match(shell, /data-testid="ninja-pool-hall-shell"/);
  assert.match(shell, /NinjaPoolHallPractice/);
  assert.match(practice, /moduleShellApi\.ninjaPoolHall\.listPracticeSessions/);
  assert.match(practice, /moduleShellApi\.ninjaPoolHall\.startPracticeSession/);
  assert.match(practice, /moduleShellApi\.ninjaPoolHall\.savePracticeShot/);
  assert.match(practice, /moduleShellApi\.ninjaPoolHall\.abandonPracticeSession/);
  assert.match(practice, /makeInitialBalls/);
  assert.match(practice, /predictAim/);
  assert.match(practice, /simulateShot/);
  assert.match(practice, /data-testid="ninja-pool-table"/);
  assert.match(practice, /onPointerDown/);
  assert.match(practice, /type="range"/);
  assert.match(practice, /data-testid="ninja-pool-history-loading"/);
  assert.match(practice, /data-testid="ninja-pool-history-empty"/);
  assert.match(practice, /data-testid="ninja-pool-practice-error"/);
  assert.match(practice, /reconcilePracticeProgress/);
  assert.match(practice, /findActivePracticeSummary/);
  assert.match(practice, /data-testid="ninja-pool-end-recovered-rack"/);
  assert.match(practice, /Exact ball positions stay local/);
  assert.match(practice, /discardUncertainLocalRack/);
  assert.match(practice, /not treated as authoritative physics/);
  assert.match(practice, /@media \(max-width:680px\)/);
  assert.match(practice, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(recovery, /current\.version === pending\.expectedVersion \+ 1/);
  assert.match(recovery, /kind: 'server-state'/);
  assert.match(client, /NinjaPoolPracticeProgressInput/);
  assert.match(client, /\/modules\/ninja-pool-hall\/practice-sessions/);

  assert.doesNotMatch(practice, /apps\/modules|source\/artifacts|new WebSocket|\/ws\/pool|from ['"]wouter['"]|serviceWorker\.register/);
});

test('promoted physics and types remain exact copies of the pinned source snapshot', () => {
  for (const file of ['physics.ts', 'types.ts']) {
    const promoted = readFileSync(resolve(repoRoot, 'apps/web/src/lib/ninja-pool-hall', file));
    const snapshot = readFileSync(resolve(
      repoRoot,
      'apps/modules/ninja-pool-hall/source/artifacts/pool/src/lib',
      file,
    ));
    assert.deepEqual(promoted, snapshot, `${file} drifted from the pinned source snapshot`);
  }

  const provenance = readRepoFile('apps/web/src/lib/ninja-pool-hall/README.md');
  assert.match(provenance, /62439c4018ec551ce2891800351200c8ab2cb9e7/);
  assert.match(provenance, /Do not import runtime code from the source\s+snapshot/);
});
