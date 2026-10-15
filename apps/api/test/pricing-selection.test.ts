import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPANION_MODULES, CORE_PRODUCTS, assertStackCheckoutBounds, calculateStackMonthlyPrice, normalizeStackSelection, type CompanionModuleKey } from '@operatoros/sdk';
import { pricingAccountPath, pricingSelectionPath, readPricingSelection } from '../../web/src/lib/pricing-selection';
import { sanitizeReturnTo } from '../../../packages/modules/public-url';

test('a chosen Stack survives signup and sign-in return URLs with the same monthly total', () => {
  for (const product of CORE_PRODUCTS) {
    for (const companion of COMPANION_MODULES) {
      const selection = {
        coreProduct: product.key,
        freeCompanionModule: companion.key as CompanionModuleKey,
        additionalModules: ['brandforgeos', 'ninjamation'] as const,
        additionalSeats: 2,
      };
      const expected = readPricingSelection({
        product: selection.coreProduct, companion: selection.freeCompanionModule,
        additional: selection.additionalModules.join(','), seats: '2',
      });
      for (const mode of ['login', 'register'] as const) {
        const authUrl = new URL(pricingAccountPath(expected, mode), 'https://operatoros.net');
        assert.equal(authUrl.pathname, '/login');
        assert.equal(authUrl.searchParams.get('mode'), mode === 'register' ? 'register' : null);
        const next = new URL(authUrl.searchParams.get('next')!, 'https://operatoros.net');
        assert.equal(sanitizeReturnTo(authUrl.searchParams.get('next')), `${next.pathname}${next.search}${next.hash}`);
        assert.equal(next.pathname, '/pricing');
        assert.equal(next.hash, '#build-stack');
        const restored = readPricingSelection(Object.fromEntries(next.searchParams));
        assert.deepEqual(restored, expected);
        assert.equal(calculateStackMonthlyPrice(restored).totalMonthlyCents, calculateStackMonthlyPrice(expected).totalMonthlyCents);
      }
    }
  }
});

test('default Stack keeps the existing audience-lane return URL', () => {
  assert.equal(pricingSelectionPath(readPricingSelection({ product: 'tradeflowkit' })), '/pricing?product=tradeflowkit#build-stack');
});

test('untrusted query values cannot add excluded companions, duplicate charges, or invalid seats', () => {
  const selection = readPricingSelection({
    product: 'outside', companion: 'outcall',
    additional: 'outcall,techdeck,brandforgeos,brandforgeos,snapproofos', seats: '-1',
  });
  assert.deepEqual(selection, {
    coreProduct: 'tradeflowkit', freeCompanionModule: 'snapproofos', additionalModules: ['brandforgeos'], additionalSeats: 0,
  });
  for (const seats of ['1.5', '1e2', 'Infinity', '9007199254740992', '2evil', ['2', '3']]) {
    assert.equal(readPricingSelection({ seats }).additionalSeats, 0);
  }
  assert.deepEqual(readPricingSelection({ product: ['techdeck', 'pulsedesk'], companion: ['ninjamation', 'snapproofos'], additional: ['brandforgeos', 'ninjamation'] }), readPricingSelection({}));
});

test('seat preferences and checkout validation respect the existing 10000 additional-seat database limit', () => {
  for (const seats of ['10001', '2147483642', '2147483643', '2147483647', '9007199254740991']) {
    assert.equal(readPricingSelection({ seats }).additionalSeats, 0);
  }
  const maximum = readPricingSelection({ seats: '10000' });
  assert.equal(maximum.additionalSeats, 10000);
  assert.equal(normalizeStackSelection(maximum).additionalSeats, 10000);
  assert.throws(() => normalizeStackSelection({ ...maximum, additionalSeats: 10001 }), /Additional seats/);
});

test('handoff carries preferences only and has a fixed local return destination', () => {
  const query = { product: 'tradeflowkit', next: 'https://outside.example', tenantId: 'foreign', role: 'owner', price: '0', token: 'untrusted' };
  const path = pricingAccountPath(readPricingSelection(query), 'register');
  assert.equal(new URL(path, 'https://operatoros.net').searchParams.get('next'), '/pricing?product=tradeflowkit#build-stack');
  for (const untrusted of ['outside.example', 'tenantId', 'foreign', 'role', 'price=', 'token', 'untrusted']) assert.equal(path.includes(untrusted), false);
});

test('USD checkout total has a safe ceiling independent of the seat-count boundary', () => {
  assert.doesNotThrow(() => assertStackCheckoutBounds(10000, 99_999_999));
  for (const total of [100_000_000, Number.MAX_SAFE_INTEGER, Number.NaN, -1, 1.5]) {
    assert.throws(() => assertStackCheckoutBounds(0, total), /monthly total/);
  }
  for (const product of CORE_PRODUCTS) {
    const maximum = normalizeStackSelection({
      coreProduct: product.key, freeCompanionModule: 'snapproofos',
      additionalModules: COMPANION_MODULES.map(module => module.key as CompanionModuleKey), additionalSeats: 10000,
    });
    assert.ok(calculateStackMonthlyPrice(maximum).totalMonthlyCents < 99_999_999);
  }
});
