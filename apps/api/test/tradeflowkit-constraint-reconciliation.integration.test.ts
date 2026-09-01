import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'pg';

function disposableDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  assert.equal(process.env.PARITY_DATABASE_IS_DISPOSABLE, '1');
  assert.ok(value, 'DATABASE_URL is required');

  const parsed = new URL(value);
  assert.ok(['127.0.0.1', '::1', 'localhost'].includes(parsed.hostname));
  assert.match(decodeURIComponent(parsed.pathname), /(?:test|phase21|ci|disposable)/iu);
  return value;
}

test('TradeFlowKit reconciliation restores the production dependency that blocked Replit publish', async () => {
  const connectionString = disposableDatabaseUrl();
  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query(`
      ALTER TABLE tradeflowkit_workflow_stages
        DROP CONSTRAINT tfk_workflow_stages_workflow_fk;
      ALTER TABLE tradeflowkit_workflows
        DROP CONSTRAINT uq_tfk_workflows_tenant_id;
    `);

    const { reconcileTradeFlowKitTenantConstraints } = await import(
      '../src/lib/tradeflowkit-constraint-reconciliation.js'
    );
    await reconcileTradeFlowKitTenantConstraints();

    const restored = await client.query<{ conname: string; definition: string }>(`
      SELECT conname, pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
       WHERE conname IN (
         'uq_tfk_workflows_tenant_id',
         'tfk_workflow_stages_workflow_fk'
       )
       ORDER BY conname
    `);

    assert.deepEqual(
      restored.rows.map((row) => row.conname),
      ['tfk_workflow_stages_workflow_fk', 'uq_tfk_workflows_tenant_id'],
    );
    assert.match(restored.rows[0].definition, /FOREIGN KEY \(tenant_id, workflow_id\)/);
    assert.match(restored.rows[1].definition, /UNIQUE \(tenant_id, id\)/);
  } finally {
    await client.end();
    const { closeDatabasePool } = await import('../src/db.js');
    await closeDatabasePool();
  }
});
