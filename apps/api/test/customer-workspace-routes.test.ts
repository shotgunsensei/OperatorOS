import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { guards, routeCollector } from './creative-route-quality-fixture.js';
import { ids, loadWorkspaceSource, workspaceFixture, type Row } from './customer-workspace-fixture.js';

// Extract the real pure session path policy, without bootstrapping auth/DB.
const ast = ts.createSourceFile('auth.ts', readFileSync(new URL('../src/lib/auth.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const policy = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'isModuleSessionPathAllowed')!;
const policyModule = { exports: {} as Row };
runInNewContext(ts.transpileModule(policy.getText(ast), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: policyModule, exports: policyModule.exports });

class FixtureFabricError extends Error { constructor(readonly code: string, message: string, readonly statusCode: number) { super(message); } }
async function routeFixture() {
  const f = workspaceFixture(); const published: Row[] = [], audits: Row[] = [];
  let sourceAllowed = true, destinationAllowed = true;
  const route = loadWorkspaceSource('routes/customer-workspace-routes.ts', {
    '../db.js': { db: f.database }, '../lib/customer-workspace.js': f.helper,
    '../lib/tenant-auth.js': {
      async requireTenantMember(request: Row, reply: Row) {
        if (request.authSession?.sessionType === 'module' && !policyModule.exports.isModuleSessionPathAllowed(request.authSession.moduleId, request.url)) return reply.code(403).send({ code: 'SESSION_SCOPE_DENIED' });
        if (request.tenantContext.tenantId !== ids.tenant) return reply.code(404).send({ code: 'TENANT_NOT_FOUND' });
      },
      requireTenantModuleAccess(slug: string) { assert.equal(slug, 'tradeflowkit'); return async (_request: Row, reply: Row) => { if (!sourceAllowed) return reply.code(403).send({ code: 'TENANT_MODULE_ACCESS_DENIED' }); }; },
      requireTenantModuleWriteAccess: guards.requireTenantModuleWriteAccess,
    },
    '../lib/cross-module-data-fabric.js': {
      DataFabricError: FixtureFabricError,
      async getDataFabricWorkflowReadiness() { return { available: destinationAllowed, blocker: destinationAllowed ? null : 'destination_unavailable' }; },
      async publishDataFabricWorkflow(input: Row) {
        if (!destinationAllowed) throw new FixtureFabricError('FABRIC_MODULE_ACCESS_DENIED', 'Destination unavailable', 403);
        published.push(input); return { duplicate: false, requeued: false, run: { id: '80000000-0000-4000-8000-000000000001', status: 'queued' } };
      },
    }, '../lib/audit.js': { async writeAudit(input: Row) { audits.push(input); } },
  });
  const collector = routeCollector(); await route.registerCustomerWorkspaceRoutes(collector.app);
  return { ...f, published, audits, source(value: boolean) { sourceAllowed = value; }, destination(value: boolean) { destinationAllowed = value; },
    invoke(method: string, path: string, input: Row = {}) { return collector.invoke(method, path, { url: path, user: { id: ids.user }, tenantContext: { tenantId: ids.tenant, role: 'member', membershipRole: 'member', viaPlatformRole: false }, tenantModuleAccessLevel: 'user', ...input }); },
    body: async () => ({ jobId: ids.job, expectedSourceVersion: 1, directoryContext: await f.context(), idempotencyKey: 'workspace-fixture-intent' }),
  };
}

test('workspace source denial happens before Directory reads and never leaks clients/counts', async () => {
  const f = await routeFixture(); f.source(false);
  const result = await f.invoke('get', '/v1/customer-workspace/customers');
  assert.equal(result.status, 403); assert.equal(f.statements.length, 0); assert.doesNotMatch(JSON.stringify(result.body), /Synthetic business|customers|hasMore/);
});

test('module sessions cannot use the platform workspace surface', async () => {
  const f = await routeFixture(); const result = await f.invoke('get', '/v1/customer-workspace/customers', { authSession: { sessionType: 'module', moduleId: 'tradeflowkit' } });
  assert.equal(result.status, 403); assert.equal(result.body.code, 'SESSION_SCOPE_DENIED'); assert.equal(f.statements.length, 0);
});

test('foreign tenant selection is rejected before Directory reads', async () => {
  const f = await routeFixture(); assert.equal((await f.invoke('get', '/v1/customer-workspace/customers', { tenantContext: { tenantId: ids.otherTenant } })).status, 404); assert.equal(f.statements.length, 0);
});

test('authorized business-name search is bounded and is not written to audit', async () => {
  const f = await routeFixture(); const result = await f.invoke('get', '/v1/customer-workspace/customers', { query: { search: 'Synthetic', limit: '30', offset: '0' } });
  assert.equal(result.status, 200); assert.equal(result.body.customers[0].id, ids.organization); assert.equal(result.body.sourceModule, 'tradeflowkit'); assert.equal(f.audits.length, 0);
  assert.ok(f.statements.some(statement => /name ILIKE/.test(statement))); assert.ok(f.statements.every(statement => !/email ILIKE|phone ILIKE/.test(statement)));
});

test('viewer retains context/job read but cannot enqueue a handoff', async () => {
  const f = await routeFixture();
  const viewer = { tenantContext: { tenantId: ids.tenant, membershipRole: 'viewer', viaPlatformRole: false }, tenantModuleAccessLevel: 'viewer' };
  const read = await f.invoke('get', '/v1/customer-workspace/customers/:organizationId', { ...viewer, params: { organizationId: ids.organization } });
  assert.equal(read.status, 200); assert.equal(read.body.capabilities.readOnly, true); assert.equal(read.body.capabilities.canRequestFieldProof, false);
  const body = await f.body(); const writes = await f.invoke('post', '/v1/customer-workspace/field-proof', { ...viewer, body });
  assert.equal(writes.status, 403); assert.equal(f.published.length, 0); assert.equal(f.native.length, 0);
});

test('destination unavailability is honest and publisher denial never queues or writes proof', async () => {
  const f = await routeFixture(); f.destination(false);
  const detail = await f.invoke('get', '/v1/customer-workspace/customers/:organizationId', { params: { organizationId: ids.organization } });
  assert.equal(detail.body.capabilities.canRequestFieldProof, false); assert.equal(detail.body.capabilities.handoffBlocker, 'destination_unavailable');
  const result = await f.invoke('post', '/v1/customer-workspace/field-proof', { body: await f.body() });
  assert.equal(result.status, 403); assert.equal(f.published.length, 0); assert.equal(f.native.length, 0);
});

test('qualified existing job is queued through the fixed existing fabric workflow, never reported delivered', async () => {
  const f = await routeFixture(); const result = await f.invoke('post', '/v1/customer-workspace/field-proof', { body: await f.body() });
  assert.equal(result.status, 202); assert.equal(result.body.run.status, 'queued'); assert.equal(f.native.length, 0);
  assert.equal(f.published[0].workflowKey, 'tradeflowkit.job_to_snapproof'); assert.equal(f.published[0].tenantId, ids.tenant);
  assert.equal(f.published[0].sourceDeepLink, `/modules/tradeflowkit/jobs/${ids.job}`); assert.deepEqual(JSON.parse(JSON.stringify(f.published[0].payload.directoryContext)), JSON.parse(JSON.stringify((await f.body()).directoryContext)));
  assert.equal(f.audits.length, 1); assert.equal('directoryContext' in f.audits[0].after, false);
});

for (const extra of ['tenantId', 'userId', 'role', 'workflowKey']) test(`strict workspace action rejects submitted ${extra}`, async () => {
  const f = await routeFixture(); const result = await f.invoke('post', '/v1/customer-workspace/field-proof', { body: { ...await f.body(), [extra]: 'untrusted' } });
  assert.equal(result.status, 400); assert.equal(result.body.code, 'CUSTOMER_WORKSPACE_INPUT_INVALID'); assert.equal(f.published.length, 0);
});

test('stale job/context rejects the action with reload semantics', async () => {
  const f = await routeFixture(); const body = await f.body(); f.job.version++;
  const result = await f.invoke('post', '/v1/customer-workspace/field-proof', { body });
  assert.equal(result.status, 409); assert.equal(result.body.code, 'CUSTOMER_CONTEXT_CHANGED'); assert.equal(f.published.length, 0);
});

test('invalid bounds and unknown filters reject before data access', async () => {
  const f = await routeFixture();
  for (const query of [{ limit: 101 }, { offset: -1 }, { search: 'a'.repeat(201) }, { email: 'person@example.test' }]) assert.equal((await f.invoke('get', '/v1/customer-workspace/customers', { query })).status, 400);
  assert.equal(f.statements.length, 0);
});
