/**
 * Task #108 — Regression: when Stripe delivers
 * `customer.subscription.created` BEFORE the `checkout.session.completed`
 * webhook (legal under Stripe's at-least-once / out-of-order delivery),
 * the propagation pipeline MUST NOT run against a missing local
 * subscription row and revoke valid module access.
 *
 * Specifically: handleSubscriptionCreated should return
 * `shouldPropagate: false` when no local `subscriptions` row exists.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= process.env.DATABASE_URL ?? 'postgres://localhost/operatoros_test';
process.env.SESSION_SECRET ??= 'test-session-secret-for-out-of-order';

test('subscription.created BEFORE checkout.completed -> handled but no propagate', async () => {
  const { processWebhookEvent } = await import('../src/lib/billing-service.js');
  // A user id that has no local subscriptions row.
  const unknownUserId = '00000000-0000-0000-0000-000000000000';

  const result = await processWebhookEvent({
    type: 'customer.subscription.created',
    data: {
      object: {
        id: 'sub_test_oo_order',
        customer: 'cus_test_oo_order',
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
        metadata: { userId: unknownUserId },
      },
    },
  });

  assert.equal(result.handled, true,
    'event should be acknowledged (Stripe needs a 200) even when local row is missing');
  assert.equal(result.shouldPropagate, false,
    'propagation MUST be skipped — otherwise the recompute pass would revoke valid module access');
  assert.equal(result.action, 'subscription_created_deferred',
    'action should signal that propagation was deferred until checkout webhook lands');
});

test('handleSubscriptionCreated with NO userId metadata -> not handled', async () => {
  const { processWebhookEvent } = await import('../src/lib/billing-service.js');
  const result = await processWebhookEvent({
    type: 'customer.subscription.created',
    data: { object: { id: 'sub_test_no_meta', metadata: {} } },
  });
  assert.equal(result.handled, false);
});
