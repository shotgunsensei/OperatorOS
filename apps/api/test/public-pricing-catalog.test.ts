import assert from 'node:assert/strict';
import test from 'node:test';
import { CORE_PRODUCTS, COMPANION_MODULE_PRICE_CENTS, DEFAULT_ADDITIONAL_SEAT_PRICE_CENTS } from '@operatoros/sdk';
import { readBillingCatalog, catalogMoney } from '../../web/src/lib/pricing-catalog.js';
import { campaignQuery, withCampaign } from '../../web/src/lib/campaign-query.js';
import { pricingAccountPath, readPricingSelection } from '../../web/src/lib/pricing-selection.js';

const valid = () => ({ billingInterval: 'month', includedSeats: 5, includedCompanionCount: 1,
  coreProducts: CORE_PRODUCTS.map(row => ({ ...row })), companionModuleMonthlyPriceCents: COMPANION_MODULE_PRICE_CENTS,
  additionalSeatMonthlyPriceCents: DEFAULT_ADDITIONAL_SEAT_PRICE_CENTS, stripeConfigured: { tradeflowkit: true } });

test('public prices are taken from the returned catalog, with readiness separate from display', () => {
  const response = valid();
  response.coreProducts[0].monthlyPriceCents = 14925;
  const catalog = readBillingCatalog(response)!;
  assert.equal(catalogMoney(catalog.coreProducts[0].monthlyPriceCents), '$149.25');
  assert.equal(catalog.stripeConfigured.tradeflowkit, true);
  assert.equal(catalog.stripeConfigured.techdeck, false);
  assert.equal(catalog.coreProducts.find(row => row.key === 'techdeck')?.monthlyPriceCents, 9900);
});

test('missing, duplicate, malformed and incompatible catalogs cannot enable checkout', () => {
  for (const patch of [{billingInterval:'year'}, {includedSeats:4}, {includedCompanionCount:3},
    {coreProducts:[]}, {additionalSeatMonthlyPriceCents:-1}, {companionModuleMonthlyPriceCents:'2900'}]) {
    assert.equal(readBillingCatalog({...valid(), ...patch}), null);
  }
  for (const amount of [0, -10, NaN, Infinity, 1.2, '14900', undefined]) {
    const response = valid();
    Object.assign(response.coreProducts[0], {monthlyPriceCents:amount});
    assert.equal(readBillingCatalog(response), null);
  }
  const duplicate = valid();
  duplicate.coreProducts.push(duplicate.coreProducts[0]);
  assert.equal(readBillingCatalog(duplicate), null);
  for (const invalid of [null, undefined, 'wrong', [], {}]) assert.equal(readBillingCatalog(invalid), null);
});

test('public campaign labels survive pricing and auth return navigation without carrying authority or identifiers', () => {
  const campaign = campaignQuery({utm_source:'sales kit', utm_campaign:'oct5', utm_medium:['a','b'], utm_content:'x'.repeat(201),
    utm_term:'bad\nvalue', gclid:'secret-id', next:'https://outside.example', role:'owner', tenantId:'foreign'});
  assert.equal(campaign, 'utm_source=sales+kit&utm_campaign=oct5');
  const pricing = withCampaign('/pricing?product=techdeck#build-stack', campaign);
  assert.equal(pricing, '/pricing?product=techdeck&utm_source=sales+kit&utm_campaign=oct5#build-stack');
  const auth = pricingAccountPath(readPricingSelection({product:'techdeck', seats:'2'}), 'register', campaign);
  const next = new URL(auth, 'https://operatoros.net').searchParams.get('next')!;
  assert.equal(new URL(next, 'https://operatoros.net').searchParams.get('utm_campaign'), 'oct5');
  assert.equal(next.includes('seats=2'), true);
  for (const forbidden of ['gclid', 'secret-id', 'role', 'tenantId', 'outside.example']) assert.equal(auth.includes(forbidden), false);
});
