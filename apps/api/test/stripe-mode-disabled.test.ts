/**
 * Task #133 — Stripe stays DISABLED for a missing / unknown mode.
 *
 * Requirement: Stripe is enabled only when a secret key is present AND
 * STRIPE_MODE is explicitly 'test' or 'live'. A present key with an UNSET (or
 * unknown) mode must leave billing disabled — it must not silently default to
 * the sandbox.
 *
 * `isStripeEnabled()` reads module-level constants captured at import time, so
 * we clear STRIPE_MODE BEFORE the first dynamic import. node:test runs each
 * test file in its own process, so this env state is isolated from the
 * test-mode-enable file.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_for_disabled_check';
delete process.env.STRIPE_MODE;

test('a present key with NO STRIPE_MODE leaves Stripe disabled', async () => {
  const { isStripeEnabled } = await import('../src/lib/billing-service.js');
  assert.equal(isStripeEnabled(), false,
    'missing STRIPE_MODE must not enable billing even with a secret key');
});
