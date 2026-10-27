import test from 'node:test';
import assert from 'node:assert/strict';
import { compileOpsSql, loadOpsRoute, opsSelectMatches } from './_ops-isolated-route-fixture.js';

// Actual handler/parameterized SELECTs; synthetic records and guards only.
async function fixture() {
  const build = { id: '10000000-0000-4000-8000-000000000001', tenant_id: 'tenant-a', owner_user_id: 'owner-a', visibility: 'tenant', archived_at: null };
  const tables: Record<string, Array<Record<string, unknown>>> = {
    torqueshed_builds: [build], torqueshed_build_stages: [], torqueshed_build_tasks: [], torqueshed_build_parts: [],
    torqueshed_build_journal_entries: [
      {id:'private',tenant_id:'tenant-a',build_id:build.id,archived_at:null,visibility:'private',body:'Private diagnostic notes'},
      {id:'tenant',tenant_id:'tenant-a',build_id:build.id,archived_at:null,visibility:'tenant',body:'Team progress'},
      {id:'public',tenant_id:'tenant-a',build_id:build.id,archived_at:null,visibility:'public',body:'Published progress'},
      {id:'archived',tenant_id:'tenant-a',build_id:build.id,archived_at:'2026-10-27',visibility:'public',body:'Archived notes'},
      {id:'foreign',tenant_id:'tenant-b',build_id:build.id,archived_at:null,visibility:'public',body:'Another tenant'},
    ],
  };
  const executor = { async execute(query: Parameters<typeof compileOpsSql>[0]) {
    const compiled = compileOpsSql(query);
    const table = /\bFROM\s+(\w+)/i.exec(compiled.sql)?.[1];
    if (!table || !tables[table]) throw new Error('Unsupported fixture table');
    return { rows: tables[table].filter(row => opsSelectMatches(compiled, row)).map(row => ({...row})) };
  } };
  const handlerMap = new Map<string, (request: any, reply: any) => Promise<any>>();
  const app = Object.fromEntries(['get','post','patch','put','delete'].map(method => [method, (path: string, _options: unknown, handler: (request: any, reply: any) => Promise<any>) => handlerMap.set(`${method}:${path}`, handler)]));
  const dependencies: Record<string, unknown> = {
    '../db.js': { db: executor },
    '../lib/audit.js': { AUDIT_FLAG: Symbol('synthetic-audit'), writeAudit: async () => undefined },
    '../lib/tenant-auth.js': { requireTenantMember() {}, requireTenantModuleAccess: () => () => undefined, requireTenantModuleWriteAccess() {} },
    '../lib/shared-usage-activity.js': {}, '../lib/shared-schedules-exports.js': {},
    '../lib/torqueshed-product-export.js': { TORQUESHED_PRODUCT_EXPORT_TYPE: 'synthetic-only' },
    '../lib/torqueshed-social-service.js': { socialCamel: (row: unknown) => row },
  };
  const loaded = loadOpsRoute('torqueshed-web-api-routes.ts', dependencies);
  await loaded.registerTorqueShedWebApiRoutes(app);
  return { setBuildVisibility(visibility: string) { build.visibility = visibility; }, async read(actorId: string, role = 'member', tenantId = 'tenant-a', moduleAccess = 'user') {
    const reply = { status: 200, code(status: number) { this.status = status; return this; }, send(value: unknown) { return value; } };
    const response = await handlerMap.get('get:/v1/modules/torqueshed/builds/:id/workspace')!({ params: { id: build.id }, user: { id: actorId }, tenantContext: { tenantId, role, viaPlatformRole: false }, tenantModuleAccessLevel: moduleAccess }, reply);
    return { response, status: reply.status };
  } };
}

test('a member reading a tenant-visible build cannot receive private journal bodies', async () => {
  const f = await fixture();
    for (const visibility of ['tenant','public_build']) {
      f.setBuildVisibility(visibility);
      const { response, status } = await f.read('member-b');
      assert.equal(status, 200);
      assert.deepEqual(response.journal.map((entry: any) => entry.id).sort(), ['public','tenant']);
      assert.doesNotMatch(JSON.stringify(response), /Private diagnostic notes|Another tenant|Archived notes/);
    }
});

test('build owner and tenant administrators retain the complete nonarchived journal', async () => {
  const f = await fixture();
    for (const [actor, role] of [['owner-a','member'],['admin-a','admin'],['tenant-owner','owner']]) {
      const { response } = await f.read(actor, role);
      assert.deepEqual(response.journal.map((entry: any) => entry.id).sort(), ['private','public','tenant']);
    }
    const managed = await f.read('module-manager', 'member', 'tenant-a', 'manager');
    assert.deepEqual(managed.response.journal.map((entry: any) => entry.id).sort(), ['private','public','tenant']);
});

test('private builds and foreign tenants remain unavailable to an unrelated member', async () => {
  const f = await fixture();
    f.setBuildVisibility('private');
    assert.equal((await f.read('member-b')).status, 404);
    assert.equal((await f.read('owner-a', 'member', 'tenant-b')).status, 404);
});
