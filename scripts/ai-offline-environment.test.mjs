import assert from 'node:assert/strict';
import test from 'node:test';
import { stripExternalProviderEnvironment } from './parity/lib/database.mjs';

test('offline child environments strip new spending switches, tariff config and existing API credentials', () => {
  const env = { PATH: 'synthetic-path', OPERATOROS_AI_SPEND_ENABLED: '1',
    OPERATOROS_BUDGETED_AI_PROVIDER: 'openai-responses', OPERATOROS_BUDGETED_AI_MODEL: 'synthetic',
    OPERATOROS_BUDGETED_AI_PRICING_JSON: '{}', OPENAI_API_KEY: 'synthetic-never-transmitted' };
  assert.deepEqual(stripExternalProviderEnvironment(env), { PATH: 'synthetic-path' });
  assert.equal(env.OPERATOROS_AI_SPEND_ENABLED, '1');
});
