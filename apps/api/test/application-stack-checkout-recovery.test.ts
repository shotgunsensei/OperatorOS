import assert from 'node:assert/strict';
import test from 'node:test';
import { pendingStackSelection } from '../../web/src/lib/application-stack-checkout.js';

const pending = {
  status: 'incomplete', coreProduct: 'techdeck', includedCompanionKey: 'snapproofos',
  additionalModuleKeys: ['brandforgeos'], additionalSeats: 1,
};

test('pending checkout preserves the original cart rather than a new pricing-page preference', () => {
  assert.deepEqual(pendingStackSelection(pending), {
    coreProduct: 'techdeck', freeCompanionModule: 'snapproofos',
    additionalModules: ['brandforgeos'], additionalSeats: 1,
  });
  assert.equal(pendingStackSelection({ ...pending, additionalSeats: 0 })?.additionalSeats, 0);
});

test('settled, ended and missing subscriptions are not resumable unpaid carts', () => {
  for (const status of ['active', 'trialing', 'past_due', 'canceling', 'canceled', 'expired', 'checkout_failed']) {
    assert.equal(pendingStackSelection({ ...pending, status }), null, status);
  }
  for (const value of [null, undefined, 'incomplete', {}]) assert.equal(pendingStackSelection(value), null);
});

test('malformed or excluded pending selections fail closed without dropping paid items', () => {
  for (const changes of [
    { coreProduct: 'outcall' }, { includedCompanionKey: 'torqueshed' },
    { additionalModuleKeys: ['outcall'] }, { additionalModuleKeys: ['brandforgeos', 'brandforgeos'] },
    { additionalModuleKeys: ['snapproofos'] }, { additionalModuleKeys: 'brandforgeos' },
    { additionalModuleKeys: [null] }, { additionalSeats: -1 }, { additionalSeats: 1.5 },
    { additionalSeats: '1' }, { additionalSeats: Number.MAX_SAFE_INTEGER + 1 },
  ]) assert.equal(pendingStackSelection({ ...pending, ...changes }), null);
});
