import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CORE_PRODUCTS,
  FREE_WITH_ANY_ACCOUNT,
  MODULE_CATALOG,
  isAddonModuleSlug,
} from '@operatoros/sdk';
import {
  AddonNotPurchasableError,
  assertAddonPurchasableOrThrow,
  isCommercialAddonModule,
} from '../src/lib/billing-service.js';

const EXPECTED = {
  core: ['pulsedesk', 'techdeck', 'tradeflowkit'],
  free: ['faultlinelab', 'ninja-pool-hall', 'torqueshed'],
  addon: [
    'brandforgeos',
    'callcommand-ai',
    'ninja-launch-kit',
    'ninjamation',
    'outcall',
    'snapproofos',
    'studyforge-ai',
  ],
} as const;

test('module catalog carries the exact core, free, and add-on roster', () => {
  for (const commercialType of ['core', 'free', 'addon'] as const) {
    assert.deepEqual(
      MODULE_CATALOG
        .filter(module => module.commercialType === commercialType)
        .map(module => module.slug)
        .sort(),
      [...EXPECTED[commercialType]].sort(),
    );
  }

  assert.deepEqual(
    CORE_PRODUCTS.map(product => product.key).sort(),
    [...EXPECTED.core].sort(),
  );
  assert.deepEqual(
    FREE_WITH_ANY_ACCOUNT.map(module => module.key).sort(),
    [...EXPECTED.free].sort(),
  );
});

test('only commercial add-ons declare add-on Stripe environment keys', () => {
  for (const module of MODULE_CATALOG) {
    if (module.commercialType === 'addon') {
      assert.ok(module.stripeAddonEnvKeys.length > 0, `${module.slug} must declare an add-on price key`);
      assert.equal(isAddonModuleSlug(module.slug), true);
    } else {
      assert.deepEqual(module.stripeAddonEnvKeys, [], `${module.slug} must not declare add-on pricing`);
      assert.equal(isAddonModuleSlug(module.slug), false);
    }
  }

  const outcall = MODULE_CATALOG.find(module => module.slug === 'outcall');
  assert.equal(outcall?.commercialType, 'addon');
  assert.equal(outcall?.defaultStatus, 'live');
});

test('billing service rejects canonical core/free modules as individual add-ons', () => {
  for (const slug of [...EXPECTED.core, ...EXPECTED.free]) {
    const module = { slug, status: 'live', metadata: { commercialType: 'addon' } };
    assert.equal(isCommercialAddonModule(module), false, `${slug} catalog classification must win`);
    assert.throws(
      () => assertAddonPurchasableOrThrow(module),
      (error: unknown) => error instanceof AddonNotPurchasableError
        && error.code === 'ADDON_NOT_PURCHASABLE',
    );
  }
});

test('admin-created modules require an explicit add-on classification', () => {
  assert.equal(isCommercialAddonModule({ slug: 'custom-module', metadata: {} }), false);
  assert.equal(
    isCommercialAddonModule({ slug: 'custom-module', metadata: { commercialType: 'addon' } }),
    true,
  );
});

test('admin readiness checks only active catalog add-ons', () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const platformRoutes = fs.readFileSync(
    path.join(repoRoot, 'apps/api/src/routes/platform-routes.ts'),
    'utf8',
  );
  assert.match(platformRoutes, /module\.commercialType === 'addon'/);
  assert.match(platformRoutes, /module\.defaultStatus !== 'coming_soon'/);
  assert.match(platformRoutes, /readinessAddons\.map/);
});
