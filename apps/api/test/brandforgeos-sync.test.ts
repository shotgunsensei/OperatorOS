import test from 'node:test';
import assert from 'node:assert/strict';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { enqueueSharedJob, type SharedJobContext } from '../src/lib/shared-background-jobs.js';
import {
  BRANDFORGE_SYNC_HANDLER, enqueueBrandForgeSync, executeBrandForgeSync,
  type BrandForgeSyncServices,
} from '../src/lib/brandforgeos-sync.js';

type Row = Record<string, any>;
const input = { tenantId: 'fixture-tenant', moduleId: 'fixture-module', actorId: 'fixture-admin', provider: 'webhooks', idempotencyKey: 'fixture-sync-key' };
const dialect = new PgDialect();

// An explicit transactional SQL boundary, not a PostgreSQL integration test.
// Actual helper + actual shared enqueue source execute against this serializable
// fake; rollback and queue uniqueness are modeled, never inferred as DB acceptance.
export function syncFixture() {
  const links = new Map<string, Row>();
  const runs = new Map<string, Row>();
  const jobs = new Map<string, Row>();
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  let serial = Promise.resolve();
  const executionFences = new Set<string>();
  const state = {
    actorStatus: 'active', actorDeleted: false, tenantStatus: 'active', membership: 'owner' as string | null,
    access: true, accessLevel: 'manager', moduleId: input.moduleId, feature: true,
    configPresent: true, failRunInsert: false, failCompletion: false,
    accessChecks: 0, featureChecks: 0, executions: 0, lastSyncWrites: 0,
  };
  function link(provider = 'webhooks', tenantId = input.tenantId) {
    const key = `${tenantId}:${provider}`;
    if (!links.has(key)) links.set(key, {
      id: `link-${key}`, tenant_id: tenantId, provider_key: provider, status: 'degraded', version: 1,
      disconnected_at: null, configuration_id: `config-${key}`, configuration_version: 1,
      configuration_mode: 'test', configuration_provider: `brandforgeos.${provider}`,
      configuration_kind: provider === 'webhooks' ? 'webhook' : 'oauth',
    });
    return links.get(key)!;
  }
  const execute = async (query: SQL) => {
    const compiled = dialect.sqlToQuery(query);
    const text = compiled.sql.replace(/\s+/g, ' ').trim();
    const values = compiled.params;
    queries.push({ sql: text, params: values });
    if (text.startsWith('SELECT link.*,config.id')) {
      if (!state.configPresent || values[0] !== input.moduleId || values[1] !== `module:${input.moduleId}`) return { rows: [] };
      return { rows: [{ ...link(String(values[3]), String(values[2])) }] };
    }
    if (text.startsWith('INSERT INTO shared_jobs')) {
      const key = JSON.stringify([values[0], values[1], values[3], values[5]]);
      if (jobs.has(key)) return { rows: [] };
      const row = { id: `job-${jobs.size + 1}`, tenant_id: values[0], module_id: values[1], requested_by_user_id: values[2], handler_key: values[3], payload_json: values[4], idempotency_key: values[5] };
      jobs.set(key, row); return { rows: [row] };
    }
    if (text.startsWith('SELECT * FROM shared_jobs')) return { rows: [jobs.get(JSON.stringify(values))].filter(Boolean) };
    if (text.startsWith('INSERT INTO brandforge_sync_runs')) {
      if (state.failRunInsert) throw new Error('synthetic insert failure');
      const row = { id: values[0], tenant_id: values[1], integration_id: values[2], shared_job_id: values[3], requested_by_user_id: values[4], status: 'queued', direction: 'inbound' };
      runs.set(String(row.id), row); return { rows: [row] };
    }
    if (text.startsWith('SELECT * FROM brandforge_sync_runs')) {
      const row = runs.get(String(values[1]));
      return { rows: row && row.tenant_id === values[0] && row.integration_id === values[2] && row.shared_job_id === values[3] && row.requested_by_user_id === values[4] && row.direction === 'inbound' ? [{ ...row }] : [] };
    }
    if (text.startsWith('SELECT run.*,link.provider_key')) {
      const row = runs.get(String(values[3]));
      if (!row || row.tenant_id !== values[2] || values[0] !== state.moduleId || values[1] !== `module:${state.moduleId}` || !state.membership || !state.configPresent) return { rows: [] };
      const connection = [...links.values()].find(item => item.id === row.integration_id && item.tenant_id === row.tenant_id)!;
      return { rows: [{ ...row, ...Object.fromEntries(Object.entries(connection).filter(([key]) => !['id', 'status', 'version'].includes(key))), integration_status: connection.status, integration_version: connection.version, actor_status: state.actorStatus, actor_deleted_at: state.actorDeleted ? new Date() : null, tenant_status: state.tenantStatus, tenant_role: state.membership }] };
    }
    if (text.startsWith("UPDATE brandforge_sync_runs SET status='processing'")) {
      const row = runs.get(String(values[1]));
      if (row && row.tenant_id === values[0] && row.shared_job_id === values[2]) row.status = 'processing';
      return { rows: [] };
    }
    if (text.startsWith("UPDATE brandforge_sync_runs SET status='completed'")) {
      if (state.failCompletion) throw new Error('synthetic completion failure');
      const row = runs.get(String(values[2]));
      if (row && row.tenant_id === values[1] && row.shared_job_id === values[3]) Object.assign(row, { status: 'completed', result: values[0] });
      return { rows: [] };
    }
    if (text.startsWith('UPDATE brandforge_integrations SET last_sync_at')) {
      const connection = [...links.values()].find(item => item.tenant_id === values[1] && item.id === values[2]);
      if (connection) { connection.last_sync_at = 'synthetic'; state.lastSyncWrites++; }
      return { rows: [] };
    }
    if (text.startsWith("UPDATE brandforge_sync_runs SET status='dead_letter'")) {
      const row = runs.get(String(values[2]));
      const job = [...jobs.values()].find(item => item.id === values[5] && item.tenant_id === values[6] && item.module_id === values[7] && item.requested_by_user_id === values[8] && item.handler_key === values[9]);
      if (job && row && row.tenant_id === values[1] && row.shared_job_id === values[3] && row.requested_by_user_id === values[4] && ['queued', 'processing', 'retry'].includes(row.status)) Object.assign(row, { status: 'dead_letter', error_code: values[0] });
      return { rows: [] };
    }
    throw new Error('Unmodeled synthetic SQL: ' + text);
  };
  const database = {
    execute,
    async transaction<T>(callback: (tx: { execute: typeof execute }) => Promise<T>): Promise<T> {
      let release: (() => void) | undefined;
      let fence: string | undefined;
      let before: { runs: typeof runs; jobs: typeof jobs; links: typeof links; lastSync: number } | undefined;
      // Row transactions remain serialized in this SQL model. Advisory-only
      // transactions hold a separate lock, allowing concurrent authority edits.
      const transactionExecute = async (query: SQL) => {
        const compiled = dialect.sqlToQuery(query);
        if (compiled.sql.includes('pg_try_advisory_xact_lock')) {
          const key = String(compiled.params[0]);
          if (executionFences.has(key)) return { rows: [{ acquired: false }] };
          executionFences.add(key); fence = key;
          return { rows: [{ acquired: true }] };
        }
        if (!before) {
          const previous = serial;
          serial = new Promise<void>(resolve => { release = resolve; });
          await previous;
          before = { runs: structuredClone(runs), jobs: structuredClone(jobs), links: structuredClone(links), lastSync: state.lastSyncWrites };
        }
        return execute(query);
      };
      try { return await callback({ execute: transactionExecute }); }
      catch (error) {
        if (before) {
          for (const [target, source] of [[runs, before.runs], [jobs, before.jobs], [links, before.links]]) {
            target.clear(); for (const [key, row] of source) target.set(key, row);
          }
          state.lastSyncWrites = before.lastSync;
        }
        throw error;
      } finally { release?.(); if (fence) executionFences.delete(fence); }
    },
  };
  const services = {
    database,
    enqueue: enqueueSharedJob,
    resolveAccess: async (actorId: string, tenantId: string, module: string) => {
      state.accessChecks++;
      assert.equal(actorId, input.actorId); assert.equal(tenantId, input.tenantId); assert.equal(module, 'brandforgeos');
      return { hasAccess: state.access, accessLevel: state.accessLevel, moduleId: state.moduleId };
    },
    hasFeature: async (actorId: string, tenantId: string, feature: string) => {
      state.featureChecks++;
      assert.equal(actorId, input.actorId); assert.equal(tenantId, input.tenantId);
      assert.equal(feature, 'integrations.growth'); return state.feature;
    },
    execute: async () => { state.executions++; return { externalDelivery: false, resultState: 'recorded_not_delivered' }; },
    env: { NODE_ENV: 'test', APP_ENV: 'test' },
  } as unknown as BrandForgeSyncServices;
  const enqueue = (overrides: Partial<typeof input> = {}) => enqueueBrandForgeSync({ ...input, ...overrides }, services);
  const context = (job: Row): SharedJobContext => ({ id: job.id, tenantId: job.tenant_id, moduleId: job.module_id, requestedByUserId: job.requested_by_user_id, payload: job.payload_json, correlationId: null });
  return { services, state, link, runs, jobs, queries, enqueue, context };
}

const conflict = (error: unknown) => (error as { code: string }).code === 'BRANDFORGE_SYNC_IDEMPOTENCY_CONFLICT';

test('same-key replay returns the original business run and matching job without an extra row', async () => {
  const f = syncFixture(); const first = await f.enqueue(); const replay = await f.enqueue();
  assert.equal(first.duplicate, false); assert.equal(replay.duplicate, true);
  assert.equal(first.job.handler_key, BRANDFORGE_SYNC_HANDLER);
  assert.equal(f.runs.size, 1); assert.equal(f.jobs.size, 1);
  assert.equal(replay.syncRun.id, first.syncRun.id); assert.equal(replay.job.payload_json.syncId, replay.syncRun.id);
  assert.equal(replay.syncRun.shared_job_id, replay.job.id);
});

test('a same key cannot cross providers, requesters or changed connection/config versions', async () => {
  for (const change of ['provider', 'actor', 'integrationVersion', 'configVersion', 'configId']) {
    const f = syncFixture(); await f.enqueue();
    const override: Partial<typeof input> = {};
    if (change === 'provider') override.provider = 'meta_ads';
    if (change === 'actor') override.actorId = 'other-actor';
    if (change === 'integrationVersion') f.link().version++;
    if (change === 'configVersion') f.link().configuration_version++;
    if (change === 'configId') f.link().configuration_id = 'new-config';
    await assert.rejects(f.enqueue(override), conflict, change);
    assert.equal(f.runs.size, 1); assert.equal(f.jobs.size, 1);
  }
});

test('concurrent same-key requests commit one job/run and return one original identity', async () => {
  const f = syncFixture(); const results = await Promise.all([f.enqueue(), f.enqueue(), f.enqueue()]);
  assert.equal(f.runs.size, 1); assert.equal(f.jobs.size, 1);
  assert.equal(new Set(results.map(row => row.syncRun.id)).size, 1);
  assert.equal(results.filter(row => row.duplicate).length, 2);
});

test('concurrent cross-provider collision rejects the loser without an orphan business run', async () => {
  const f = syncFixture(); const results = await Promise.allSettled([f.enqueue(), f.enqueue({ provider: 'meta_ads' })]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  const rejected = results.find(row => row.status === 'rejected') as PromiseRejectedResult;
  assert(conflict(rejected.reason)); assert.equal(f.runs.size, 1); assert.equal(f.jobs.size, 1);
});

test('business insertion failure rolls back the reserved job and permits a clean retry', async () => {
  const f = syncFixture(); f.state.failRunInsert = true;
  await assert.rejects(f.enqueue(), /synthetic insert failure/);
  assert.equal(f.runs.size, 0); assert.equal(f.jobs.size, 0);
  f.state.failRunInsert = false; const retried = await f.enqueue();
  assert.equal(retried.duplicate, false); assert.equal(f.runs.size, 1); assert.equal(f.jobs.size, 1);
});

test('enqueue failure cannot leave an orphan business run', async () => {
  const f = syncFixture(); f.services.enqueue = async () => { throw new Error('synthetic queue failure'); };
  await assert.rejects(f.enqueue(), /synthetic queue failure/);
  assert.equal(f.runs.size, 0); assert.equal(f.jobs.size, 0);
});

test('a malformed newly reserved job cannot bind a different sync ID', async () => {
  const f = syncFixture();
  f.services.enqueue = async (request, executor) => {
    const result = await enqueueSharedJob(request, executor);
    (result.job as Row).payload_json.syncId = 'different-sync-id';
    return result;
  };
  await assert.rejects(f.enqueue(), conflict);
  assert.equal(f.runs.size, 0); assert.equal(f.jobs.size, 0);
});

test('keys are tenant-scoped and omitted keys create distinct deliberate operations', async () => {
  const f = syncFixture(); await f.enqueue(); await f.enqueue({ tenantId: 'other-tenant' });
  await f.enqueue({ idempotencyKey: undefined }); await f.enqueue({ idempotencyKey: undefined });
  assert.equal(f.runs.size, 4); assert.equal(f.jobs.size, 4);
});

test('legacy or corrupt job payload cannot silently replay a mismatched business run', async () => {
  for (const change of ['legacy', 'syncId', 'jobActor', 'runActor', 'runLink', 'runJob', 'direction']) {
    const f = syncFixture(); const first = await f.enqueue(); const row = f.runs.get(String(first.syncRun.id))!;
    if (change === 'legacy') delete first.job.payload_json.intent;
    if (change === 'syncId') first.job.payload_json.syncId = 'foreign-run';
    if (change === 'jobActor') first.job.requested_by_user_id = 'foreign';
    if (change === 'runActor') row.requested_by_user_id = 'foreign';
    if (change === 'runLink') row.integration_id = 'foreign';
    if (change === 'runJob') row.shared_job_id = 'foreign';
    if (change === 'direction') row.direction = 'outbound';
    await assert.rejects(f.enqueue(), conflict, change); assert.equal(f.runs.size, 1);
  }
});

test('worker rechecks current authority twice and completed replay never executes the adapter again', async () => {
  const f = syncFixture(); const queued = await f.enqueue(); const context = f.context(queued.job);
  await executeBrandForgeSync(context, f.services);
  assert.equal(f.state.accessChecks, 2); assert.equal(f.state.featureChecks, 2);
  assert.equal(f.state.executions, 1); assert.equal(f.state.lastSyncWrites, 1);
  assert.equal(f.runs.get(String(queued.syncRun.id))!.status, 'completed');
  await executeBrandForgeSync(context, f.services); assert.equal(f.state.executions, 1);
});

const revocations: Array<[string, (f: ReturnType<typeof syncFixture>) => void]> = [
  ['connection revoked', f => { f.link().status = 'revoked'; }],
  ['connection disconnected', f => { f.link().disconnected_at = 'synthetic'; }],
  ['connection rebound', f => { f.link().version++; }],
  ['config disabled', f => { f.link().configuration_mode = 'disabled'; }],
  ['config changed', f => { f.link().configuration_version++; }],
  ['config missing or foreign', f => { f.state.configPresent = false; }],
  ['config provider changed', f => { f.link().configuration_provider = 'brandforgeos.meta_ads'; }],
  ['config kind changed', f => { f.link().configuration_kind = 'oauth'; }],
  ['actor suspended', f => { f.state.actorStatus = 'suspended'; }],
  ['actor deleted', f => { f.state.actorDeleted = true; }],
  ['tenant suspended', f => { f.state.tenantStatus = 'suspended'; }],
  ['tenant archived', f => { f.state.tenantStatus = 'archived'; }],
  ['membership removed including global administrators', f => { f.state.membership = null; }],
  ['tenant member role', f => { f.state.membership = 'member'; }],
  ['tenant viewer role', f => { f.state.membership = 'viewer'; }],
  ['module global/tenant/member/explicit denial', f => { f.state.access = false; }],
  ['module viewer', f => { f.state.accessLevel = 'viewer'; }],
  ['module none', f => { f.state.accessLevel = 'none'; }],
  ['wrong module', f => { f.state.moduleId = 'foreign-module'; }],
  ['integration feature revoked', f => { f.state.feature = false; }],
];

test('each current authority or connection revocation stops queued work before the adapter', async () => {
  for (const [name, change] of revocations) {
    const f = syncFixture(); const queued = await f.enqueue(); change(f);
    await assert.rejects(executeBrandForgeSync(f.context(queued.job), f.services), error => error instanceof Error, name);
    assert.equal(f.state.executions, 0, name); assert.equal(f.state.lastSyncWrites, 0, name);
    assert.equal(f.runs.get(String(queued.syncRun.id))!.status, 'dead_letter', name);
  }
});

test('each revocation during awaited provider work prevents completion and connection health success', async () => {
  for (const [name, change] of revocations) {
    const f = syncFixture(); const queued = await f.enqueue();
    f.services.execute = async () => { f.state.executions++; await Promise.resolve(); change(f); return { externalDelivery: false }; };
    await assert.rejects(executeBrandForgeSync(f.context(queued.job), f.services), error => error instanceof Error, name);
    assert.equal(f.state.executions, 1, name); assert.equal(f.state.lastSyncWrites, 0, name);
    assert.equal(f.runs.get(String(queued.syncRun.id))!.status, 'dead_letter', name);
  }
});

test('public tenant-admin role aliases retain authority without widening ordinary member access', async () => {
  for (const role of ['admin', 'tenant_admin', 'billing_admin']) {
    const f = syncFixture(); const queued = await f.enqueue(); f.state.membership = role;
    await executeBrandForgeSync(f.context(queued.job), f.services); assert.equal(f.state.executions, 1, role);
  }
});

test('production policy still blocks a previously queued test run before execution', async () => {
  const f = syncFixture(); const queued = await f.enqueue(); f.services.env = { NODE_ENV: 'production', APP_ENV: 'production' };
  await assert.rejects(executeBrandForgeSync(f.context(queued.job), f.services), { code: 'PROVIDER_ADAPTER_UNAVAILABLE' });
  assert.equal(f.state.executions, 0); assert.equal(f.state.lastSyncWrites, 0);
});

test('tenant, module, actor and job payload mismatches cannot execute or mutate the original run', async () => {
  for (const field of ['tenantId', 'moduleId', 'requestedByUserId', 'id', 'payload']) {
    const f = syncFixture(); const queued = await f.enqueue(); const context = f.context(queued.job);
    Object.assign(context, { [field]: field === 'payload' ? { syncId: queued.syncRun.id } : 'foreign' });
    await assert.rejects(executeBrandForgeSync(context, f.services)); assert.equal(f.state.executions, 0);
    assert.equal(f.state.lastSyncWrites, 0);
    if (field !== 'payload') assert.equal(f.runs.get(String(queued.syncRun.id))!.status, 'queued', field);
  }
});

test('cancelled work cannot be restarted by a queued shared job', async () => {
  const f = syncFixture(); const queued = await f.enqueue(); f.runs.get(String(queued.syncRun.id))!.status = 'cancelled';
  await assert.rejects(executeBrandForgeSync(f.context(queued.job), f.services), { code: 'BRANDFORGE_SYNC_STATE_CHANGED' });
  assert.equal(f.state.executions, 0);
  assert.equal(f.runs.get(String(queued.syncRun.id))!.status, 'cancelled');
});

test('adapter rejection and final transaction failure never persist successful completion', async () => {
  for (const failure of ['adapter', 'completion']) {
    const f = syncFixture(); const queued = await f.enqueue();
    if (failure === 'adapter') f.services.execute = async () => { throw Object.assign(new Error('sensitive fixture text'), { code: 'FIXTURE_PROVIDER_FAILURE' }); };
    else f.state.failCompletion = true;
    await assert.rejects(executeBrandForgeSync(f.context(queued.job), f.services));
    const row = f.runs.get(String(queued.syncRun.id))!;
    assert.equal(row.status, 'dead_letter'); assert.equal(row.result, undefined); assert.equal(f.state.lastSyncWrites, 0);
    assert(!JSON.stringify(row).includes('sensitive fixture text'));
  }
});

test('overlapping awaited attempts do not enter the adapter or poison the active run', async () => {
  const f = syncFixture(); const queued = await f.enqueue(); const context = f.context(queued.job);
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  const identities: string[] = [];
  f.services.execute = async input => { f.state.executions++; identities.push(input.idempotencyKey); entered(); await held; return { externalDelivery: false }; };
  const first = executeBrandForgeSync(context, f.services);
  await started;
  const second = executeBrandForgeSync(context, f.services);
  let outcome: PromiseSettledResult<void>;
  try {
    outcome = await Promise.race([
      Promise.allSettled([second]).then(results => results[0]!),
      new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error('Contender did not fail promptly')), 1000); timer.unref(); }),
    ]);
    assert.equal(outcome.status, 'rejected');
    if (outcome.status === 'rejected') assert.equal(outcome.reason.code, 'BRANDFORGE_SYNC_IN_PROGRESS');
    assert.equal(f.state.executions, 1);
    assert.equal(f.runs.get(String(queued.syncRun.id))!.status, 'processing');
  } finally {
    console.info('Overlap observation', JSON.stringify({ adapterEntries: f.state.executions, identities }));
    release(); await Promise.allSettled([first, second]);
  }
  assert.equal(f.runs.get(String(queued.syncRun.id))!.status, 'completed');
  await executeBrandForgeSync(context, f.services);
  assert.deepEqual(identities, [queued.syncRun.id]);
});

test('small pools fail before business mutation and a corrected capacity can retry the same identity', async () => {
  for (const max of ['1', '2']) {
    const f = syncFixture(); const queued = await f.enqueue();
    f.services.env = { NODE_ENV: 'test', APP_ENV: 'test', DATABASE_POOL_MAX: max };
    await assert.rejects(executeBrandForgeSync(f.context(queued.job), f.services), { code: 'BRANDFORGE_SYNC_DATABASE_CAPACITY_UNAVAILABLE' });
    assert.equal(f.state.executions, 0);
    assert.equal(f.runs.get(String(queued.syncRun.id))!.status, 'queued');
    f.services.env.DATABASE_POOL_MAX = '3';
    await executeBrandForgeSync(f.context(queued.job), f.services);
    assert.equal(f.state.executions, 1);
    assert.equal(f.runs.get(String(queued.syncRun.id))!.status, 'completed');
  }
});
