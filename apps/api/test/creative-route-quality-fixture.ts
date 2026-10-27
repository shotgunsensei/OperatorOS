import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { PgDialect } from 'drizzle-orm/pg-core';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const dialect = new PgDialect();
export type Row = Record<string, any>;
export function queryOf(query: Parameters<PgDialect['sqlToQuery']>[0]) { return dialect.sqlToQuery(query); }

// Evaluate only the actual simple, conjunctive identity predicates used by these
// handlers. Unknown policy syntax fails the fixture instead of granting access.
export function matchingRows(query: ReturnType<typeof queryOf>, records: Row[]) {
  const where = query.sql.split(/\bWHERE\b/i).at(-1)?.replace(/\b(?:LIMIT|ORDER BY|FOR UPDATE)\b[\s\S]*/i, '').trim();
  assert.ok(where, 'Fixture SELECT must contain a WHERE clause');
  return records.filter(row => where.split(/\s+AND\s+/i).every(term => {
    const equal = /^(?:[a-z_]+\.)?([a-z_]+)\s*=\s*\$(\d+)$/i.exec(term.trim());
    if (equal) { assert.ok(Object.hasOwn(row, equal[1]), `Unknown fixture column ${equal[1]}`); return String(row[equal[1]]) === String(query.params[Number(equal[2]) - 1]); }
    const nil = /^(?:[a-z_]+\.)?([a-z_]+)\s+IS NULL$/i.exec(term.trim());
    if (nil) { assert.ok(Object.hasOwn(row, nil[1]), `Unknown fixture column ${nil[1]}`); return row[nil[1]] == null; }
    throw new Error(`Unmodeled fixture predicate: ${term}`);
  }));
}

const allowedPure = new Set(['lib/ninja-launch-kit-phase34.ts','generated/ninja-launch-kit-source-catalog.ts','lib/snapproofos.ts','lib/snapproofos-media.ts','lib/ninjamation.ts','lib/ninjamation-phase36.ts','lib/shared-service-safety.ts']);
export function loadSource(relative: string, dependencies: Record<string, unknown> = {}, expose: string[] = []) {
  const path = new URL(`../src/${relative}`, import.meta.url);
  const source = readFileSync(path, 'utf8');
  const module = { exports: {} as Row };
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(compiled + expose.map(name => `\nexports.${name} = ${name};`).join(''), { exports: module.exports, module, Buffer, Date, URL, AbortSignal,
    process: { env: { NODE_ENV: 'test', APP_ENV: 'test' } },
    fetch() { throw new Error('Network is forbidden in this fixture'); },
    require(name: string) {
      if (name in dependencies) return dependencies[name];
      if (['drizzle-orm','node:crypto'].includes(name)) return require(name);
      if (name.startsWith('.')) {
        const resolved = new URL(name.replace(/\.js$/, '.ts'), path);
        const local = resolved.pathname.split('/src/').at(-1)!;
        if (allowedPure.has(local)) return loadSource(local);
      }
      throw new Error(`Unmodeled dependency ${relative}: ${name}`);
    },
  }, { filename: `actual-${relative}` });
  return module.exports;
}

// Execute the real write guard; read authentication/tenant authority is a
// synthetic seed. This does not claim a real signed-session or entitlement test.
const authSource = readFileSync(new URL('../src/lib/tenant-auth.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('tenant-auth.ts', authSource, ts.ScriptTarget.Latest, true);
const guardNode = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'requireTenantModuleWriteAccess')!;
const guardModule = { exports: {} as Row };
runInNewContext(ts.transpileModule(guardNode.getText(ast), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  { module: guardModule, exports: guardModule.exports });
export const guards = {
  requireTenantModuleAccess: () => async () => undefined,
  requireTenantModuleWriteAccess: guardModule.exports.requireTenantModuleWriteAccess,
  requireTenantAdmin: async () => undefined,
  requireSuperAdmin: async () => undefined,
};

export function routeCollector() {
  const routes = new Map<string, { options: Row; handler: (request: Row, reply: Row) => Promise<any> }>();
  const app = Object.fromEntries(['get','post','patch','put','delete'].map(method => [method, (path: string, options: Row, handler: (request: Row, reply: Row) => Promise<any>) => routes.set(`${method}:${path}`, { options, handler })]));
  return { app, async invoke(method: string, path: string, input: Row = {}) {
    const request = { id: 'fixture-request', params: {}, body: {}, query: {}, user: { id: 'owner-a' }, tenantContext: { tenantId: 'tenant-a', role: 'member', membershipRole: 'member', viaPlatformRole: false }, tenantModuleAccessLevel: 'user', ...input };
    const reply: Row = { statusCode: 200, sent: false, payload: undefined, code(status: number) { this.statusCode = status; return this; }, send(value: unknown) { this.sent = true; this.payload = value; return value; }, header() { return this; }, type() { return this; } };
    const route = routes.get(`${method}:${path}`); assert.ok(route, 'Actual route must be registered');
    for (const guard of route.options.preHandler ?? []) { await guard(request, reply); if (reply.sent) return { status: reply.statusCode, body: reply.payload }; }
    const result = await route.handler(request, reply);
    return { status: reply.statusCode, body: reply.sent ? reply.payload : result };
  } };
}
