import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import Fastify, { type FastifyInstance } from 'fastify';
import ts from 'typescript';

// Actual route callbacks and validation, real Fastify injection, modeled DB.
// No application/database/provider imports or listening socket. The alternate
// root lets the same desired-state assertions examine an immutable baseline.
const root = process.env.TRADEFLOWKIT_TRANSITION_SOURCE_ROOT
  ?? fileURLToPath(new URL('../../../', import.meta.url));
const routeSource = readFileSync(resolve(root, 'apps/api/src/routes/module-shell-routes.ts'), 'utf8');
const parserSource = readFileSync(resolve(root, 'apps/api/src/lib/tradeflowkit-revenue.ts'), 'utf8');
const ast = ts.createSourceFile('routes', routeSource, ts.ScriptTarget.Latest, true);
const registration = ast.statements.find((node): node is ts.FunctionDeclaration =>
  ts.isFunctionDeclaration(node) && node.name?.text === 'registerModuleShellRoutes');
assert.ok(registration?.body);
const routePaths = {
  invoice: '/v1/modules/tradeflowkit/invoices/:id/transition',
  quote: '/v1/modules/tradeflowkit/quotes/:id/transition',
};
type Kind = keyof typeof routePaths;
function actualRoute(kind: Kind) {
  const matches = registration!.body!.statements.filter(node => ts.isExpressionStatement(node)
    && ts.isCallExpression(node.expression) && node.expression.expression.getText(ast) === 'app.post'
    && ts.isStringLiteral(node.expression.arguments[0]) && node.expression.arguments[0].text === routePaths[kind]);
  assert.equal(matches.length, 1);
  return matches[0].getText(ast);
}
const validation = registration.body.statements.find(node => ts.isVariableStatement(node)
  && node.declarationList.declarations.some(decl => decl.name.getText(ast) === 'revenueValidation'));
assert.ok(validation);
const validationSource = validation.getText(ast);
const parserAst = ts.createSourceFile('revenue', parserSource, ts.ScriptTarget.Latest, true);
const parsers = parserAst.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(parserAst)).join('\n');
const transpile = (source: string) => ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText;

let networkCalls = 0;
const denyNetwork = () => { networkCalls++; throw new Error('Synthetic transition fixture prohibits networking'); };
const saved = { fetch: globalThis.fetch, httpRequest: http.request, httpGet: http.get,
  httpsRequest: https.request, httpsGet: https.get, connect: net.connect, createConnection: net.createConnection };
globalThis.fetch = denyNetwork;
http.request = denyNetwork; http.get = denyNetwork; https.request = denyNetwork; https.get = denyNetwork;
net.connect = denyNetwork; net.createConnection = denyNetwork;

type Row = Record<string, any>;
type State = Record<string, Row[]>;
type Column = { name: string; field: string };
type Table = Record<string, Column>;
type Predicate = (row: Row) => boolean;
const table = (name: string): Table => Object.fromEntries(['id', 'tenantId', 'deletedAt', 'version', 'status'].map(field => [field, { name, field }]));
const invoices = table('invoices'), quotes = table('quotes'), jobs = table('jobs');
const activity = { name: 'activity' };
const apps: FastifyInstance[] = [];
function fixture(kind: Kind, initial: Row = {}) {
  const row = { id: 'document-owned', tenantId: 'tenant-owned', deletedAt: null, status: 'draft', version: 1, ...initial };
  let committed: State = { invoices: kind === 'invoice' ? [row] : [], quotes: kind === 'quote' ? [row] : [],
    jobs: [{ id: 'job-owned', tenantId: 'tenant-owned', deletedAt: null, status: 'lead', version: 1 }], activity: [] };
  let failures = 0;
  let beforeUpdate: ((data: State) => void) | undefined;
  const trace: string[] = [];
  function executor(getState: () => State, transaction: boolean) {
    return {
      select() { return { from(columns: Table) { const name = columns.id.name; return {
        where(predicate: Predicate) { return { async limit(number: number) {
          return structuredClone(getState()[name].filter(predicate).slice(0, number));
        } }; },
      }; } }; },
      update(columns: Table) { const name = columns.id.name; return { set(patch: Row) { return { where(predicate: Predicate) {
        let done = false;
        let rows: Row[] = [];
        const execute = () => {
          if (done) return rows;
          done = true; rows = [];
          if (beforeUpdate) {
            const competingWrite = beforeUpdate; beforeUpdate = undefined;
            competingWrite(committed);
            // Model the latest committed row visible to this first UPDATE at
            // READ COMMITTED, after the handler's earlier pre-read. This is
            // not a PostgreSQL concurrency test or a general MVCC emulator.
            if (transaction) Object.assign(getState(), structuredClone(committed));
          }
          for (const item of getState()[name]) if (predicate(item)) {
            for (const [key, value] of Object.entries(patch)) item[key] = value?.increment ? item[value.increment.field] + 1 : value;
            rows.push(structuredClone(item));
          }
          trace.push(`${transaction ? 'tx' : 'autocommit'}:update:${name}:${rows.length}`);
          return rows;
        };
        return { async returning() { return execute(); }, then(fulfilled: any, rejected: any) { return Promise.resolve().then(execute).then(fulfilled, rejected); } };
      } }; } }; },
      insert(target: unknown) { assert.equal(target, activity); return { async values(value: Row) {
        if (failures) { failures--; trace.push('activity:rejected'); throw new Error('Synthetic activity insert failure'); }
        getState().activity.push(structuredClone(value)); trace.push('activity:inserted');
      } }; },
    };
  }
  const db = { ...executor(() => committed, false), async transaction(callback: (tx: ReturnType<typeof executor>) => Promise<unknown>) {
    trace.push('begin'); const pending = structuredClone(committed);
    try { const result = await callback(executor(() => pending, true)); committed = pending; trace.push('commit'); return result; }
    catch (error) { trace.push('rollback'); throw error; }
  } };
  const app = Fastify({ logger: false }); apps.push(app);
  const context = vm.createContext({ exports: {}, app, db, Date, Error,
    tradeflowkitInvoices: invoices, tradeflowkitQuotes: quotes, tradeflowkitJobs: jobs, activityFeed: activity,
    tradeflowkitWriteGuards: [async (request: any) => {
      // Explicit assumption: authoritative guards already approved this
      // synthetic user/tenant. This test does not prove authentication.
      request.tenantContext = { tenantId: request.headers['x-synthetic-tenant'] || 'tenant-owned' };
      request.user = { id: 'user-owned' };
    }],
    eq: (column: Column, value: unknown) => (item: Row) => item[column.field] === value,
    and: (...predicates: Predicate[]) => (item: Row) => predicates.every(predicate => predicate(item)),
    isNull: (column: Column) => (item: Row) => item[column.field] == null,
    sql: (strings: TemplateStringsArray, column: Column) => { assert.equal(strings.join(''), ' + 1'); return { increment: column }; },
    fetch: denyNetwork,
  });
  vm.runInContext(transpile(parsers), context, { timeout: 2000 });
  vm.runInContext(transpile(validationSource + '\n' + actualRoute(kind)), context, { timeout: 2000 });
  return { trace, snapshot: () => structuredClone(committed), failNextActivity: () => { failures++; },
    beforeCompareAndSwap: (callback: (data: State) => void) => { beforeUpdate = callback; },
    async send(status: string, expectedVersion = 1, tenant = 'tenant-owned') {
      const response = await app.inject({ method: 'POST', url: routePaths[kind].replace(':id', 'document-owned'),
        headers: { 'x-synthetic-tenant': tenant }, payload: { status, expectedVersion } });
      return { status: response.statusCode, body: response.json() };
    },
  };
}

test('invoice activity failure rolls back status/version and the identical request can be retried', async () => {
  const f = fixture('invoice'); const before = f.snapshot(); f.failNextActivity();
  const first = await f.send('sent'); assert.equal(first.status, 500);
  assert.equal(first.body.message, 'Synthetic activity insert failure');
  assert.deepEqual(f.snapshot(), before, 'failed activity must not leave a status/version change');
  const retry = await f.send('sent'); assert.equal(retry.status, 200);
  assert.equal(f.snapshot().invoices[0].status, 'sent'); assert.equal(f.snapshot().invoices[0].version, 2);
  assert.equal(f.snapshot().activity.length, 1);
});
test('a stale invoice version still conflicts without another status or activity write', async () => {
  const f = fixture('invoice'); assert.equal((await f.send('sent')).status, 200); const before = f.snapshot();
  const stale = await f.send('processing', 1); assert.equal(stale.status, 409); assert.equal(stale.body.code, 'INVOICE_VERSION_CONFLICT');
  assert.deepEqual(f.snapshot(), before);
});
test('a competing invoice transition after pre-read preserves the winning state and adds no activity', async () => {
  const f = fixture('invoice');
  f.beforeCompareAndSwap(data => { data.invoices[0].status = 'void'; data.invoices[0].version = 2; });
  const stale = await f.send('sent');
  assert.equal(stale.status, 409); assert.equal(stale.body.code, 'INVOICE_VERSION_CONFLICT');
  assert.equal(f.snapshot().invoices[0].status, 'void'); assert.equal(f.snapshot().invoices[0].version, 2);
  assert.equal(f.snapshot().activity.length, 0);
});
test('quote failure retains its existing rollback and retry behavior', async () => {
  const f = fixture('quote'); const before = f.snapshot(); f.failNextActivity();
  assert.equal((await f.send('sent')).status, 500); assert.deepEqual(f.snapshot(), before);
  assert.equal((await f.send('sent')).status, 200); assert.equal(f.snapshot().quotes[0].version, 2);
  assert.equal(f.snapshot().activity.length, 1);
});
test('quote accepted transition retains rollback of its linked job when activity fails', async () => {
  const f = fixture('quote', { status: 'sent', jobId: 'job-owned' }); const before = f.snapshot(); f.failNextActivity();
  assert.equal((await f.send('accepted')).status, 500); assert.deepEqual(f.snapshot(), before);
  assert.equal((await f.send('accepted')).status, 200); assert.equal(f.snapshot().jobs[0].status, 'quoted');
});
test('invoice success persists the response and exactly one scoped activity entry', async () => {
  const f = fixture('invoice'); const response = await f.send('sent'); assert.equal(response.status, 200);
  const data = f.snapshot(); assert.equal(response.body.version, 2); assert.equal(response.body.status, 'sent');
  assert.equal(data.activity.length, 1); assert.equal(data.activity[0].tenantId, 'tenant-owned');
  assert.equal(data.activity[0].metadata.fromStatus, 'draft'); assert.equal(data.activity[0].metadata.toStatus, 'sent');
});
for (const kind of ['invoice', 'quote'] as const) test(`${kind} foreign tenant and invalid input preserve all data`, async () => {
  const f = fixture(kind); const before = f.snapshot(); assert.equal((await f.send('sent', 1, 'tenant-foreign')).status, 404);
  const invalid = await f.send('not-a-status'); assert.equal(invalid.status, 400); assert.equal(invalid.body.code, 'STATUS_INVALID');
  assert.deepEqual(f.snapshot(), before); assert.equal(f.trace.some(item => item.includes(':update:') || item.startsWith('activity:')), false);
});
after(async () => {
  for (const app of apps) await app.close();
  globalThis.fetch = saved.fetch; http.request = saved.httpRequest; http.get = saved.httpGet;
  https.request = saved.httpsRequest; https.get = saved.httpsGet; net.connect = saved.connect; net.createConnection = saved.createConnection;
  assert.equal(networkCalls, 0);
});
