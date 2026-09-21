import assert from 'node:assert/strict';
import test from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';

process.env.APP_ENV = 'test'; process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'shared-queue-scope-unit-tests-only';
process.env.DATABASE_URL = 'postgresql://operatoros:local-only@127.0.0.1:7349/operatoros_test';
const { getSharedServiceQueueHealth } = await import('../src/lib/shared-service-worker.js');

test('every customer queue count and age is filtered by the trusted organization', async () => {
  const dialect = new PgDialect();
  let captured: ReturnType<PgDialect['sqlToQuery']> | undefined;
  const executor = { execute: async (statement: Parameters<PgDialect['sqlToQuery']>[0]) => {
    captured = dialect.sqlToQuery(statement);
    return { rows: [{ jobs_dead_letter: 2 }] };
  } };
  assert.deepEqual(await getSharedServiceQueueHealth('organization-a', executor as never), { jobs_dead_letter: 2 });
  assert.ok(captured);
  const queries = captured.sql.match(/\(SELECT[\s\S]*?\) AS \w+/g) ?? [];
  assert.equal(queries.length, 12);
  for (const query of queries) assert.match(query, /WHERE tenant_id = \$\d+ AND/);
  assert.deepEqual(captured.params, Array(12).fill('organization-a'));
  await getSharedServiceQueueHealth('organization-b', executor as never);
  assert.deepEqual(captured.params, Array(12).fill('organization-b'));
});

test('only an explicitly unscoped platform check returns aggregate queue health', async () => {
  const dialect = new PgDialect();
  await getSharedServiceQueueHealth(undefined, { execute: async statement => {
    const query = dialect.sqlToQuery(statement as Parameters<PgDialect['sqlToQuery']>[0]);
    assert.equal(query.params.length, 0);
    assert.equal((query.sql.match(/WHERE TRUE AND/g) ?? []).length, 12);
    return { rows: [] };
  } } as never);
});
