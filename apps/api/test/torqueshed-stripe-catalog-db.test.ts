import test from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { ensureTorqueShedStripeCatalogTables } from '../src/lib/torqueshed-stripe-catalog-db-init.js';
import {
  TORQUESHED_CREDIT_CATALOG,
  TORQUESHED_CREDIT_CATALOG_VERSION,
  getValidatedTorqueShedPrice,
  persistTorqueShedCatalogMapping,
  torqueShedCatalogReadiness,
} from '../src/lib/torqueshed-credit-catalog.js';

test('validated environment-specific mappings resolve and stale mapping disables readiness', async () => {
  assert.equal(process.env.APP_ENV, 'test');
  assert.equal(process.env.PARITY_DATABASE_IS_DISPOSABLE, '1');
  await ensureTorqueShedStripeCatalogTables();
  await db.execute(sql`DELETE FROM torqueshed_stripe_credit_catalog WHERE stripe_account_id='acct_catalog_db_test'`);
  for (const item of TORQUESHED_CREDIT_CATALOG) {
    await persistTorqueShedCatalogMapping({
      environment: 'test', packageKey: item.key, catalogVersion: TORQUESHED_CREDIT_CATALOG_VERSION,
      lookupKey: item.lookupKey, units: item.units, amountMinor: item.amountMinor, currency: item.currency,
      stripeAccountId: 'acct_catalog_db_test',
      stripeProductId: `catalog_product_${item.key}`, stripePriceId: `catalog_price_${item.key}`,
      active: true, validationStatus: 'validated', driftCode: null, validatedAt: new Date(),
    });
  }
  assert.equal((await torqueShedCatalogReadiness('test')).state, 'validated');
  const roadside = await getValidatedTorqueShedPrice({ environment: 'test', packageKey: 'roadside-25000' });
  assert.equal(roadside.stripePriceId, 'catalog_price_roadside-25000');
  await db.execute(sql`
    UPDATE torqueshed_stripe_credit_catalog SET active=FALSE,validation_status='stale',drift_code='PRICE_INACTIVE'
    WHERE stripe_account_id='acct_catalog_db_test' AND package_key='roadside-25000'
  `);
  assert.equal((await torqueShedCatalogReadiness('test')).state, 'stale');
  await assert.rejects(
    getValidatedTorqueShedPrice({ environment: 'test', packageKey: 'roadside-25000' }),
    (error: any) => error.code === 'TORQUE_CATALOG_UNAVAILABLE',
  );
  await db.execute(sql`DELETE FROM torqueshed_stripe_credit_catalog WHERE stripe_account_id='acct_catalog_db_test'`);
});
