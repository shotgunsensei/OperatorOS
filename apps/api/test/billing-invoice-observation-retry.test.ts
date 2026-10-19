import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/billing-service.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('billing-service.ts', source, ts.ScriptTarget.Latest, true);
const lease = tree.statements.find(statement => ts.isVariableStatement(statement)
  && statement.declarationList.declarations.some(declaration => declaration.name.getText(tree) === 'STRIPE_EVENT_PROCESSING_LEASE_MS'));
assert.ok(lease, 'actual receipt lease constant must exist');
const declarations = ['billingObservationResult', 'classifyWebhookEvent', 'stripeEventLeaseMetadata', 'retryBillingEvent'].map(name => {
  const node = tree.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert.ok(node, `actual ${name} must exist`);
  return node.getText(tree);
});
const compiled = ts.transpileModule(lease.getText(tree) + '\n' + declarations.join('\n') + '\nmodule.exports={retryBillingEvent};', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function savedReceipt(type: string, metadata: object, processed = false) {
  const row = { processedAt: processed ? new Date() : null,
    metadata: { rawEvent: { id: 'evt_saved_synthetic', type, data: { object: { id: 'in_saved', metadata } } } } };
  const calls = { acquired: 0, processed: 0, failed: 0, settlement: 0, moduleImports: 0 };
  const module = { exports: {} as { retryBillingEvent: (id: string) => Promise<any> } };
  runInNewContext(compiled, {
    module, exports: module.exports,
    billingEvents: { id: 'id', processedAt: 'processed_at' },
    db: {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [row] }) }) }),
      execute: async () => { calls.acquired++; return { rows: [{ retry_count: 1 }] }; },
      update: () => ({ set: () => ({ where: async () => undefined }) }),
    },
    eq: () => ({}), sql: () => ({}),
    async markStripeEventProcessed() { calls.processed++; },
    async markStripeEventFailed() { calls.failed++; },
    async processWebhookEvent() { calls.settlement++; return { handled: false, error: 'synthetic unsupported event' }; },
    async processAddonWebhookEvent() { calls.settlement++; return { handled: false, error: 'synthetic unsupported addon' }; },
    require() { calls.moduleImports++; throw new Error('Feature module import forbidden in observation test'); },
  });
  return { calls, retry: () => module.exports.retryBillingEvent('saved_receipt_synthetic') };
}

for (const [name, metadata] of [
  ['plain', {}], ['stack', { billing_model: 'core_product_stack' }],
  ['legacy addon', { type: 'addon', user_id: 'synthetic_user', module_slug: 'synthetic' }],
  ['managed numbers', { type: 'feature_addon', feature: 'managed_phone_numbers' }],
  ['call lanes', { type: 'feature_addon', feature: 'concurrent_call_lanes' }],
] as const) {
  test(`actual saved-receipt retry observes ${name} invoice creation without settlement/module imports`, async () => {
    const f = savedReceipt('invoice.created', metadata);
    const response = await f.retry();
    assert.equal(response.ok, true); assert.equal(response.replayed, true);
    assert.equal(response.replayResult.action, 'invoice_created_observed');
    assert.equal(response.replayResult.shouldPropagate, false);
    assert.deepEqual(f.calls, { acquired: 1, processed: 1, failed: 0, settlement: 0, moduleImports: 0 });
  });
}
test('actual saved observation retry keeps its processed-receipt guard', async () => {
  const f = savedReceipt('invoice.created', {}, true);
  const response = await f.retry();
  assert.equal(response.ok, true); assert.equal(response.replayed, false);
  assert.equal(response.replayResult.action, 'duplicate_ignored');
  assert.deepEqual(f.calls, { acquired: 0, processed: 0, failed: 0, settlement: 0, moduleImports: 0 });
});
for (const type of ['charge.dispute.closed', 'charge.dispute.created', 'charge.refunded',
  'checkout.session.async_payment_failed', 'payment_intent.payment_failed', 'invoice.paid']) {
  test(`actual saved-receipt retry does not erase ${type} settlement failure`, async () => {
    const f = savedReceipt(type, {});
    assert.equal((await f.retry()).ok, false);
    assert.equal(f.calls.failed, 1); assert.equal(f.calls.processed, 0); assert.equal(f.calls.settlement, 1);
  });
}
