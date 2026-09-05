import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COMPANION_MODULES,
  CORE_PRODUCTS,
  FREE_WITH_ANY_ACCOUNT,
  getModuleProductValue,
  MODULE_CATALOG,
  MODULE_PRODUCT_VALUE_BY_SLUG,
  MODULE_PRODUCT_VALUE_SLUGS,
  MODULE_PRODUCT_VALUES,
} from '@operatoros/sdk';

const EXPECTED_SLUGS = [
  'tradeflowkit',
  'pulsedesk',
  'techdeck',
  'torqueshed',
  'faultlinelab',
  'ninja-pool-hall',
  'brandforgeos',
  'snapproofos',
  'studyforge-ai',
  'ninja-launch-kit',
  'callcommand-ai',
  'ninjamation',
  'outcall',
] as const;

test('customer product-value contracts cover the exact canonical module roster', () => {
  assert.deepEqual(MODULE_PRODUCT_VALUE_SLUGS, EXPECTED_SLUGS);
  assert.deepEqual(
    Object.keys(MODULE_PRODUCT_VALUE_BY_SLUG).sort(),
    [...EXPECTED_SLUGS].sort(),
  );
  assert.deepEqual(
    MODULE_PRODUCT_VALUES.map(contract => contract.slug),
    EXPECTED_SLUGS,
  );
  assert.deepEqual(
    MODULE_CATALOG.map(module => module.slug),
    EXPECTED_SLUGS,
  );
  assert.equal(getModuleProductValue('not-a-module'), undefined);
});

test('every value contract provides a useful result, deliverables, workflow, and honest setup boundary', () => {
  const engineeringCopy = /\b(?:tenant-scoped|authoritative|bounded|provider truth|provenance|compiler-published|integrity metadata)\b/i;

  for (const contract of MODULE_PRODUCT_VALUES) {
    assert.equal(contract.slug, getModuleProductValue(contract.slug)?.slug);
    assert.ok(contract.promise.trim().length >= 40, `${contract.slug} needs a concrete promise`);
    assert.ok(contract.buyer.trim().length >= 12, `${contract.slug} needs a buyer`);
    assert.ok(contract.firstUsefulResult.trim().length >= 40, `${contract.slug} needs a first useful result`);
    assert.ok(contract.deliverables.length >= 3, `${contract.slug} needs concrete deliverables`);
    assert.ok(contract.deliverables.every(item => item.trim().length >= 12));
    assert.ok(contract.primaryWorkflow.name.trim().length >= 8);
    assert.ok(contract.primaryWorkflow.steps.length >= 4, `${contract.slug} needs an end-to-end workflow`);
    assert.ok(contract.primaryWorkflow.completion.trim().length >= 40);
    assert.ok(contract.integrations.supported.length >= 1);
    assert.ok(contract.integrations.setupBoundary.trim().length >= 50);

    for (const customerFacing of [contract.promise, contract.buyer, contract.firstUsefulResult]) {
      assert.doesNotMatch(customerFacing, engineeringCopy, `${contract.slug} leaks implementation language`);
    }
  }
});

test('catalog and pricing-card descriptions inherit the canonical promises', () => {
  for (const module of MODULE_CATALOG) {
    assert.equal(module.description, MODULE_PRODUCT_VALUE_BY_SLUG[module.slug as keyof typeof MODULE_PRODUCT_VALUE_BY_SLUG].promise);
  }

  for (const product of [...CORE_PRODUCTS, ...FREE_WITH_ANY_ACCOUNT, ...COMPANION_MODULES]) {
    assert.equal(product.description, MODULE_PRODUCT_VALUE_BY_SLUG[product.key].promise);
  }
});

test('Pool Hall remains a free benefit and OutCall remains unavailable for sale or launch', () => {
  const pool = MODULE_PRODUCT_VALUE_BY_SLUG['ninja-pool-hall'];
  const poolCatalog = MODULE_CATALOG.find(module => module.slug === pool.slug);
  assert.equal(poolCatalog?.commercialType, 'free');
  assert.equal(poolCatalog?.defaultStatus, 'live');
  assert.match(`${pool.promise} ${pool.integrations.setupBoundary}`, /free/i);
  assert.match(pool.integrations.setupBoundary, /does not provide wagering, paid competition, prizes/i);

  const outcall = MODULE_PRODUCT_VALUE_BY_SLUG.outcall;
  const outcallCatalog = MODULE_CATALOG.find(module => module.slug === outcall.slug);
  assert.equal(outcallCatalog?.commercialType, 'addon');
  assert.equal(outcallCatalog?.defaultStatus, 'coming_soon');
  assert.match(outcall.integrations.setupBoundary, /coming soon/i);
  assert.match(outcall.integrations.setupBoundary, /must not be sold or launched/i);
  assert.match(outcall.integrations.setupBoundary, /not emergency response/i);
});

test('marketing cards project value from the shared SDK instead of local copy maps', () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const source = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/lib/marketing-catalog.ts'),
    'utf8',
  );

  assert.match(source, /getModuleProductValue/);
  assert.match(source, /outcome:\s*productValue\.promise/);
  assert.match(source, /audience:\s*productValue\.buyer/);
  assert.match(source, /solves:\s*productValue\.firstUsefulResult/);
  assert.doesNotMatch(source, /const\s+(?:OUTCOMES|AUDIENCES|SOLVES)\s*:/);
});

test('signed-in application cards project the same customer promise even when legacy database copy remains', () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const source = fs.readFileSync(
    path.join(repoRoot, 'apps/api/src/lib/entitlement-service.ts'),
    'utf8',
  );

  assert.match(source, /getModuleProductValue\(m\.slug\)\?\.promise \?\? m\.description/g);
});
