import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const productService = fs.readFileSync(
  path.join(root, 'apps/api/src/lib/product-entitlements.ts'),
  'utf8',
);
const billingService = fs.readFileSync(
  path.join(root, 'apps/api/src/lib/billing-service.ts'),
  'utf8',
);
const dbInit = fs.readFileSync(
  path.join(root, 'apps/api/src/lib/saas-db-init.ts'),
  'utf8',
);

test('any core checkout grants every included app and the selected companion', () => {
  assert.match(productService, /INCLUDED_WITH_ANY_PAID_CORE\.map/);
  assert.match(productService, /source:\s*'included_with_core'/);
  assert.match(productService, /source:\s*'selected_free_companion'/);
  assert.match(productService, /entitlementType:\s*'core_product'/);
});

test('database enforces one free companion per active core subscription', () => {
  assert.match(dbInit, /uniq_free_companion_per_core_subscription/);
  assert.match(dbInit, /source = 'selected_free_companion'/);
  assert.match(dbInit, /WHERE active = true/);
});

test('Stripe checkout and webhook carry the finalized stack metadata', () => {
  for (const key of [
    'tenant_id',
    'selected_core_product',
    'selected_free_companion_module',
    'additional_module_keys',
    'additional_seats',
    'user_id',
  ]) {
    assert.ok(billingService.includes(key), `missing Stripe metadata: ${key}`);
  }
  assert.match(billingService, /grantStackEntitlements/);
  assert.match(billingService, /core_product_stack_activated/);
});

test('module access checks tenant entitlement and seat capacity', () => {
  const tenantEntitlements = fs.readFileSync(
    path.join(root, 'apps/api/src/lib/tenant-entitlements.ts'),
    'utf8',
  );
  const entitlementService = fs.readFileSync(
    path.join(root, 'apps/api/src/lib/entitlement-service.ts'),
    'utf8',
  );
  assert.match(tenantEntitlements, /tenantHasActiveEntitlement/);
  assert.match(tenantEntitlements, /isUserWithinTenantSeatLimit/);
  assert.match(tenantEntitlements, /seat_limit_exceeded/);
  assert.match(entitlementService, /resolveTenantModuleAccess/);
});
