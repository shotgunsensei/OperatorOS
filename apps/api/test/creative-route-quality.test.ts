import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import * as captureIdentity from '../src/lib/snapproof-capture-identity.js';
import { guards, loadSource, matchingRows, queryOf, routeCollector, type Row } from './creative-route-quality-fixture.js';

const caseId = '10000000-0000-4000-8000-000000000001';
const kitId = '20000000-0000-4000-8000-000000000001';
const empty = async () => undefined;

async function kitFixture() {
  const kits: Row[] = [{ id: kitId, tenant_id: 'tenant-a', user_id: 'owner-a', deleted_at: null }];
  const cached = { kit: { id: kitId, title: 'Private campaign', content: { heroHeadline: 'Private generated material' } }, access: { plan: 'pro' } };
  let lookups = 0;
  const database = { async execute(query: any) { const compiled = queryOf(query); if (/SELECT id FROM modules/.test(compiled.sql)) return { rows: [{ id: 'deploy-module' }] }; assert.match(compiled.sql, /SELECT \* FROM launchkit_product_kits/); lookups++; return { rows: matchingRows(compiled, kits) }; } };
  const route = loadSource('routes/ninja-launch-kit-phase34-routes.ts', {
    '../db.js': { db: database }, '../lib/tenant-auth.js': guards,
    '../lib/ai-provider.js': { getAiProvider() { throw new Error('No provider allowed'); } },
    '../lib/shared-usage-activity.js': { beginIdempotentOperation: async () => ({ state: 'replay', responseStatus: 201, responseJson: cached }), appendActivityEvent: empty, recordUsageEvent: empty },
    '../lib/ninja-launch-kit-access.js': { resolveNinjaLaunchAccess: async () => ({ plan: 'pro', limits: {} }), consumeNinjaLaunchGeneration: empty, releaseNinjaLaunchGeneration: empty },
  });
  const collector = routeCollector(); await route.registerNinjaLaunchKitPhase34Routes(collector.app);
  const input = { title: 'Private campaign', generationMode: 'deterministic', idempotencyKey: 'replay-fixture-key', input: { businessName: 'Fixture company', businessType: 'Support', targetCustomer: 'Local businesses', offer: 'Service appointment', tone: 'professional', painPoint: 'Slow support', desiredAction: 'Request help' } };
  return { async replay(userId: string, tenantId = 'tenant-a') { return collector.invoke('post', '/v1/modules/ninja-launch-kit/product/kits', { body: input, user: { id: userId }, tenantContext: { tenantId, role: 'member', membershipRole: 'member' } }); }, lookups: () => lookups, kits };
}

test('Deploy Ops cached private kit cannot be replayed to a teammate', async () => {
  const fixture = await kitFixture(); const result = await fixture.replay('member-b');
  assert.equal(result.status, 404); assert.doesNotMatch(JSON.stringify(result.body), /Private generated material|Private campaign/); assert.equal(fixture.lookups(), 1);
});
test('Deploy Ops same-user replay preserves the original response', async () => {
  const fixture = await kitFixture(); const result = await fixture.replay('owner-a');
  assert.equal(result.status, 201); assert.equal(result.body.kit.id, kitId); assert.equal(result.body.replayed, true);
});
test('Deploy Ops cached private kit requires current tenant and nondeleted ownership', async () => {
  const fixture = await kitFixture(); assert.equal((await fixture.replay('owner-a', 'tenant-b')).status, 404);
  fixture.kits[0].deleted_at = '2026-10-27'; assert.equal((await fixture.replay('owner-a')).status, 404);
});

async function proofFixture(status: string) {
  const otherCaseId = '10000000-0000-4000-8000-000000000002';
  const cases = [caseId, otherCaseId].map(id => ({ id, tenant_id: 'tenant-a', status, deleted_at: null })); let attachments = 0;
  const evidence: Row[] = [], custody: Row[] = [], statements: string[] = [];
  function inserted(compiled: ReturnType<typeof queryOf>) {
    const columns = /INSERT INTO [a-z_]+\s*\(([^)]+)\)/i.exec(compiled.sql)![1].split(',').map(value => value.trim());
    const row: Row = { id: `fixture-${evidence.length}-${custody.length}` };
    for (const [index, column] of columns.entries()) {
      const value = compiled.params[index]; row[column] = /(?:_context|_metadata|^payload$)/.test(column) && typeof value === 'string' ? JSON.parse(value) : value;
    }
    return row;
  }
  const database: Row = { async transaction(task: (tx: Row) => unknown) { return task(database); }, async execute(query: any) {
    const compiled = queryOf(query); statements.push(compiled.sql);
    if (/FROM snapproof_cases c/i.test(compiled.sql) || /FROM snapproof_cases\b/i.test(compiled.sql)) return { rows: matchingRows(compiled, cases) };
    if (/SELECT id FROM modules/.test(compiled.sql)) return { rows: [{ id: 'snap-module' }] };
    if (/pg_advisory_xact_lock/.test(compiled.sql)) return { rows: [{}] };
    if (/SELECT \* FROM snapproof_evidence_items/.test(compiled.sql)) return { rows: matchingRows(compiled, evidence) };
    if (/FROM snapproof_custody_events/.test(compiled.sql)) return { rows: matchingRows(compiled, custody).sort((a,b) => b.sequence_number-a.sequence_number).slice(0,1) };
    if (/INSERT INTO snapproof_evidence_items/.test(compiled.sql)) { const row = inserted(compiled); evidence.push(row); return { rows: [row] }; }
    if (/INSERT INTO snapproof_custody_events/.test(compiled.sql)) { const row = inserted(compiled); custody.push(row); return { rows: [row] }; }
    throw new Error(`Unmodeled proof SQL: ${compiled.sql}`);
  } };
  const attachmentsBoundary = { createAttachment: async (input: Row) => { attachments++; return { id: 'attachment', scan_status: 'pending', sha256: createHash('sha256').update(input.content).digest('hex') }; } };
  const common = { '../db.js': { db: database }, '../lib/tenant-auth.js': guards, '../lib/snapproof-capture-identity.js': captureIdentity, '../lib/shared-customers.js': {}, '../lib/shared-attachments.js': attachmentsBoundary, '../lib/shared-usage-activity.js': { appendActivityEvent: empty, listActivityEvents: empty }, '../lib/snapproofos-exports.js': {}, '../lib/product-entitlements.js': {}, '../lib/snapproofos-import.js': {} };
  const canonical = loadSource('routes/snapproofos-routes.ts', common, ['appendCustody']);
  const route = loadSource('routes/snapproofos-phase32-routes.ts', { ...common, './snapproofos-routes.js': canonical });
  const collector = routeCollector(); await route.registerSnapProofOsPhase32Routes(collector.app);
  return { async upload(tenantId = 'tenant-a', overrides: Row = {}, requestedCaseId = caseId, userId = 'owner-a', access = 'user') { return collector.invoke('post', '/v1/modules/snapproofos/jobs/:id/files', { params: { id: requestedCaseId }, user: { id: userId }, tenantContext: { tenantId }, tenantModuleAccessLevel: access, body: { title: 'Fixture proof', evidenceType: 'document', originalName: 'proof.txt', declaredMimeType: 'text/plain', contentBase64: Buffer.from('Harmless local proof').toString('base64'), expectedCaptureIdentity: { userId, tenantId }, ...overrides } }); }, effects: () => ({ attachments, evidence: evidence.length }), custody, statements, otherCaseId, evidence };
}
for (const state of ['approved','archived','in_review']) test(`SnapProof file alias rejects ${state} proof before creating attachment or evidence`, async () => {
  const fixture = await proofFixture(state); const result = await fixture.upload(); assert.equal(result.status, 409); assert.deepEqual(fixture.effects(), { attachments: 0, evidence: 0 });
});
for (const state of ['draft','collecting','rejected']) test(`SnapProof file alias retains ${state} uploads`, async () => {
  const fixture = await proofFixture(state); const result = await fixture.upload(); assert.equal(result.status, 201); assert.deepEqual(fixture.effects(), { attachments: 1, evidence: 1 });
});
test('SnapProof file alias does not mutate a foreign tenant case', async () => {
  const fixture = await proofFixture('draft'); assert.equal((await fixture.upload('tenant-b')).status, 404); assert.deepEqual(fixture.effects(), { attachments: 0, evidence: 0 });
});

async function favoriteFixture() {
  let writes = 0;
  const route = loadSource('routes/ninjamation-phase36-routes.ts', {
    '@operatoros/sdk': {}, '../db.js': { db: { async execute(query: any) { const compiled = queryOf(query); if (/SELECT id FROM ninjamation_scripts/.test(compiled.sql)) return { rows: [{ id: 'script' }] }; writes++; return { rows: [{ id: 'favorite', created_at: '2026-10-27' }] }; } } },
    '../lib/tenant-auth.js': guards, '../lib/ninjamation-sync.js': {}, '../lib/ninjamation-access.js': {},
    '../lib/shared-provider-adapters.js': {}, '../lib/shared-usage-activity.js': {},
    '../lib/shared-background-jobs.js': { registerSharedJobHandler() {} }, '../lib/shared-schedules-exports.js': {}, '../lib/audit.js': {},
  });
  const collector = routeCollector(); await route.registerNinjamationPhase36Routes(collector.app);
  return { async favorite(method: string, role = 'member', access = 'user') { return collector.invoke(method, '/v1/modules/ninjamation/product/scripts/:id/favorite', { params: { id: 'script' }, tenantContext: { tenantId: 'tenant-a', membershipRole: role, viaPlatformRole: false }, tenantModuleAccessLevel: access }); }, writes: () => writes };
}
for (const method of ['post','delete']) test(`Script Ops ${method} favorite rejects module and tenant viewers without writes`, async () => {
  for (const [role, access] of [['member','viewer'],['viewer','manager']]) { const fixture = await favoriteFixture(); assert.equal((await fixture.favorite(method, role, access)).status, 403); assert.equal(fixture.writes(), 0); }
});
test('Script Ops contributors retain favorite and unfavorite', async () => {
  const fixture = await favoriteFixture(); assert.equal((await fixture.favorite('post')).status, 201); assert.equal((await fixture.favorite('delete')).status, 204); assert.equal(fixture.writes(), 2);
});


test('SnapProof capture records one canonical custody event; retry does not duplicate effects', async () => {
  const fixture = await proofFixture('draft'); const payload = { clientMutationId: 'capture-replay-fixture', capturedAt: '2026-10-20T12:00:00Z' };
  const first = await fixture.upload('tenant-a', payload); assert.equal(first.status, 201);
  const again = await fixture.upload('tenant-a', payload); assert.equal(again.status, 200); assert.equal(again.body.file.id, first.body.file.id);
  assert.deepEqual(fixture.effects(), { attachments: 1, evidence: 1 }); assert.equal(fixture.custody.length, 1); assert.equal(fixture.custody[0].event_type, 'evidence_captured');
  assert.match(fixture.custody[0].event_hash, /^[a-f0-9]{64}$/); assert.equal(fixture.custody[0].previous_hash, null);
  const lockIndex = fixture.statements.findIndex(sql => /SELECT status FROM snapproof_cases/.test(sql)); const mutationIndex = fixture.statements.findIndex(sql => /pg_advisory_xact_lock/.test(sql)); assert.ok(lockIndex >= 0 && lockIndex < mutationIndex);
});
for (const changed of ['case','bytes','title','filename','caption','capturedAt','context']) test(`SnapProof replay rejects changed ${changed} without new capture effects`, async () => {
  const fixture = await proofFixture('draft'); const payload = { clientMutationId: 'capture-intent-fixture', capturedAt: '2026-10-20T12:00:00Z' };
  assert.equal((await fixture.upload('tenant-a', payload)).status, 201);
  const overrides = changed === 'bytes' ? { contentBase64: Buffer.from('Changed harmless bytes').toString('base64') } : changed === 'title' ? { title: 'Changed capture title' } : changed === 'filename' ? { originalName: 'renamed-proof.txt' } : changed === 'caption' ? { caption: 'Changed caption' } : changed === 'capturedAt' ? { capturedAt: '2026-10-21T12:00:00Z' } : changed === 'context' ? { captureContext: { device: 'another-device' } } : {};
  const conflict = await fixture.upload('tenant-a', { ...payload, ...overrides }, changed === 'case' ? fixture.otherCaseId : caseId);
  assert.equal(conflict.status, 409); assert.equal(conflict.body.code, 'SNAPPROOF_CAPTURE_IDEMPOTENCY_CONFLICT'); assert.deepEqual(fixture.effects(), { attachments: 1, evidence: 1 });
});


test('SnapProof legacy captures retain bound same-intent replay and reject case or byte drift', async () => {
  const fixture = await proofFixture('draft'); const payload = { clientMutationId: 'legacy-capture-fixture', capturedAt: '2026-10-20T12:00:00Z' };
  assert.equal((await fixture.upload('tenant-a', payload)).status, 201);
  delete fixture.evidence[0].privacy_metadata.clientMutationIntentSha256;
  assert.equal((await fixture.upload('tenant-a', payload)).status, 200);
  assert.equal((await fixture.upload('tenant-a', payload, fixture.otherCaseId)).status, 409);
  assert.equal((await fixture.upload('tenant-a', { ...payload, contentBase64: Buffer.from('Changed legacy bytes').toString('base64') })).status, 409);
  assert.deepEqual(fixture.effects(), { attachments: 1, evidence: 1 }); assert.equal(fixture.custody.length, 1);
});
test('SnapProof retry without a supplied timestamp remains stable and cannot revive deleted proof', async () => {
  const fixture = await proofFixture('draft'); const payload = { clientMutationId: 'default-time-fixture' };
  assert.equal((await fixture.upload('tenant-a', payload)).status, 201); assert.equal((await fixture.upload('tenant-a', payload)).status, 200);
  fixture.evidence[0].deleted_at = '2026-10-27'; assert.equal((await fixture.upload('tenant-a', payload)).status, 409);
  assert.deepEqual(fixture.effects(), { attachments: 1, evidence: 1 }); assert.equal(fixture.custody.length, 1);
});

for (const [label, identity, status] of [
  ['different user', { userId: 'other', tenantId: 'tenant-a' }, 409],
  ['different tenant', { userId: 'owner-a', tenantId: 'other' }, 409],
  ['undefined binding', undefined, 400],
  ['null binding', null, 400],
  ['extra authority field', { userId: 'owner-a', tenantId: 'tenant-a', role: 'admin' }, 400],
] as const) test(`SnapProof ${label} is rejected before bytes, lookup or persistence`, async () => {
  const fixture = await proofFixture('draft');
  const result = await fixture.upload('tenant-a', { expectedCaptureIdentity: identity, contentBase64: 'invalid bytes' });
  assert.equal(result.status, status);
  assert.equal(result.body.code, status === 409 ? 'SNAPPROOF_CAPTURE_IDENTITY_CHANGED' : 'SNAPPROOF_CAPTURE_IDENTITY_REQUIRED');
  assert.deepEqual(fixture.statements, []);
  assert.deepEqual(fixture.effects(), { attachments: 0, evidence: 0 });
  assert.deepEqual(fixture.custody, []);
  assert.doesNotMatch(JSON.stringify(result.body), /owner-a|tenant-a|other/);
});

test('SnapProof changed POST actor cannot use a matching-payload cached replay', async () => {
  const fixture = await proofFixture('draft');
  const payload = { clientMutationId: 'identity-replay-key', expectedCaptureIdentity: { userId: 'owner-a', tenantId: 'tenant-a' } };
  assert.equal((await fixture.upload('tenant-a', payload)).status, 201);
  const before = fixture.statements.length;
  const changed = await fixture.upload('tenant-a', payload, caseId, 'owner-b');
  assert.equal(changed.status, 409);
  assert.equal(changed.body.code, 'SNAPPROOF_CAPTURE_IDENTITY_CHANGED');
  assert.equal(fixture.statements.length, before);
  assert.deepEqual(fixture.effects(), { attachments: 1, evidence: 1 });
  assert.equal(fixture.custody.length, 1);
  assert.equal((await fixture.upload('tenant-a', payload)).status, 200);
});

test('SnapProof replay also rejects an existing record owned by another actor', async () => {
  const fixture = await proofFixture('draft');
  const payload = { clientMutationId: 'identity-replay-owner' };
  assert.equal((await fixture.upload('tenant-a', payload)).status, 201);
  const result = await fixture.upload('tenant-a', payload, caseId, 'owner-b');
  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'SNAPPROOF_CAPTURE_IDEMPOTENCY_CONFLICT');
  assert.deepEqual(fixture.effects(), { attachments: 1, evidence: 1 });
  assert.equal(fixture.custody.length, 1);
});

for (const access of ['viewer', 'none']) test(`matching capture identity cannot bypass ${access} write access`, async () => {
  const fixture = await proofFixture('draft');
  assert.equal((await fixture.upload('tenant-a', {}, caseId, 'owner-a', access)).status, 403);
  assert.deepEqual(fixture.statements, []);
  assert.deepEqual(fixture.effects(), { attachments: 0, evidence: 0 });
});
