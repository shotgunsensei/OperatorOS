/**
 * Task #133 — Stripe sandbox enablement.
 *
 * Regression: `isStripeEnabled()` previously required `STRIPE_MODE === 'live'`,
 * so a `sk_test_…` key with the intuitive `STRIPE_MODE=test` left billing
 * DISABLED (checkout 409, webhook no-op). Stripe must now be enabled whenever a
 * secret key is present AND the mode is `test` OR `live`, and stay disabled for
 * a missing key or an unknown mode.
 *
 * NOTE: `isStripeEnabled()` reads module-level constants captured at import
 * time, so the env vars MUST be set before the first dynamic import below.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_for_enablement';
process.env.STRIPE_MODE = 'test';

test('sk_test key + STRIPE_MODE=test enables Stripe (sandbox)', async () => {
  const { isStripeEnabled } = await import('../src/lib/billing-service.js');
  assert.equal(isStripeEnabled(), true,
    'test mode with a secret key must enable checkout + webhook processing');
});

test('the gate accepts test OR live and rejects missing key / unknown mode', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const src = fs.readFileSync(
    path.join(root, 'apps/api/src/lib/billing-service.ts'),
    'utf8',
  );
  // Enabled for test OR live, gated on a present secret key.
  assert.match(
    src,
    /return\s+!!STRIPE_SECRET_KEY\s+&&\s+\(STRIPE_MODE === 'test' \|\| STRIPE_MODE === 'live'\)/,
    'isStripeEnabled must require a key AND mode in {test, live}',
  );
  // The old live-only gate must be gone.
  assert.doesNotMatch(
    src,
    /return\s+!!STRIPE_SECRET_KEY\s+&&\s+STRIPE_MODE === 'live';/,
    'the live-only enablement gate must be removed',
  );
  // STRIPE_MODE must NOT default to 'test' — a missing mode must stay disabled.
  assert.doesNotMatch(
    src,
    /const STRIPE_MODE = process\.env\.STRIPE_MODE \|\| 'test';/,
    'STRIPE_MODE must not silently default to test (missing mode = disabled)',
  );
});
