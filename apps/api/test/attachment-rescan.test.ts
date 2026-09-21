import assert from 'node:assert/strict';
import test from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { readFileSync } from 'node:fs';

process.env.APP_ENV = 'test'; process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'attachment-rescan-unit-tests-only';
process.env.DATABASE_URL = 'postgresql://operatoros:local-only@127.0.0.1:7349/operatoros_test';
const { requestAttachmentRescan } = await import('../src/lib/shared-platform-control-plane.js');
const { setAttachmentScannerForTests } = await import('../src/lib/shared-attachments.js');
const input = { tenantId: 'team-a', moduleId: 'module-a', attachmentId: '11111111-1111-4111-8111-111111111111', actorUserId: 'admin-a' };

test('rescan changes status, queues a unique scan, and audits within one transaction', async () => {
  const dialect = new PgDialect();
  const queries: ReturnType<PgDialect['sqlToQuery']>[] = [];
  const audits: any[] = [];
  let transactions = 0;
  setAttachmentScannerForTests({ name: 'synthetic', configured: true, scan: async () => 'clean' });
  const database = { transaction: async (work: (tx: unknown) => Promise<unknown>) => {
    transactions++;
    return work({
      execute: async (statement: Parameters<PgDialect['sqlToQuery']>[0]) => {
        queries.push(dialect.sqlToQuery(statement));
        return { rows: queries.length === 1 ? [{ id: input.attachmentId, version: 4 }] : [{ id: 'job-a' }] };
      },
      insert: () => ({ values: async (value: unknown) => { audits.push(value); } }),
    });
  } };
  try {
    assert.deepEqual(await requestAttachmentRescan(input, undefined, database as never), { attachmentId: input.attachmentId, scanStatus: 'pending' });
    assert.equal(transactions, 1);
    assert.match(queries[0].sql, /tenant_id = \$\d+[\s\S]*module_id = \$\d+[\s\S]*deleted_at IS NULL[\s\S]*scan_status IN \('unavailable', 'error'\)/);
    assert.deepEqual(queries[0].params, [input.attachmentId, input.tenantId, input.moduleId]);
    assert.match(queries[1].sql, /INSERT INTO shared_jobs/);
    assert.ok(queries[1].params.includes(`rescan:${input.attachmentId}:4`));
    assert.equal(audits[0].tenantId, input.tenantId);
    assert.equal(audits[0].action, 'shared_attachment_rescan_requested');
  } finally { setAttachmentScannerForTests(null); }
});

test('unavailable scanners and invalid IDs cannot mutate or schedule a file', async () => {
  const database = { transaction: async () => assert.fail('transaction must not start') };
  setAttachmentScannerForTests(null);
  await assert.rejects(requestAttachmentRescan(input, undefined, database as never), { code: 'ATTACHMENT_SCANNER_UNAVAILABLE' });
  await assert.rejects(requestAttachmentRescan({ ...input, attachmentId: 'bad' }, undefined, database as never), { code: 'ATTACHMENT_ID_INVALID' });
});

test('an ineligible or inaccessible file returns one generic failure without queueing work', async () => {
  setAttachmentScannerForTests({ name: 'synthetic', configured: true, scan: async () => 'clean' });
  let queries = 0;
  const database = { transaction: async (work: (tx: unknown) => Promise<unknown>) => work({ execute: async () => { queries++; return { rows: [] }; } }) };
  try {
    await assert.rejects(requestAttachmentRescan(input, undefined, database as never), { code: 'ATTACHMENT_RESCAN_NOT_FOUND' });
    assert.equal(queries, 1);
  } finally { setAttachmentScannerForTests(null); }
});

test('rescan route uses the existing administrator and enabled-module gates', () => {
  const source = readFileSync(new URL('../src/routes/shared-platform-routes.ts', import.meta.url), 'utf8');
  const route = source.slice(source.indexOf("app.post('/v1/tenants/:tenantId/shared-platform/attachments/:attachmentId/rescan'"), source.indexOf("app.get('/v1/tenants/:tenantId/shared-platform/overview'"));
  assert.match(route, /preHandler: \[requireTenantAdmin\]/);
  assert.match(route, /moduleId\(tenantId, String\(body.moduleSlug/);
  assert.match(route, /moduleId: resolvedModuleId/);
});
