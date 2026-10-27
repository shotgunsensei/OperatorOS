import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, Script } from 'node:vm';
import test from 'node:test';
import Fastify from 'fastify';
import { sql, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import ts from 'typescript';
import * as domain from '../src/lib/ninjamation.ts';

// Run the actual registered route with only DB, authority and unrelated
// providers replaced. No real pool, network server, script or provider runs.
const TENANT = 'synthetic-tenant-a';
const USER = 'synthetic-reader-a';
const SCRIPT = 'synthetic-script-a';
const ROUTE = `/v1/modules/ninjamation/scripts/${SCRIPT}/downloads`;

async function fixture(content: string, options: { storedHash?: string; status?: string; missing?: boolean } = {}) {
  const app = Fastify();
  const reads: Array<{ sql: string; params: unknown[] }> = [];
  const writes: Array<{ sql: string; params: unknown[] }> = [];
  const events: unknown[] = [];
  const guardModules: string[] = [];
  let transactions = 0;
  const dialect = new PgDialect();
  const current = {
    id: SCRIPT, name: 'Synthetic download', language: 'powershell',
    status: options.status ?? 'approved', script_version_id: 'synthetic-version-a',
    content, content_sha256: options.storedHash ?? domain.sha256(content),
  };
  const execute = async (query: SQL) => {
      const compiled = dialect.sqlToQuery(query);
      const text = compiled.sql.replace(/\s+/g, ' ').trim();
      if (text.includes('FROM ninjamation_scripts s')) {
        reads.push({ sql: text, params: compiled.params });
        assert.match(text, /WHERE s\.tenant_id=\$1 AND s\.id=\$2 AND s\.deleted_at IS NULL/);
        return { rows: !options.missing && compiled.params[0] === TENANT && compiled.params[1] === SCRIPT ? [current] : [] };
      }
      if (text.includes('FROM modules')) return { rows: [{ id: 'synthetic-module-a' }] };
      if (text.includes('INSERT INTO ninjamation_downloads')) {
        writes.push({ sql: text, params: compiled.params });
        return { rows: [] };
      }
      throw new Error(`Unexpected synthetic DB operation: ${text}`);
  };
  const executor = {
    execute,
    async transaction<T>(operation: (tx: { execute: typeof execute }) => Promise<T>): Promise<T> {
      transactions++;
      return operation(executor);
    },
  };
  const unavailable = () => { throw new Error('Download must not invoke an unrelated provider or operation'); };
  const authorityGuard = async (request: { tenantContext?: unknown; user?: unknown }) => {
    request.tenantContext = { tenantId: TENANT };
    request.user = { id: USER };
  };
  const modules: Record<string, Record<string, unknown>> = {
    'drizzle-orm': { sql },
    '../db.js': { db: executor },
    '../lib/tenant-auth.js': {
      requireTenantModuleAccess: (module: string) => { guardModules.push(module); return authorityGuard; },
      requireTenantModuleWriteAccess: unavailable,
      requireTenantAdmin: unavailable,
    },
    '../lib/ninjamation.js': { ...domain },
    '../lib/ai-provider.js': { AiProviderDisabledError: class extends Error {}, getAiProvider: unavailable },
    '../lib/shared-usage-activity.js': {
      appendActivityEvent: async (event: unknown) => { events.push(event); },
      beginIdempotentOperation: unavailable, completeIdempotentOperation: unavailable,
      failIdempotentOperation: unavailable, recordUsageEvent: unavailable,
    },
  };
  const sourcePath = new URL('../src/routes/ninjamation-routes.ts', import.meta.url);
  const source = await readFile(sourcePath, 'utf8');
  // Compile/evaluate trusted application-module source only; submitted script
  // bodies remain inert fixture strings. CommonJS VM needs no experimental flag.
  const emitted = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const moduleExports: Record<string, unknown> = {};
  const context = createContext({
    exports: moduleExports,
    require: (specifier: string) => {
      const supplied = modules[specifier];
      assert.ok(supplied, `Unreviewed fixture import: ${specifier}`);
      return supplied;
    },
  });
  new Script(emitted, { filename: sourcePath.pathname }).runInContext(context);
  const register = moduleExports.registerNinjamationRoutes as (instance: typeof app) => Promise<void>;
  await register(app);
  await app.ready();
  assert.deepEqual(guardModules, ['ninjamation']);
  return { app, reads, writes, events, transactionCount: () => transactions };
}

for (const [name, content] of [
  ['without a final newline', 'Write-Output "synthetic-only"'],
  ['with trailing whitespace and blank lines', 'Write-Output "synthetic-only" \t\n\n  '],
  ['with Unicode and CRLF', 'Write-Output "synthetic-π"\r\n\r\n'],
  ['with the existing single-LF convention', 'Write-Output "synthetic-only"\n'],
]) {
  test(`legacy approved download preserves exact reviewed bytes ${name}`, async () => {
    const state = await fixture(content);
    try {
      const response = await state.app.inject({ method: 'POST', url: ROUTE, headers: { 'x-tenant-id': 'untrusted-tenant-b' } });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.rawPayload, Buffer.from(content, 'utf8'));
      assert.equal(response.headers['x-ninjamation-content-sha256'], domain.sha256(response.rawPayload));
      assert.equal(response.headers['cache-control'], 'private, no-store');
      assert.equal(response.headers['x-content-type-options'], 'nosniff');
      assert.equal(state.transactionCount(), 1);
      assert.equal(state.writes.length, 1);
      assert.equal(state.writes[0].params[0], TENANT);
      assert.equal(state.writes[0].params[3], USER);
      assert.ok(state.writes[0].params.includes(domain.sha256(content)));
      assert.equal(state.events.length, 1);
      assert.equal(state.reads[0].params[0], TENANT);
    } finally { await state.app.close(); }
  });
}

test('legacy approved download rejects changed content before streaming or success bookkeeping', async () => {
  const changed = 'Write-Output "synthetic-changed-after-review"';
  const state = await fixture(changed, { storedHash: domain.sha256('Write-Output "synthetic-reviewed"') });
  try {
    const response = await state.app.inject({ method: 'POST', url: ROUTE });
    assert.equal(response.statusCode, 409);
    assert.equal(response.json().code, 'NINJAMATION_DOWNLOAD_INTEGRITY_FAILED');
    assert.equal(response.headers['content-disposition'], undefined);
    assert.equal(response.headers['x-ninjamation-content-sha256'], undefined);
    assert.ok(!response.body.includes(changed));
    assert.equal(state.transactionCount(), 0);
    assert.equal(state.writes.length, 0);
    assert.equal(state.events.length, 0);
  } finally { await state.app.close(); }
});

test('legacy download retains the existing unapproved-state denial', async () => {
  const state = await fixture('Write-Output "synthetic-draft"', { status: 'draft' });
  try {
    const response = await state.app.inject({ method: 'POST', url: ROUTE });
    assert.equal(response.statusCode, 409);
    assert.equal(response.json().code, 'NINJAMATION_DOWNLOAD_NOT_APPROVED');
    assert.equal(state.transactionCount(), 0);
    assert.equal(state.writes.length, 0);
  } finally { await state.app.close(); }
});

test('legacy download retains masked missing-resource behavior', async () => {
  const state = await fixture('Write-Output "synthetic-missing"', { missing: true });
  try {
    const response = await state.app.inject({ method: 'POST', url: ROUTE });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json().code, 'NINJAMATION_SCRIPT_NOT_FOUND');
    assert.equal(state.transactionCount(), 0);
    assert.equal(state.writes.length, 0);
  } finally { await state.app.close(); }
});
