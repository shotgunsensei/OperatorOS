import test from 'node:test';
import assert from 'node:assert/strict';
import { planTradeFlowKitImport } from '../src/lib/tradeflowkit-import.js';

test('TradeFlowKit dry-run importer preserves source mappings, reconciles money, and excludes authority', () => {
  const source = {
    exportVersion: 1,
    users: [{ id: 'user-1', email: 'legacy@example.test', passwordHash: 'must-not-escape' }],
    orgs: [{ id: 'org-1', name: 'Legacy Org', stripeCustomerId: 'cus_legacy' }],
    memberships: [{ id: 'membership-1', userId: 'user-1', orgId: 'org-1', role: 'owner' }],
    sessions: [{ id: 'session-1', sid: 'secret-session' }],
    subscriptions: [{ id: 'subscription-1', stripeSubscriptionId: 'sub_legacy' }],
    processedStripeEvents: [{ id: 'evt-1', eventId: 'evt_legacy' }],
    customers: [{ id: 'customer-1', name: 'Northstar Mechanical' }],
    jobs: [{ id: 'job-1', customerId: 'customer-1', title: 'Compressor replacement' }],
    quotes: [{ id: 'quote-1', customerId: 'customer-1', jobId: 'job-1', status: 'sent' }],
    quoteItems: [
      { id: 'quote-item-1', quoteId: 'quote-1', description: 'Equipment', qty: '1.00', unitPrice: '1800.00' },
      { id: 'quote-item-2', quoteId: 'quote-1', description: 'Labor', qty: '4.00', unitPrice: '150.00' },
    ],
    invoices: [{ id: 'invoice-1', customerId: 'customer-1', jobId: 'job-1', status: 'paid', taxRate: '8.00', discount: '0.00' }],
    invoiceItems: [
      { id: 'invoice-item-1', invoiceId: 'invoice-1', description: 'Equipment', qty: '1.00', unitPrice: '1800.00' },
      { id: 'invoice-item-2', invoiceId: 'invoice-1', description: 'Labor', qty: '4.00', unitPrice: '150.00' },
    ],
    leads: [{ id: 'lead-1', customerId: 'customer-1', jobId: 'job-1', name: 'Northstar Mechanical' }],
  };
  const first = planTradeFlowKitImport(source);
  const second = planTradeFlowKitImport(source);
  assert.equal(first.readyToApply, true, first.errors.join('\n'));
  assert.equal(first.sourceFingerprint, second.sourceFingerprint);
  assert.deepEqual(first.mappings, second.mappings);
  assert.equal(first.reconciliation.quoteSubtotalCents, 240_000);
  assert.equal(first.reconciliation.invoiceSubtotalCents, 240_000);
  assert.equal(first.reconciliation.paidInvoiceCents, 259_200);
  assert.equal(first.plannedTargetCounts.migrationRefs, 9);
  assert.deepEqual(first.excludedAuthority, {
    orgs: 1, users: 1, memberships: 1, sessions: 1, subscriptions: 1, processedStripeEvents: 1,
  });
  const serialized = JSON.stringify(first);
  assert.doesNotMatch(serialized, /must-not-escape|secret-session|cus_legacy|sub_legacy|evt_legacy/);
});

test('TradeFlowKit dry-run importer fails closed on missing references, duplicates, and invalid money', () => {
  const plan = planTradeFlowKitImport({
    exportVersion: 1,
    customers: [{ id: 'customer-1' }, { id: 'customer-1' }],
    jobs: [{ id: 'job-1', customerId: 'missing-customer' }],
    quotes: [{ id: 'quote-1', jobId: 'missing-job' }],
    quoteItems: [{ id: 'item-1', quoteId: 'missing-quote', qty: '1.0000', unitPrice: '-1.00' }],
  });
  assert.equal(plan.readyToApply, false);
  assert.ok(plan.errors.some(error => error.includes('duplicate source id')));
  assert.ok(plan.errors.some(error => error.includes('missing customer')));
  assert.ok(plan.errors.some(error => error.includes('missing job')));
  assert.ok(plan.errors.some(error => error.includes('missing quote')));
  assert.ok(plan.errors.some(error => error.includes('positive quantity')));
  assert.ok(plan.errors.some(error => error.includes('non-negative money range')));
});
