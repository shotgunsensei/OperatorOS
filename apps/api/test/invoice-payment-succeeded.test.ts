/**
 * Task #133 — invoice.payment_succeeded routing.
 *
 * Stripe emits BOTH `invoice.paid` and `invoice.payment_succeeded` for a
 * successful invoice. The dispatcher previously handled only `invoice.paid`, so
 * a dashboard endpoint subscribed to `invoice.payment_succeeded` hit the
 * silent no-op default branch. Both must now reach `handleInvoicePaid`.
 *
 * We route a payload whose subscription does NOT exist locally: that makes
 * `handleInvoicePaid` return `{ handled: false, error: 'No matching local
 * subscription' }` — distinct from the default branch's `{ handled: false }`
 * with NO error. The presence of that specific error proves routing, without
 * requiring any DB fixtures.
 */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= process.env.DATABASE_URL ?? 'postgres://localhost/operatoros_test';
process.env.SESSION_SECRET ??= 'test-session-secret-invoice-succeeded';

before(async () => {
  const { ensureSchemaReady } = await import('./_setup.js');
  await ensureSchemaReady();
});

test('invoice.payment_succeeded routes to the invoice-paid handler', async () => {
  const { processWebhookEvent } = await import('../src/lib/billing-service.js');
  const result = await processWebhookEvent({
    type: 'invoice.payment_succeeded',
    data: { object: { subscription: 'sub_does_not_exist_133' } },
  });
  assert.equal(result.handled, false);
  assert.equal(result.error, 'No matching local subscription',
    'reaching this error proves the event was routed to handleInvoicePaid');
});

test('invoice.paid still routes to the same handler', async () => {
  const { processWebhookEvent } = await import('../src/lib/billing-service.js');
  const result = await processWebhookEvent({
    type: 'invoice.paid',
    data: { object: { subscription: 'sub_does_not_exist_133' } },
  });
  assert.equal(result.handled, false);
  assert.equal(result.error, 'No matching local subscription');
});

test('a genuinely unknown event still hits the no-op default branch', async () => {
  const { processWebhookEvent } = await import('../src/lib/billing-service.js');
  const result = await processWebhookEvent({
    type: 'invoice.some_unhandled_event',
    data: { object: {} },
  });
  assert.equal(result.handled, false);
  assert.equal(result.error, undefined,
    'the default branch returns { handled: false } with no error');
});
