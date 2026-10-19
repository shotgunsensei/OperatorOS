import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { stripExternalProviderEnvironment } from '../../../scripts/parity/lib/database.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const safeUrl = 'postgresql://postgres:synthetic-only@127.0.0.1:55471/operatoros_schema_test';

/** Intercept pg.Pool.connect before importing the fixture. Even a regressed
 * guard can only reach the sentinel: these tests never connect to a database.
 */
function probe(input: { url?: string; marker?: string; replacementUrl?: string }) {
  const environment: NodeJS.ProcessEnv = {
    ...stripExternalProviderEnvironment(process.env),
    APP_ENV: 'test', NODE_ENV: 'test',
    SESSION_SECRET: 'schema-fixture-guard-synthetic-session-only',
  };
  delete environment.DATABASE_URL;
  delete environment.PARITY_DATABASE_IS_DISPOSABLE;
  if (input.url !== undefined) environment.DATABASE_URL = input.url;
  if (input.marker !== undefined) environment.PARITY_DATABASE_IS_DISPOSABLE = input.marker;
  const script = `
    const { databasePool } = await import('./apps/api/src/db.ts');
    let connections = 0;
    databasePool.connect = callback => {
      connections += 1;
      const error = Object.assign(new Error('blocked fixture SQL sentinel'), { code: 'FIXTURE_SQL_SENTINEL' });
      if (typeof callback === 'function') { callback(error); return; }
      return Promise.reject(error);
    };
    const { ensureSchemaReady } = await import('./apps/api/test/_setup.ts');
    ${input.replacementUrl === undefined ? '' : `process.env.DATABASE_URL = ${JSON.stringify(input.replacementUrl)};`}
    try {
      await ensureSchemaReady();
      process.stdout.write(JSON.stringify({ connections, unexpectedSuccess: true }));
    } catch (error) {
      let current = error;
      let sentinel = false;
      for (let depth = 0; depth < 8 && current; depth++, current = current.cause) {
        if (current.code === 'FIXTURE_SQL_SENTINEL') sentinel = true;
      }
      process.stdout.write(JSON.stringify({ connections, sentinel }));
    } finally { await databasePool.end(); }
  `;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
    cwd: repositoryRoot, env: environment, encoding: 'utf8', timeout: 15_000,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error ?? 'fixture probe failed'));
  return JSON.parse(result.stdout) as { connections: number; sentinel?: boolean; unexpectedSuccess?: boolean };
}

test('direct schema bootstrap refuses missing opt-in and missing connection URL before SQL', () => {
  for (const input of [
    { url: safeUrl }, { url: safeUrl, marker: 'true' }, { marker: '1' },
  ]) assert.deepEqual(probe(input), { connections: 0, sentinel: false });
});

test('direct schema bootstrap refuses remote, persistent and query-retargeted pools before SQL', () => {
  for (const url of [
    'postgresql://postgres:synthetic-only@db.example.invalid/operatoros_test',
    'postgresql://postgres:synthetic-only@localhost.example.invalid/operatoros_test',
    'postgresql://postgres:synthetic-only@127.0.0.1:55471/operatoros',
    'postgresql://postgres:synthetic-only@127.0.0.1:55471/operatoros_contest',
    `${safeUrl}?host=db.example.invalid`, `${safeUrl}#host=db.example.invalid`,
    'https://127.0.0.1/operatoros_test',
  ]) assert.deepEqual(probe({ url, marker: '1' }), { connections: 0, sentinel: false }, url);
});

test('changing the environment to a safe URL cannot authorize a pool captured with an unsafe target', () => {
  assert.deepEqual(probe({
    url: 'postgresql://postgres:synthetic-only@db.example.invalid/operatoros_test',
    marker: '1', replacementUrl: safeUrl,
  }), { connections: 0, sentinel: false });
  assert.deepEqual(probe({ marker: '1', replacementUrl: safeUrl }), { connections: 0, sentinel: false });
});

test('authoritative disposable CI and local fixture identities can reach the SQL sentinel', () => {
  for (const url of [
    safeUrl,
    'postgresql://postgres:synthetic-only@127.0.0.1:5432/operatoros_phase21_release',
    'postgres://postgres:synthetic-only@localhost:55471/operatoros_disposable',
  ]) assert.deepEqual(probe({ url, marker: '1' }), { connections: 1, sentinel: true });
});
