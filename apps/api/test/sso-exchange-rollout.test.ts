import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_EXCHANGE_CODE_MODULES,
  moduleSupportsExchangeCode,
} from '../src/lib/sso-exchange-rollout.js';
import {
  buildSsoLaunchUrlWithCode,
} from '../../../packages/sso/index.js';
import { OPERATOROS_MODULE_REGISTRY } from '../../../packages/modules/registry.js';

const ENV_KEY = 'SSO_EXCHANGE_CODE_MODULES';

function withEnv(value: string | undefined, fn: () => void) {
  const prev = process.env[ENV_KEY];
  if (value === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = prev;
  }
}

test('all active production modules use the code path by default', () => {
  assert.deepEqual(
    [...DEFAULT_EXCHANGE_CODE_MODULES].sort(),
    OPERATOROS_MODULE_REGISTRY
      .filter(module => module.status === 'active')
      .map(module => module.slug)
      .sort(),
  );
  withEnv(undefined, () => {
    for (const slug of DEFAULT_EXCHANGE_CODE_MODULES) {
      assert.equal(moduleSupportsExchangeCode(slug), true, `${slug} supports opaque-code SSO`);
    }
    assert.equal(moduleSupportsExchangeCode('PulseDesk'), true);
    assert.equal(moduleSupportsExchangeCode('outcall'), false, 'planned OutCall cannot mint an SSO exchange by default');
  });
});

test('operators can enable additional modules via env, case-insensitively', () => {
  withEnv('techdeck', () => {
    assert.equal(moduleSupportsExchangeCode('techdeck'), true);
    // default-migrated module stays on regardless of env contents
    assert.equal(moduleSupportsExchangeCode('pulsedesk'), true);
    assert.equal(moduleSupportsExchangeCode('tradeflowkit'), true);
  });
  withEnv('  TechDeck , TRADEFLOWKIT ', () => {
    assert.equal(moduleSupportsExchangeCode('techdeck'), true);
    assert.equal(moduleSupportsExchangeCode('tradeflowkit'), true);
  });
});

test('wildcard enables every module', () => {
  withEnv('*', () => {
    assert.equal(moduleSupportsExchangeCode('techdeck'), true);
    assert.equal(moduleSupportsExchangeCode('anything-else'), true);
  });
});

test('an enabled module launches with ?code= and never a JWT URL parameter', () => {
  const base = 'https://pulsedesk.operatoros.net/sso';
  withEnv(undefined, () => {
    assert.equal(moduleSupportsExchangeCode('pulsedesk'), true);
  });
  const codeUrl = buildSsoLaunchUrlWithCode(base, 'OPAQUE_CODE');
  assert.ok(codeUrl.includes('code=OPAQUE_CODE'), 'launch URL should carry the opaque code');
  assert.ok(!/token=/.test(codeUrl), 'code launch URL must not carry a JWT token param');

});
