import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCorsOriginValidator,
  parseCorsAllowedOrigins,
} from '../src/cors-origin.js';

function validateOrigin(
  validator: ReturnType<typeof buildCorsOriginValidator>,
  origin: string | undefined,
): Promise<{ error: Error | null; allowed: boolean | string }> {
  return new Promise((resolve) => {
    validator(origin, (error, allowed) => resolve({ error, allowed }));
  });
}

test('parses the explicit runner origin allowlist', () => {
  const origins = parseCorsAllowedOrigins(
    'https://operatoros.net, https://techdeck.app,https://operatoros.net',
  );

  assert.deepEqual([...origins], ['https://operatoros.net', 'https://techdeck.app']);
});

test('allows only exact configured origins in production', async () => {
  const validator = buildCorsOriginValidator('https://operatoros.net', 'production');

  assert.deepEqual(await validateOrigin(validator, undefined), {
    error: null,
    allowed: true,
  });
  assert.deepEqual(await validateOrigin(validator, 'https://operatoros.net'), {
    error: null,
    allowed: true,
  });

  const rejected = await validateOrigin(validator, 'https://operatoros.net.attacker.example');
  assert.match(rejected.error?.message ?? '', /not allowed/i);
  assert.equal(rejected.allowed, false);
});

test('permits loopback origins only in development', async () => {
  const development = buildCorsOriginValidator(undefined, 'development');
  const production = buildCorsOriginValidator(undefined, 'production');

  assert.deepEqual(await validateOrigin(development, 'http://localhost:3000'), {
    error: null,
    allowed: true,
  });

  const rejected = await validateOrigin(production, 'http://localhost:3000');
  assert.match(rejected.error?.message ?? '', /not allowed/i);
  assert.equal(rejected.allowed, false);
});
