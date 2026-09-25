import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { db, closeDatabasePool } from '../src/db.js';
import { createTestUser, cleanupUser, ensureSchemaReady } from './_setup.js';
import { ensureTechDeckResolutionTables, verifyTechDeckResolutionTables } from '../src/lib/techdeck-resolution-db-init.js';
import { resolutionStorageTables } from '../src/generated/techdeck-resolution-storage.js';

const raw = readFileSync(new URL('./fixtures/techdeck-resolution-cam-wal-v1.json', import.meta.url), 'utf8');
const checksum = createHash('sha256').update(raw).digest('hex');
type Executor = Pick<typeof db, 'execute'>;
type Context = { tenant_id: string; incident_id: string; revision: number };
let ownerA: Awaited<ReturnType<typeof createTestUser>>;
let ownerB: Awaited<ReturnType<typeof createTestUser>>;
let a: Context;
let b: Context;
const tableNames = new Set(resolutionStorageTables.map(t => t.name as string));

async function insert(name: string, values: Record<string, unknown>, executor: Executor = db): Promise<string> {
  const table = `techdeck_resolution_${name}`;
  assert.ok(tableNames.has(table));
  for (const key of Object.keys(values)) assert.match(key, /^[a-z][a-z0-9_]*$/);
  const result = await executor.execute(sql`INSERT INTO ${sql.raw(table)}
    (${sql.join(Object.keys(values).map(key => sql.raw(key)), sql`,`)})
    VALUES (${sql.join(Object.values(values).map(value => sql`${value}`), sql`,`)}) RETURNING id`);
  return String(result.rows[0].id);
}
async function incident(tenantId: string, actorId: string, body = raw): Promise<Context> {
  return db.transaction(async tx => {
    const incidentId = await insert('incidents', { tenant_id: tenantId, title: 'Synthetic CAM evidence', created_by_user_id: actorId }, tx);
    await insert('raw_exports', {
      tenant_id: tenantId, incident_id: incidentId, revision: 1, schema_version: '1.0', source_type: 'fixture',
      raw_text: body, raw_sha256: createHash('sha256').update(body).digest('hex'),
      fingerprint: createHash('sha256').update(body).digest('hex'), normalizer_version: 'test-v1',
      redactor_version: 'synthetic-fixture-v1', security_screened: true, created_by_user_id: actorId,
    }, tx);
    await tx.execute(sql`UPDATE techdeck_resolution_incidents SET active_revision=1 WHERE tenant_id=${tenantId} AND id=${incidentId}`);
    return { tenant_id: tenantId, incident_id: incidentId, revision: 1 };
  });
}
function errorCode(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: unknown };
  return e?.code ?? (e?.cause ? errorCode(e.cause) : undefined);
}
async function rejectsCode(run: () => Promise<unknown>, code: string) {
  await assert.rejects(run, error => errorCode(error) === code);
}
async function child(name: string, context: Context, fields: Record<string, unknown>, executor: Executor = db) {
  return insert(name, { ...context, source_pointer: '/test', ...fields }, executor);
}

before(async () => {
  const url = new URL(process.env.DATABASE_URL ?? 'invalid:');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Resolution tests require a loopback disposable database');
  assert.match(url.pathname, /(?:test|disposable|phase21|ci)/i);
  assert.equal(process.env.PARITY_DATABASE_IS_DISPOSABLE, '1');
  assert.equal(process.env.APP_ENV, 'test');
  await ensureSchemaReady();
  ownerA = await createTestUser(); ownerB = await createTestUser();
  a = await incident(ownerA.currentTenantId!, ownerA.id);
  b = await incident(ownerB.currentTenantId!, ownerB.id);
});

after(async () => {
  for (const owner of [ownerA, ownerB]) if (owner) {
    await db.execute(sql`DELETE FROM techdeck_resolution_incidents WHERE tenant_id=${owner.currentTenantId}`);
    await cleanupUser(owner.id);
  }
  await closeDatabasePool();
});

test('additive resolution migration reapplies without changing existing raw evidence', async () => {
  await ensureTechDeckResolutionTables(); await ensureTechDeckResolutionTables();
  await verifyTechDeckResolutionTables();
  const stored = await db.execute(sql`SELECT raw_text,raw_sha256 FROM techdeck_resolution_raw_exports WHERE tenant_id=${a.tenant_id} AND incident_id=${a.incident_id}`);
  assert.equal(stored.rows[0].raw_text, raw);
  assert.equal(stored.rows[0].raw_sha256, checksum);
});

test('same-tenant duplicates fail atomically while another tenant can retain the same evidence', async () => {
  await rejectsCode(() => incident(a.tenant_id, ownerA.id), '23505');
  const count = await db.execute(sql`SELECT count(*)::int AS count FROM techdeck_resolution_incidents WHERE tenant_id=${a.tenant_id}`);
  assert.equal(count.rows[0].count, 1, 'failed duplicate transaction must not orphan an incident');
  const other = await db.execute(sql`SELECT raw_sha256 FROM techdeck_resolution_raw_exports WHERE tenant_id=${b.tenant_id}`);
  assert.equal(other.rows[0].raw_sha256, checksum);
});

test('tenant and revision foreign keys reject forged children, actions, graph endpoints and assets', async () => {
  await rejectsCode(() => child('symptoms', { ...a, tenant_id: b.tenant_id }, { kind: 'observed', description: 'foreign incident' }), '23503');
  await rejectsCode(() => child('symptoms', { ...a, revision: 99 }, { kind: 'observed', description: 'missing revision' }), '23503');
  const foreignAction = await child('actions', b, { kind: 'recovery', action: 'foreign action' });
  await rejectsCode(() => child('side_effects', a, { effect: 'cross tenant', recovery_action_id: foreignAction }), '23503');
  const asset = await db.execute(sql`INSERT INTO techdeck_assets(tenant_id,name,type) VALUES (${b.tenant_id},'Synthetic foreign device','workstation') RETURNING id`);
  try {
    await rejectsCode(() => child('incident_assets', a, { asset_id: asset.rows[0].id }), '23503');
  } finally { await db.execute(sql`DELETE FROM techdeck_assets WHERE tenant_id=${b.tenant_id} AND id=${asset.rows[0].id}`); }
  const source = await child('nodes', a, { kind: 'incident', source_pointer: '/incident' });
  const foreign = await child('nodes', b, { kind: 'incident', source_pointer: '/incident' });
  await rejectsCode(() => child('relationships', a, { source_node_id: source, target_node_id: foreign, source_kind: 'incident', target_kind: 'incident', relationship_type: 'SIMILAR_TO' }), '23503');
});

test('raw source cannot be rewritten, falsely checksummed or accepted without screening', async () => {
  await rejectsCode(() => db.execute(sql`UPDATE techdeck_resolution_raw_exports SET raw_text=raw_text||' ' WHERE tenant_id=${a.tenant_id}`), '23514');
  for (const changes of [{ raw_sha256: '0'.repeat(64) }, { security_screened: false }, { raw_text: '{}' }]) {
    await rejectsCode(() => insert('raw_exports', {
      ...a, revision: 2, schema_version: '1.0', source_type: 'fixture', raw_text: raw, raw_sha256: checksum,
      fingerprint: '1'.repeat(64), normalizer_version: 'test-v2', redactor_version: 'test', security_screened: true, ...changes,
    }), '23514');
  }
});

test('failed actions and temporal side effects retain recovery without fabricating causal certainty', async () => {
  const failed = await child('actions', a, { kind: 'failed', action: 'Rename live WAL', outcome: 'FAILURE', actual_result: 'File remained in use', risk_level: 'HIGH' });
  const disable = await child('actions', a, { kind: 'corrective', action: 'Temporarily disable camsvc', outcome: 'PARTIAL' });
  const recovery = await child('actions', a, { kind: 'recovery', action: 'Restore automatic/running and reboot', outcome: 'SUCCESS' });
  const side = await child('side_effects', a, { effect: 'Wi-Fi discovery unavailable after reboot', triggering_action_id: disable, recovery_action_id: recovery, recovered: true });
  const actionNode = await child('nodes', a, { kind: 'action', action_id: disable, source_pointer: '/actions/disable' });
  const sideNode = await child('nodes', a, { kind: 'side_effect', side_effect_id: side, source_pointer: '/side_effects/0' });
  const edge = { source_node_id: actionNode, target_node_id: sideNode, source_kind: 'action', target_kind: 'side_effect' };
  await child('relationships', a, { ...edge, relationship_type: 'FOLLOWED_BY' });
  await rejectsCode(() => child('relationships', a, { ...edge, relationship_type: 'CAUSED_SIDE_EFFECT' }), '23514');
  await rejectsCode(() => child('relationships', a, { ...edge, relationship_type: 'RESOLVED' }), '23514');
  const effect = await db.execute(sql`SELECT causal_status,recovery_action_id FROM techdeck_resolution_side_effects WHERE tenant_id=${a.tenant_id} AND id=${side}`);
  assert.equal(effect.rows[0].causal_status, 'temporal_association');
  assert.equal(effect.rows[0].recovery_action_id, recovery);
  assert.ok(failed);
});

test('typed graph nodes cannot point to missing, wrong-type, or multiple targets', async () => {
  await rejectsCode(() => child('nodes', a, { kind: 'action', source_pointer: '/bad' }), '23514');
  await rejectsCode(() => child('nodes', a, { kind: 'arbitrary', source_pointer: '/bad' }), '23514');
  await rejectsCode(() => child('nodes', a, { kind: 'action', action_id: '00000000-0000-0000-0000-000000000001', source_pointer: '/bad' }), '23503');
  await rejectsCode(() => child('automation_opportunities', a, { execution_enabled: true }), '23514');
  await rejectsCode(() => child('identifiers', a, { kind: 'port', original_value: '70000', normalized_value: '70000', numeric_value: 70000 }), '23514');
});

test('exact identifiers and PostgreSQL full-text projections remain scoped to the selected tenant', async () => {
  await child('identifiers', a, { kind: 'error_code', original_value: '0x800f0915', normalized_value: '0x800f0915' });
  await child('identifiers', b, { kind: 'error_code', original_value: '0x800f0915', normalized_value: '0x800f0915' });
  await child('search_documents', a, { section: 'warnings', title: 'CAM WAL', search_text: 'Windows disk keeps filling. Wi-Fi loss followed camsvc disablement.', redactor_version: 'synthetic', content_sha256: checksum });
  const exact = await db.execute(sql`SELECT incident_id FROM techdeck_resolution_identifiers WHERE tenant_id=${a.tenant_id} AND kind='error_code' AND normalized_value='0x800f0915'`);
  assert.deepEqual(exact.rows.map(row => row.incident_id), [a.incident_id]);
  const text = await db.execute(sql`SELECT incident_id FROM techdeck_resolution_search_documents WHERE tenant_id=${a.tenant_id} AND search_vector @@ plainto_tsquery('english','disk filling')`);
  assert.deepEqual(text.rows.map(row => row.incident_id), [a.incident_id]);
});

test('catalog verifier detects missing constraints and indexes without mutating or applying schema', async () => {
  for (const ddl of [
    'ALTER TABLE techdeck_resolution_actions DROP CONSTRAINT tdri_actions_outcome_ck',
    'DROP INDEX tdri_search_documents_fts_idx',
  ]) {
    await assert.rejects(db.transaction(async tx => {
      await tx.execute(sql.raw(ddl));
      await assert.rejects(() => verifyTechDeckResolutionTables(tx), /Resolution storage verification failed/);
      throw new Error('rollback catalog probe');
    }), /rollback catalog probe/);
  }
  await verifyTechDeckResolutionTables();
});

test('an invalid normalized write rolls back the entire source revision transaction', async () => {
  const beforeCount = await db.execute(sql`SELECT count(*)::int AS count FROM techdeck_resolution_raw_exports WHERE tenant_id=${a.tenant_id}`);
  await rejectsCode(() => db.transaction(async tx => {
    await insert('raw_exports', { ...a, revision: 2, schema_version: '1.0', source_type: 'fixture', raw_text: raw, raw_sha256: checksum, fingerprint: checksum, normalizer_version: 'test-v2', redactor_version: 'synthetic', security_screened: true }, tx);
    await child('actions', { ...a, revision: 2 }, { kind: 'failed', action: 'untrusted', outcome: 'MADE_UP' }, tx);
  }), '23514');
  const afterCount = await db.execute(sql`SELECT count(*)::int AS count FROM techdeck_resolution_raw_exports WHERE tenant_id=${a.tenant_id}`);
  assert.deepEqual(afterCount.rows, beforeCount.rows);
});
