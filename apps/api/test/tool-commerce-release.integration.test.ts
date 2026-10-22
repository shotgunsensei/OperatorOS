import { test } from 'node:test';
import assert from 'node:assert/strict';
import { databasePool } from '../src/db.js';
import { applyOperatorOSDatabaseRelease, verifyOperatorOSDatabaseRelease, DATABASE_RELEASE_CONTRACT } from '../src/lib/database-release.js';

test('review-only release68 applies and verifies twice on an exclusively disposable clean database', async () => {
  const { rows } = await databasePool.query<{ database: string; tables: number }>(`SELECT current_database() AS database,
    (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public') AS tables`);
  assert.equal(rows[0]?.database, 'operatoros_tool_release_test');
  assert.equal(rows[0]?.tables, 0, 'Release proof must start clean and cannot share feature-test fixtures');
  assert.equal(DATABASE_RELEASE_CONTRACT.releaseVersion, 68);
  await applyOperatorOSDatabaseRelease(); await verifyOperatorOSDatabaseRelease();
  await applyOperatorOSDatabaseRelease(); await verifyOperatorOSDatabaseRelease();
  const data = await databasePool.query(`SELECT (SELECT count(*)::int FROM tool_purchases) orders,
    (SELECT count(*)::int FROM tool_purchase_events) events,(SELECT count(*)::int FROM tool_fulfillment_outbox) deliveries`);
  assert.deepEqual(data.rows[0], { orders: 0, events: 0, deliveries: 0 });
});
