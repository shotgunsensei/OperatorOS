import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { guards, loadSource, queryOf, routeCollector, type Row } from './creative-route-quality-fixture.js';

const source = readFileSync(new URL('../src/routes/module-shell-routes.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('module-shell-routes.ts', source, ts.ScriptTarget.Latest, true);
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && ['buildCards','buildCardsWithAi','extractJsonArray'].includes(node.name?.text ?? '')).map(node => node.getText(ast));
let registration = '';
function visit(node: ts.Node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'post' && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === '/v1/modules/studyforge-ai/sessions') registration = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast); assert.ok(registration);

async function fixture(options: { limit?: number; used?: number; provider?: 'openai'|'disabled'|'failure'; applicationStack?: boolean } = {}) {
  let used = options.used ?? 0, providerCalls = 0, resolves = 0; const writes: Row[] = [], order: string[] = [];
  const storedTenant = 'tenant-fixture', storedUser = 'learner-fixture';
  const table = { name: 'synthetic-module-study-sessions' };
  const database = { async execute(query: any) {
    const compiled = queryOf(query); assert.match(compiled.sql, /INSERT INTO studyforge_usage_counters/);
    assert.equal(compiled.params[0], storedTenant); assert.equal(compiled.params[1], storedUser);
    order.push('reserve');
    const bound = /WHERE studyforge_usage_counters\.generation_count < \$(\d+)/.exec(compiled.sql);
    if (bound && used >= Number(compiled.params[Number(bound[1])-1])) return { rows: [] };
    if (!bound) assert.match(compiled.sql, /WHERE TRUE/);
    used++; return { rows: [{ generation_count: used, quiz_attempt_count: 0 }] };
  }, insert(actualTable: unknown) { assert.equal(actualTable, table); return { values(row: Row) { return { async returning() { order.push('persist'); writes.push(row); return [{ ...row, id: 'synthetic-session' }]; } }; } }; } };
  const material = loadSource('lib/studyforge-phase33.ts');
  const access = loadSource('lib/studyforge-access.ts', {
    '../db.js': { db: database }, './studyforge-phase33.js': material,
    './entitlement-resolver.js': { resolveEntitlements: async (user: string, tenant: string) => { resolves++; assert.equal(user, storedUser); assert.equal(tenant, storedTenant); return { modules: [{ slug: 'studyforge-ai', enabled: true, features: { studyforgePlan: 'free', studyforgeMonthlyGenerations: options.limit ?? 2 } }] }; } },
    './product-entitlements.js': { tenantHasActiveApplicationStackCompanion: async () => options.applicationStack === true },
  });
  const collector = routeCollector();
  const provider = { name: options.provider === 'disabled' ? 'disabled' : 'openai', async complete() { providerCalls++; order.push('provider'); if (options.provider === 'failure') throw new Error('Synthetic provider failure'); return { text: JSON.stringify([{ question: 'What is this source?', answer: 'Local fixture content' }]) }; } };
  const compiled = ts.transpileModule(functions.join('\n')+'\n'+registration, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(compiled, { app: collector.app, Date, console: { warn() {} }, db: database, moduleStudySessions: table,
    studyforgeWriteGuards: [guards.requireTenantModuleAccess(), guards.requireTenantModuleWriteAccess], getAiProvider: () => provider,
    resolveStudyForgeAccess: access.resolveStudyForgeAccess, consumeStudyForgeUsage: access.consumeStudyForgeUsage });
  return { invoke(source: unknown = 'Local fixture material has enough words for a complete useful study card.', viewer = false) { return collector.invoke('post', '/v1/modules/studyforge-ai/sessions', { user: { id: storedUser }, tenantContext: { tenantId: storedTenant, membershipRole: 'member' }, tenantModuleAccessLevel: viewer ? 'viewer' : 'user', body: { source } }); }, counts: () => ({ used, providerCalls, resolves, writes: writes.length }), writes, order };
}

test('StudyForge sessions reject exhausted finite allowance before provider or persistence', async () => {
  const f = await fixture({ limit: 1, used: 1 }); const result = await f.invoke(); assert.equal(result.status, 402); assert.equal(result.body.code, 'STUDYFORGE_GENERATION_LIMIT_REACHED'); assert.equal(f.counts().providerCalls, 0); assert.equal(f.counts().writes, 0); assert.equal(f.counts().used, 1);
});
test('StudyForge zero allowance retains the existing structured limit error', async () => {
  const f = await fixture({ limit: 0 }); const result = await f.invoke(); assert.equal(result.status, 402); assert.equal(result.body.code, 'STUDYFORGE_GENERATION_LIMIT_REACHED'); assert.equal(f.counts().providerCalls, 0); assert.equal(f.counts().used, 0);
});
test('StudyForge allowed sessions reserve usage before provider and retain tenant/user persistence', async () => {
  const f = await fixture(); const result = await f.invoke(); assert.equal(result.status, 201); assert.equal(result.body.tenantId, 'tenant-fixture'); assert.equal(result.body.userId, 'learner-fixture'); assert.equal(result.body.cards[0].answer, 'Local fixture content'); assert.deepEqual(f.order, ['reserve','provider','persist']); assert.equal(f.counts().used, 1);
});
for (const provider of ['disabled','failure'] as const) test(`StudyForge ${provider} provider retains deterministic fallback within allowance`, async () => {
  const f = await fixture({ provider }); const result = await f.invoke(); assert.equal(result.status, 201); assert.ok(result.body.cards.length); assert.match(result.body.cards[0].answer, /Local fixture material/); assert.equal(f.counts().used, 1); assert.equal(f.counts().writes, 1);
});
test('StudyForge invalid source cannot reserve allowance or call a provider', async () => {
  for (const source of [undefined, 7, 'too short']) { const f = await fixture(); const result = await f.invoke(source === undefined ? null : source); assert.equal(result.status, 400); assert.deepEqual(f.counts(), { used: 0, providerCalls: 0, resolves: 0, writes: 0 }); }
});
test('StudyForge module viewers cannot create a legacy session', async () => {
  const f = await fixture(); assert.equal((await f.invoke('Local fixture material has enough words for a complete useful study card.', true)).status, 403); assert.equal(f.counts().writes, 0); assert.equal(f.counts().providerCalls, 0);
});
test('StudyForge Application Stack retains its existing 500 generation boundary', async () => {
  const allowed = await fixture({ applicationStack: true, used: 499 }); assert.equal((await allowed.invoke()).status, 201); assert.equal(allowed.counts().used, 500); assert.equal(allowed.counts().providerCalls, 1);
  const exhausted = await fixture({ applicationStack: true, used: 500 }); assert.equal((await exhausted.invoke()).status, 402); assert.equal(exhausted.counts().providerCalls, 0);
});
