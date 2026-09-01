import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertManagedNumberTransition,
  calculateManagedNumberBillingQuantities,
  callCommandNumberBillingGraceDays,
  canTransitionManagedNumber,
  classifyManagedNumberType,
  managedNumberReadiness,
  managedNumberReleaseAt,
  managedNumberRequestHash,
} from '../src/lib/callcommand-managed-number.js';

test('managed-number lifecycle permits recovery paths but makes release terminal', () => {
  assert.equal(canTransitionManagedNumber('REQUESTED', 'PROVISIONING'), true);
  assert.equal(canTransitionManagedNumber('PROVISIONING', 'PROVIDER_PROVISIONED'), true);
  assert.equal(canTransitionManagedNumber('ACTIVE', 'RELEASE_PENDING'), true);
  assert.equal(canTransitionManagedNumber('RELEASE_PENDING', 'ACTIVE'), true, 'release remains cancelable during the hold');
  assert.equal(canTransitionManagedNumber('RELEASE_PENDING', 'RELEASED'), true);
  assert.equal(canTransitionManagedNumber('RELEASED', 'ACTIVE'), false);
  assert.throws(() => assertManagedNumberTransition('RELEASED', 'ACTIVE'), /not allowed/);
});

test('first local number is included while toll-free and additional local are separate quantities', () => {
  assert.deepEqual(calculateManagedNumberBillingQuantities({ local: 0, tollFree: 0 }), {
    activeLocal: 0,
    activeTollFree: 0,
    includedLocal: 1,
    billableLocal: 0,
    billableTollFree: 0,
  });
  assert.deepEqual(calculateManagedNumberBillingQuantities({ local: 3, tollFree: 2 }), {
    activeLocal: 3,
    activeTollFree: 2,
    includedLocal: 1,
    billableLocal: 2,
    billableTollFree: 2,
  });
  assert.throws(() => calculateManagedNumberBillingQuantities({ local: -1, tollFree: 0 }));
});

test('number classification recognizes NANP toll-free prefixes without trusting UI type', () => {
  for (const prefix of ['800','833','844','855','866','877','888']) {
    assert.equal(classifyManagedNumberType(`+1${prefix}5550199`), 'toll_free');
  }
  assert.equal(classifyManagedNumberType('+14045550199'), 'local');
});

test('readiness allows unexpired payment grace but suspends after the deadline', () => {
  const now = new Date('2026-08-31T12:00:00.000Z');
  const base = {
    providerAccountReady: true,
    providerNumberPresent: true,
    routingHealthy: true,
    profileAssigned: true,
    workflowAssigned: true,
    billingStatus: 'grace_period',
    now,
  };
  assert.deepEqual(managedNumberReadiness({
    ...base,
    paymentGraceExpiresAt: new Date('2026-09-01T12:00:00.000Z'),
  }), { ready: true, state: 'healthy', reasons: [] });
  assert.deepEqual(managedNumberReadiness({
    ...base,
    paymentGraceExpiresAt: new Date('2026-08-30T12:00:00.000Z'),
  }), { ready: false, state: 'suspended', reasons: ['billing_not_entitled'] });
});

test('request hashes are deterministic and release/payment holds are bounded', () => {
  assert.equal(
    managedNumberRequestHash({ phone: '+14045550199', nested: { b: 2, a: 1 } }),
    managedNumberRequestHash({ nested: { a: 1, b: 2 }, phone: '+14045550199' }),
  );
  const now = new Date('2026-08-31T12:00:00.000Z');
  assert.equal(managedNumberReleaseAt(now, '24').toISOString(), '2026-09-01T12:00:00.000Z');
  assert.equal(callCommandNumberBillingGraceDays('7'), 7);
  assert.throws(() => managedNumberReleaseAt(now, '0'));
  assert.throws(() => callCommandNumberBillingGraceDays('31'));
});
