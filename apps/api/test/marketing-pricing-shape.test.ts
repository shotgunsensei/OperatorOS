import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  calculateStackMonthlyPrice,
  COMPANION_MODULES,
  CORE_PRODUCTS,
  INCLUDED_WITH_ANY_PAID_CORE,
} from '@operatoros/sdk';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '../../web/src');
const pricingSection = fs.readFileSync(
  path.join(webRoot, 'components/marketing/sections/PricingSection.tsx'),
  'utf8',
);
const pricingCopy = fs.readFileSync(
  path.join(webRoot, 'lib/marketing-pricing.ts'),
  'utf8',
);

test('pricing catalog exposes the finalized three core products', () => {
  assert.deepEqual(
    CORE_PRODUCTS.map(product => [product.key, product.monthlyPriceCents, product.includedSeats]),
    [
      ['tradeflowkit', 14900, 5],
      ['pulsedesk', 14900, 5],
      ['techdeck', 9900, 5],
    ],
  );
  assert.deepEqual(
    INCLUDED_WITH_ANY_PAID_CORE.map(app => app.key),
    ['torqueshed', 'faultlinelab', 'ninja-pool-hall'],
  );
  assert.equal(COMPANION_MODULES.length, 6);
});

test('pricing calculator keeps the selected companion free', () => {
  const price = calculateStackMonthlyPrice({
    coreProduct: 'tradeflowkit',
    freeCompanionModule: 'snapproofos',
    additionalModules: [],
    additionalSeats: 0,
  });
  assert.equal(price.includedCompanionCents, 0);
  assert.equal(price.totalMonthlyCents, 14900);
});

test('pricing calculator charges $29 per additional module and $15 per seat', () => {
  const price = calculateStackMonthlyPrice({
    coreProduct: 'techdeck',
    freeCompanionModule: 'snapproofos',
    additionalModules: ['brandforgeos', 'ninjamation'],
    additionalSeats: 2,
  });
  assert.equal(price.additionalModulesCents, 5800);
  assert.equal(price.additionalSeatsCents, 3000);
  assert.equal(price.totalMonthlyCents, 18700);
});

test('duplicate/free companion selections cannot be billed as additional modules', () => {
  const price = calculateStackMonthlyPrice({
    coreProduct: 'pulsedesk',
    freeCompanionModule: 'ninjamation',
    additionalModules: ['ninjamation', 'brandforgeos', 'brandforgeos'],
    additionalSeats: 0,
  });
  assert.equal(price.additionalModulesCents, 2900);
  assert.equal(price.totalMonthlyCents, 17800);
});

test('pricing surface contains required product and configurator labels', () => {
  for (const copy of [
    'OperatorOS command layer',
    'Fully Unlocked',
    '5 Seats Included',
    'Build Your Stack',
    'Included Companion Module',
    'Additional Modules',
    'Additional Seats',
  ]) {
    assert.match(pricingSection, new RegExp(copy));
  }
});

test('pricing FAQ contains all finalized questions', () => {
  for (const question of [
    'What is OperatorOS?',
    'Do I pay for OperatorOS?',
    'What comes with a core product?',
    'How many seats are included?',
    'Can I buy more seats?',
    'What apps are included with every paid product?',
    'How does the free companion module work?',
    'What do additional modules cost?',
    'Is PulseDesk only for healthcare?',
    'What happens if I cancel?',
  ]) {
    assert.ok(pricingCopy.includes(question), `missing FAQ: ${question}`);
  }
});

test('public pricing files do not contain retired packaging copy', () => {
  const publicPricing = `${pricingSection}\n${pricingCopy}`;
  for (const stale of [
    'Pro Operator',
    'Business Command',
    'Full Arsenal',
    'Four tiers',
    'per operator, per month',
    'All 11 modules',
    'early access',
  ]) {
    assert.equal(publicPricing.toLowerCase().includes(stale.toLowerCase()), false, `stale copy: ${stale}`);
  }
});
