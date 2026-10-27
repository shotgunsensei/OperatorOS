import assert from 'node:assert/strict';
import test from 'node:test';
import { guards, loadSource, matchingRows, queryOf, type Row } from './creative-route-quality-fixture.js';

// Execute the registered job and real catalog importer with synthetic persisted
// identity/access records. No bootstrap, signed session, listener or GitHub call.
function fixture(options: { scheduled?: boolean; oneEntry?: boolean } = {}) {
  const actor: Row = { id: 'actor-a', status: 'active', deleted_at: null };
  const workspace: Row = { id: 'tenant-a', status: 'active' };
  const membership: Row = { tenant_id: 'tenant-a', user_id: 'actor-a', role: 'admin' };
  const module: Row = { id: 'script-module', slug: 'ninjamation' };
  const access: Row = { hasAccess: true, moduleId: module.id, accessLevel: 'manager', viaPlatformRole: false };
  const run: Row = { id: 'run-a', tenant_id: workspace.id, requested_by_user_id: actor.id, shared_job_id: 'job-a', requested_commit: 'a'.repeat(40), status: 'queued', discovered_count: 0 };
  const context: Row = { id: 'job-a', tenantId: workspace.id, moduleId: module.id, requestedByUserId: actor.id, payload: options.scheduled ? { sharedScheduleId: 'schedule-a' } : { runId: run.id }, correlationId: null };
  const statements: string[] = [];
  let fetches = 0, writes = 0, activity = 0;
  let afterFetch = () => undefined;
  const database: Row = { async transaction(task: (tx: Row) => unknown) { return task(database); }, async execute(query: any) {
    const actual = queryOf(query); statements.push(actual.sql);
    // Row locks require PostgreSQL; only strip the lock suffix for this bounded
    // predicate evaluator, retaining every actual WHERE clause/parameter.
    const compiled = { ...actual, sql: actual.sql.replace(/\s+FOR SHARE\b[\s\S]*$/i, '') };
    if (/^\s*SELECT.*\bFROM users\b/s.test(compiled.sql)) return { rows: matchingRows(compiled, [actor]) };
    if (/^\s*SELECT.*\bFROM tenants\b/s.test(compiled.sql)) return { rows: matchingRows(compiled, [workspace]) };
    if (/^\s*SELECT.*\bFROM modules\b/s.test(compiled.sql)) return { rows: matchingRows(compiled, [module]) };
    if (/^\s*SELECT.*\bFROM tenant_users\b/s.test(compiled.sql)) return { rows: membership.role == null ? [] : matchingRows(compiled, [membership]) };
    if (/SELECT.*FROM ninjamation_sync_runs/s.test(compiled.sql)) return { rows: matchingRows(compiled, [run]) };
    if (/SELECT.*FROM ninjamation_scripts/s.test(compiled.sql)) return { rows: [] };
    if (/INSERT INTO ninjamation_sync_runs/.test(compiled.sql)) { writes++; return { rows: [run] }; }
    if (/INSERT INTO ninjamation_(?:scripts|script_versions|sync_items)\b/.test(compiled.sql)) { writes++; return { rows: [{ id: 'imported-script' }] }; }
    if (/UPDATE ninjamation_sync_runs/.test(compiled.sql)) {
      writes++;
      if (/SET status='running'/.test(compiled.sql)) { run.status = 'running'; return { rows: [run] }; }
      if (/SET status='completed'/.test(compiled.sql)) { run.status = 'completed'; return { rows: [run] }; }
      if (/SET status='failed'/.test(compiled.sql)) { run.status = 'failed'; return { rows: [run] }; }
    }
    throw new Error(`Unmodeled sync SQL: ${compiled.sql}`);
  } };
  const sync = loadSource('lib/ninjamation-sync.ts', {
    '../db.js': { db: database },
    './shared-usage-activity.js': { async appendActivityEvent() { activity++; } },
    './tenant-entitlements.js': { async resolveTenantModuleAccess(userId: string, tenantId: string, slug: string) {
      assert.equal(userId, actor.id); assert.equal(tenantId, workspace.id); assert.equal(slug, module.slug); return access;
    } },
    './role-aliases.js': loadSource('lib/role-aliases.ts'),
  });
  let handler: (value: Row) => Promise<void>;
  const phase36 = loadSource('lib/ninjamation-phase36.ts');
  loadSource('routes/ninjamation-phase36-routes.ts', {
    '@operatoros/sdk': {}, '../db.js': { db: database }, '../lib/tenant-auth.js': guards,
    '../lib/ninjamation-sync.js': sync, '../lib/ninjamation-access.js': {},
    '../lib/ninjamation-phase36.js': { ...phase36, async fetchAutomationPacksSnapshot() {
      fetches++; afterFetch(); return { repository: phase36.NINJAMATION_REPOSITORY, branch: phase36.NINJAMATION_REPOSITORY_BRANCH, commit: 'a'.repeat(40), entries: options.oneEntry ? [{ path: 'Windows/Inventory.ps1', content: 'Get-ComputerInfo', sha: 'b'.repeat(40), type: 'blob' }] : [] };
    } },
    '../lib/shared-provider-adapters.js': {}, '../lib/shared-usage-activity.js': {},
    '../lib/shared-background-jobs.js': { registerSharedJobHandler(key: string, callback: typeof handler) { assert.equal(key, 'ninjamation.phase36.github-sync.v1'); handler = callback; } },
    '../lib/shared-schedules-exports.js': {}, '../lib/audit.js': {},
  });
  return { actor, workspace, membership, module, access, run, context, statements,
    afterFetch(task: () => void) { afterFetch = task; },
    execute: () => handler(context), effects: () => ({ fetches, writes, activity }),
  };
}

for (const scheduled of [false, true]) test(`Script Ops ${scheduled ? 'scheduled' : 'queued'} revoked admin makes zero external fetches and writes`, async () => {
  const f = fixture({ scheduled }); f.membership.role = 'member';
  await assert.rejects(f.execute(), { code: 'NINJAMATION_SYNC_AUTHORITY_REVOKED' });
  assert.deepEqual(f.effects(), { fetches: 0, writes: 0, activity: 0 });
});

for (const state of ['inactive actor', 'deleted actor', 'missing membership', 'suspended tenant', 'archived tenant', 'revoked module', 'viewer module', 'wrong module']) test(`Script Ops rejects ${state} before fetch or writes`, async () => {
  const f = fixture();
  if (state === 'inactive actor') f.actor.status = 'suspended';
  if (state === 'deleted actor') f.actor.deleted_at = '2026-10-27';
  if (state === 'missing membership') f.membership.role = null;
  if (state === 'suspended tenant') f.workspace.status = 'suspended';
  if (state === 'archived tenant') f.workspace.status = 'archived';
  if (state === 'revoked module') f.access.hasAccess = false;
  if (state === 'viewer module') f.access.accessLevel = 'viewer';
  if (state === 'wrong module') f.context.moduleId = 'foreign-module';
  await assert.rejects(f.execute(), { code: 'NINJAMATION_SYNC_AUTHORITY_REVOKED' });
  assert.deepEqual(f.effects(), { fetches: 0, writes: 0, activity: 0 });
});

for (const field of ['requested_by_user_id', 'shared_job_id', 'tenant_id']) test(`Script Ops rejects a persisted run with mismatched ${field}`, async () => {
  const f = fixture(); f.run[field] = 'foreign-identity';
  await assert.rejects(f.execute()); assert.deepEqual(f.effects(), { fetches: 0, writes: 0, activity: 0 });
});

test('Script Ops rechecks authority after awaiting GitHub and before catalog transaction writes', async () => {
  const f = fixture({ oneEntry: true }); f.afterFetch(() => { f.membership.role = 'member'; });
  await assert.rejects(f.execute(), { code: 'NINJAMATION_SYNC_AUTHORITY_REVOKED' });
  assert.deepEqual(f.effects(), { fetches: 1, writes: 0, activity: 0 });
});

test('Script Ops retains authorized catalog creation with real normalized source and immutable version writes', async () => {
  const f = fixture({ oneEntry: true }); await f.execute();
  assert.deepEqual(f.effects(), { fetches: 1, writes: 5, activity: 1 });
  assert.ok(f.statements.some(statement => /INSERT INTO ninjamation_script_versions/.test(statement)));
});

for (const role of ['owner', 'admin', 'tenant_admin', 'billing_admin']) test(`Script Ops retains current ${role} sync authority`, async () => {
  const f = fixture(); f.membership.role = role; await f.execute();
  assert.deepEqual(f.effects(), { fetches: 1, writes: 2, activity: 1 }); assert.equal(f.run.status, 'completed');
});

test('Script Ops scheduled sync retains its creator identity and current authority', async () => {
  const f = fixture({ scheduled: true }); await f.execute();
  assert.deepEqual(f.effects(), { fetches: 1, writes: 3, activity: 1 });
});

test('Script Ops preserves central platform authority but never bypasses a module kill switch', async () => {
  const f = fixture(); f.access.viaPlatformRole = true; f.membership.role = null; f.workspace.status = 'suspended'; await f.execute();
  assert.equal(f.run.status, 'completed');
  const denied = fixture(); denied.access.viaPlatformRole = true; denied.access.hasAccess = false;
  await assert.rejects(denied.execute(), { code: 'NINJAMATION_SYNC_AUTHORITY_REVOKED' });
  assert.deepEqual(denied.effects(), { fetches: 0, writes: 0, activity: 0 });
});

test('Script Ops keeps actorless jobs denied before fetch or writes', async () => {
  const f = fixture({ scheduled: true }); f.context.requestedByUserId = null;
  await assert.rejects(f.execute(), { code: 'NINJAMATION_SYNC_ACTOR_REQUIRED' });
  assert.deepEqual(f.effects(), { fetches: 0, writes: 0, activity: 0 });
});
