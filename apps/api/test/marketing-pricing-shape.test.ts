import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  calculateStackMonthlyPrice,
  COMPANION_MODULES,
  CORE_PRODUCTS,
  FREE_WITH_ANY_ACCOUNT,
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
const billingPage = fs.readFileSync(
  path.join(webRoot, 'components/pages/BillingPage.tsx'),
  'utf8',
);
const upgradeModal = fs.readFileSync(
  path.join(webRoot, 'components/UpgradeModal.tsx'),
  'utf8',
);
const appsPage = fs.readFileSync(
  path.join(webRoot, 'components/pages/AppsPage.tsx'),
  'utf8',
);
const commandOrbit = fs.readFileSync(
  path.join(webRoot, 'components/marketing/sections/CommandOrbit.tsx'),
  'utf8',
);
const hero = fs.readFileSync(
  path.join(webRoot, 'components/marketing/sections/Hero.tsx'),
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
    FREE_WITH_ANY_ACCOUNT.map(app => app.key),
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
    'OperatorOS home base',
    'All current features included',
    '5 Seats Included',
    'Build Your Application Stack',
    'Included Organization-wide Companion',
    'Additional Organization-wide Companions',
    'Additional Seats',
    'no credit card required',
  ]) {
    assert.match(pricingSection, new RegExp(copy));
  }
});

test('homepage marketing sections carry no paid-core gating for the free apps', () => {
  for (const [name, src] of [
    ['CommandOrbit', commandOrbit],
    ['Hero', hero],
    ['PricingSection', pricingSection],
  ] as const) {
    assert.ok(
      !/Included With Any Core/i.test(src),
      `stale "Included With Any Core" paid-gating phrase found in ${name}`,
    );
  }
  assert.match(pricingSection, /Free With Any Account/);
  assert.match(hero, /no credit\s+card required/);
});

test('pricing FAQ contains all finalized questions', () => {
  for (const question of [
    'What is OperatorOS?',
    'Do I pay for OperatorOS?',
    'What comes with a flagship application?',
    'How many seats are included?',
    'Can I buy more seats?',
    'Which apps are free with any account?',
    'How does the included companion work?',
    'What do additional companions cost?',
    'Can I pay annually?',
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

test('signed-in billing separates the app stack from workspace capacity', () => {
  for (const copy of [
    'Organization billing',
    'Application Stack is the forward offer',
    'Grandfathered legacy contract',
    'No paid subscription',
  ]) {
    assert.match(billingPage, new RegExp(copy));
  }
  assert.match(upgradeModal, /Build an Application Stack/);
  assert.match(upgradeModal, /Only the organization owner/);
  assert.match(appsPage, /Configure Application Stack/);
  assert.doesNotMatch(billingPage, /billingApi\.subscribe\s*\(/);
  assert.doesNotMatch(upgradeModal, /billingApi\.subscribe\s*\(/);
  assert.doesNotMatch(appsPage, /modulesApi\.subscribeAddon\s*\(/);
  assert.doesNotMatch(appsPage, /Min plan:/);
});
