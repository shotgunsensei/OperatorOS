import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { PgDialect } from 'drizzle-orm/pg-core';

process.env.APP_ENV = 'test';
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET ||= randomBytes(40).toString('hex');
const { revokeApiToken } = await import('../src/lib/shared-platform-control-plane.js');
const dialect = new PgDialect();
type Query = ReturnType<PgDialect['sqlToQuery']>;

function recordingExecutor(rows: Array<Record<string, unknown>> = []) {
  const queries: Query[] = [];
  const executor = { execute: async (statement: Parameters<PgDialect['sqlToQuery']>[0]) => {
    queries.push(dialect.sqlToQuery(statement));
    return { rows };
  } };
  return { executor, queries };
}

test('module-scoped revocation binds token and owning identity in the same mutation', async () => {
  const expected = { id: 'token-a', revoked_at: '2026-11-09T00:00:00Z' };
  const { executor, queries } = recordingExecutor([expected]);
  assert.equal(await revokeApiToken({ tenantId: 'tenant-a', tokenId: 'token-a', moduleId: 'techdeck-id' }, executor as never), expected);
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /UPDATE shared_api_tokens AS token/);
  assert.match(queries[0].sql, /token\.tenant_id = \$1 AND token\.id = \$2 AND token\.revoked_at IS NULL/);
  assert.match(queries[0].sql, /AND EXISTS \([\s\S]*identity\.tenant_id = token\.tenant_id[\s\S]*identity\.id = token\.service_identity_id[\s\S]*identity\.module_id = \$3/);
  assert.deepEqual(queries[0].params, ['tenant-a', 'token-a', 'techdeck-id']);
});

test('missing, inaccessible, and already revoked tokens return the same empty result', async () => {
  const { executor, queries } = recordingExecutor();
  assert.equal(await revokeApiToken({ tenantId: 'tenant-a', tokenId: 'unavailable', moduleId: 'techdeck-id' }, executor as never), null);
  assert.equal(queries.length, 1);
});

test('an explicit empty module cannot fall back to platform-wide revocation', async () => {
  const { executor, queries } = recordingExecutor();
  await revokeApiToken({ tenantId: 'tenant-a', tokenId: 'token-a', moduleId: '' }, executor as never);
  assert.match(queries[0].sql, /identity\.module_id = \$3/);
  assert.deepEqual(queries[0].params, ['tenant-a', 'token-a', '']);
});

test('platform administration retains its existing tenant-wide revocation authority', async () => {
  const { executor, queries } = recordingExecutor();
  await revokeApiToken({ tenantId: 'tenant-a', tokenId: 'token-a' }, executor as never);
  assert.doesNotMatch(queries[0].sql, /shared_service_identities/);
  assert.match(queries[0].sql, /token\.tenant_id = \$1 AND token\.id = \$2/);
  assert.deepEqual(queries[0].params, ['tenant-a', 'token-a']);
});

test('TechDeck deletion retains admin guards and derives its module from the server registry', () => {
  const source = readFileSync(new URL('../src/routes/techdeck-literal-routes.ts', import.meta.url), 'utf8');
  const route = source.slice(source.indexOf("app.delete('/v1/modules/techdeck/api-tokens/:id'"), source.indexOf("app.get('/v1/modules/techdeck/webhooks'"));
  assert.match(route, /preHandler:\[\.\.\.adminGuards\]/);
  assert.match(route, /revokeApiToken\(\{tenantId:tenant\(request\),tokenId:id,moduleId:await techDeckModuleId\(\)\}\)/);
  assert.doesNotMatch(route, /request\.body/);
});
