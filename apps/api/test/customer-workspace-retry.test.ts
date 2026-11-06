import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { guards, routeCollector } from './creative-route-quality-fixture.js';
import { compiled, ids, loadWorkspaceSource, workspaceFixture, type Row } from './customer-workspace-fixture.js';

const require = createRequire(import.meta.url);

/** Actual publisher and private hash functions; only authority/storage edges are injected.
 * This single existing-row fixture does not evaluate the full publisher SELECT in PostgreSQL.
 * Unexpected writes, enqueues, adapters, bootstrap dependencies and network calls fail. */
function existingOperation() {
  const statements: string[] = [];
  let existing: Row;
  const database = { async execute(value: any): Promise<{ rows: Row[] }> {
    const query = compiled(value); statements.push(query.sql);
    if (/FROM modules WHERE slug=/.test(query.sql)) return { rows: [{ id: `module-${query.params[0]}`, slug: query.params[0], status: 'active', archived_at: null }] };
    if (/pg_advisory_xact_lock/.test(query.sql)) return { rows: [{}] };
    if (/FROM shared_workflow_runs r/.test(query.sql)) {
      assert.match(query.sql, /r\.tenant_id=\$/); assert.match(query.sql, /r\.workflow_key=\$/);
      assert.ok(query.params.includes(ids.tenant)); assert.ok(query.params.includes('tradeflowkit.job_to_snapproof'));
      // The actual publisher's semantic-key predicate can select this existing
      // operation even when the caller supplies an entirely new retry key.
      assert.ok(query.params.includes(existing.idempotency_key));
      return { rows: [existing] };
    }
    throw new Error(`Unexpected publisher storage operation: ${query.sql}`);
  }, async transaction(task: (tx: Row) => Promise<any>) { return task(database); } };
  const module = { exports: {} as Row };
  const source = readFileSync(new URL('../src/lib/cross-module-data-fabric.ts', import.meta.url), 'utf8')
    + '\nexport const workspaceRetryHashes = {workflowSemanticIdempotencyKey, workflowRequestFingerprint};';
  const safety = loadWorkspaceSource('lib/shared-service-safety.ts', {});
  const dependencies: Row = {
    '../db.js': { db: database },
    './shared-background-jobs.js': { registerSharedJobHandler() {}, enqueueSharedJob() { throw new Error('Unexpected enqueue'); } },
    './shared-service-safety.js': safety,
    './tenant-entitlements.js': { async resolveTenantModuleAccess(_user: string, _tenant: string, slug: string) { return { hasAccess: true, accessLevel: 'manager', moduleId: `module-${slug}`, viaPlatformRole: false }; }, async getTenantMembership() { return { role: 'admin' }; } },
    './rbac.js': { isTenantAdmin: () => true },
    './cross-module-workflow-adapters.js': { deliverNativeWorkflow() { throw new Error('Unexpected adapter'); } },
  };
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module, exports: module.exports, Buffer, Date, URL, process: { env: { NODE_ENV: 'test', APP_ENV: 'test' }, pid: 0 },
    fetch() { throw new Error('No network permitted'); },
    require(name: string) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      if (['node:crypto', 'drizzle-orm'].includes(name)) return require(name);
      throw new Error(`Unmodeled publisher dependency: ${name}`);
    },
  });
  const fabric = module.exports;
  const directoryContext = { organizationId: ids.organization, siteId: ids.site, contactId: ids.contact, revision: 'a'.repeat(64) };
  const input = { tenantId: ids.tenant, actorUserId: ids.user, workflowKey: 'tradeflowkit.job_to_snapproof', aggregateId: ids.job, expectedSourceVersion: 1,
    sourceDeepLink: `/modules/tradeflowkit/jobs/${ids.job}`, idempotencyKey: 'accepted-workspace-intent', correlationId: 'synthetic-request', payload: { directoryContext } };
  const hashInput = (payload: Row) => ({ ...input, sourceModuleSlug: 'tradeflowkit', sourceType: 'tradeflowkit_job', sourceKind: 'job', idempotencyScope: 'tenant',
    expectedSourceVersion: '1', payload: safety.sanitizeSharedMetadata({ ...payload, sourceType: 'tradeflowkit_job', expectedSourceVersion: '1' }), propagationDepth: 0 });
  const original = hashInput(input.payload);
  existing = { id: '80000000-0000-4000-8000-000000000001', tenant_id: ids.tenant, workflow_key: input.workflowKey, actor_user_id: ids.user,
    idempotency_scope: 'tenant', idempotency_key: fabric.workspaceRetryHashes.workflowSemanticIdempotencyKey(original), status: 'completed', inbox_status: 'completed',
    details_json: { requestIdempotencyKey: input.idempotencyKey, requestFingerprint: fabric.workspaceRetryHashes.workflowRequestFingerprint(original) } };
  return { fabric, input, existing, statements, hashInput };
}

test('actual semantic key stays fixed while a changed reviewed Directory revision changes the full fingerprint', () => {
  const f = existingOperation(); const original = f.hashInput(f.input.payload);
  const changed = f.hashInput({ directoryContext: { ...f.input.payload.directoryContext, revision: 'b'.repeat(64) } });
  assert.equal(f.fabric.workspaceRetryHashes.workflowSemanticIdempotencyKey(original), f.fabric.workspaceRetryHashes.workflowSemanticIdempotencyKey(changed));
  assert.notEqual(f.fabric.workspaceRetryHashes.workflowRequestFingerprint(original), f.fabric.workspaceRetryHashes.workflowRequestFingerprint(changed));
});

for (const key of ['accepted-workspace-intent', 'different-workspace-intent']) test(`actual publisher returns the existing operation for unchanged context and ${key}`, async () => {
  const f = existingOperation(); const result = await f.fabric.publishDataFabricWorkflow({ ...f.input, idempotencyKey: key });
  assert.equal(result.duplicate, true); assert.equal(result.requeued, false); assert.equal(result.run.id, f.existing.id);
  assert.ok(f.statements.every(statement => !/\bINSERT\b|\bUPDATE\b/.test(statement)));
});

for (const key of ['accepted-workspace-intent', 'different-workspace-intent']) test(`actual publisher refuses changed context at the same job version with ${key}`, async () => {
  const f = existingOperation();
  await assert.rejects(f.fabric.publishDataFabricWorkflow({ ...f.input, idempotencyKey: key, payload: { directoryContext: { ...f.input.payload.directoryContext, revision: 'b'.repeat(64) } } }),
    { code: 'FABRIC_IDEMPOTENCY_CONFLICT', statusCode: 409 });
  assert.ok(f.statements.every(statement => !/\bINSERT\b|\bUPDATE\b/.test(statement)));
});

test('reconciling an already accepted operation after an unknown response preserves one stable intent and run', async () => {
  const f = existingOperation();
  const first = await f.fabric.publishDataFabricWorkflow(f.input);
  // A caller could lose this response after acceptance. Repeating the exact
  // reviewed request must resolve the seeded accepted run, never a new report.
  const retry = await f.fabric.publishDataFabricWorkflow(f.input);
  assert.equal(first.run.id, retry.run.id); assert.equal(retry.duplicate, true);
  assert.equal(f.input.idempotencyKey, 'accepted-workspace-intent');
});

test('workspace conflict guidance requires existing-operation reconciliation rather than promising a new key works', async () => {
  const f = existingOperation(); const workspace = workspaceFixture();
  const route = loadWorkspaceSource('routes/customer-workspace-routes.ts', {
    '../db.js': { db: workspace.database }, '../lib/customer-workspace.js': workspace.helper,
    '../lib/tenant-auth.js': { requireTenantMember() {}, requireTenantModuleAccess: () => () => undefined, requireTenantModuleWriteAccess: guards.requireTenantModuleWriteAccess },
    '../lib/cross-module-data-fabric.js': f.fabric, '../lib/audit.js': { writeAudit() { throw new Error('No audit after denied publish'); } },
  });
  const collector = routeCollector(); await route.registerCustomerWorkspaceRoutes(collector.app);
  const result = await collector.invoke('post', '/v1/customer-workspace/field-proof', {
    id: 'synthetic-request', user: { id: ids.user }, tenantContext: { tenantId: ids.tenant, membershipRole: 'member', viaPlatformRole: false }, tenantModuleAccessLevel: 'user',
    body: { jobId: ids.job, expectedSourceVersion: 1, directoryContext: await workspace.context(), idempotencyKey: 'different-workspace-intent' },
  });
  assert.equal(result.status, 409); assert.equal(result.body.code, 'FABRIC_IDEMPOTENCY_CONFLICT');
  assert.match(result.body.error, /existing.*operation/i); assert.match(result.body.error, /reconcile/i);
  assert.equal(workspace.native.length, 0);
});
