import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { getTableName, sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { db, closeDatabasePool } from '../src/db.js';
import { ensureSchemaReady } from './_setup.js';
import {
  tradeflowkitCustomers, tradeflowkitWorkflows, tradeflowkitWorkflowStages,
  tradeflowkitJobs, tradeflowkitTasks, tradeflowkitTaskDependencies,
  tradeflowkitQuotes, tradeflowkitQuoteItems, tradeflowkitInvoices,
  tradeflowkitInvoiceItems, tradeflowkitPayments, tradeflowkitTags, tradeflowkitTagAssignments,
} from '../src/schema.js';

before(ensureSchemaReady);
after(closeDatabasePool);

test('TradeFlowKit declarative tenant keys agree with the applied database contract', async () => {
  const tables = [tradeflowkitCustomers, tradeflowkitWorkflows, tradeflowkitWorkflowStages,
    tradeflowkitJobs, tradeflowkitTasks, tradeflowkitTaskDependencies, tradeflowkitQuotes,
    tradeflowkitQuoteItems, tradeflowkitInvoices, tradeflowkitInvoiceItems,
    tradeflowkitPayments, tradeflowkitTags, tradeflowkitTagAssignments];
  const result = await db.execute(sql`
    SELECT c.conname,c.contype,c.convalidated,t.relname AS table_name,ft.relname AS foreign_table,
      c.confdeltype,
      ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(attnum,ord)
        JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum ORDER BY k.ord) AS columns,
      ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(attnum,ord)
        JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.attnum ORDER BY k.ord) AS foreign_columns
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
    LEFT JOIN pg_class ft ON ft.oid=c.confrelid
    WHERE c.connamespace='public'::regnamespace AND t.relname LIKE 'tradeflowkit_%'
  `);
  let verified = 0;
  const deleteTypes: Record<string, string> = { cascade: 'c', restrict: 'r', 'no action': 'a' };
  for (const table of tables) {
    const config = getTableConfig(table);
    for (const key of config.uniqueConstraints) {
      const actual = result.rows.find(r => r.conname === key.name && r.table_name === config.name);
      assert.ok(actual, key.name);
      assert.equal(actual.contype, 'u');
      assert.deepEqual(actual.columns, key.columns.map(c => c.name));
      verified++;
    }
    for (const key of config.foreignKeys.filter(k => k.getName().startsWith('tfk_'))) {
      const actual = result.rows.find(r => r.conname === key.getName() && r.table_name === config.name);
      assert.ok(actual, key.getName());
      const ref = key.reference();
      assert.equal(actual.contype, 'f');
      assert.equal(actual.convalidated, true);
      assert.deepEqual(actual.columns, ref.columns.map(c => c.name));
      assert.equal(actual.foreign_table, getTableName(ref.foreignTable));
      assert.deepEqual(actual.foreign_columns, ref.foreignColumns.map(c => c.name));
      assert.equal(actual.confdeltype, deleteTypes[key.onDelete ?? 'no action']);
      verified++;
    }
  }
  assert.equal(verified, 21, 'four unique keys and seventeen tenant-composite foreign keys');
  for (const table of [tradeflowkitCustomers, tradeflowkitJobs, tradeflowkitQuotes, tradeflowkitInvoices]) {
    const config = getTableConfig(table);
    const key = config.indexes.find(i => i.config.name?.endsWith('_tenant_id'))!;
    assert.ok(key?.config.unique);
    const actual = await db.execute(sql`SELECT i.indisunique,i.indisvalid,pg_get_indexdef(i.indexrelid) AS definition
      FROM pg_index i WHERE i.indexrelid=to_regclass(${`public.${key.config.name}`})`);
    assert.equal(actual.rows[0]?.indisunique, true);
    assert.equal(actual.rows[0]?.indisvalid, true);
    assert.match(String(actual.rows[0]?.definition), /\(tenant_id, id\)/);
  }
});
