import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_EXCHANGE_CODE_MODULES,
  moduleSupportsExchangeCode,
} from '../src/lib/sso-exchange-rollout.js';
import {
  buildSsoLaunchUrl,
  buildSsoLaunchUrlWithCode,
} from '../../../packages/sso/index.js';

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

test('migrated modules (PulseDesk) use the code path by default', () => {
  assert.ok(DEFAULT_EXCHANGE_CODE_MODULES.includes('pulsedesk'));
  withEnv(undefined, () => {
    assert.equal(moduleSupportsExchangeCode('pulsedesk'), true);
    assert.equal(moduleSupportsExchangeCode('PulseDesk'), true);
  });
});

test('unmigrated modules keep the legacy token path when unlisted', () => {
  withEnv(undefined, () => {
    assert.equal(moduleSupportsExchangeCode('techdeck'), false);
    assert.equal(moduleSupportsExchangeCode('tradeflowkit'), false);
  });
});

test('operators can enable additional modules via env, case-insensitively', () => {
  withEnv('techdeck', () => {
    assert.equal(moduleSupportsExchangeCode('techdeck'), true);
    // default-migrated module stays on regardless of env contents
    assert.equal(moduleSupportsExchangeCode('pulsedesk'), true);
    assert.equal(moduleSupportsExchangeCode('tradeflowkit'), false);
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

test('an enabled module launches with ?code= (no JWT in the URL)', () => {
  const base = 'https://pulsedesk.operatoros.net/sso';
  withEnv(undefined, () => {
    assert.equal(moduleSupportsExchangeCode('pulsedesk'), true);
  });
  const codeUrl = buildSsoLaunchUrlWithCode(base, 'OPAQUE_CODE');
  assert.ok(codeUrl.includes('code=OPAQUE_CODE'), 'launch URL should carry the opaque code');
  assert.ok(!/token=/.test(codeUrl), 'code launch URL must not carry a JWT token param');

  // Legacy path (module NOT enabled) still emits the token URL.
  const tokenUrl = buildSsoLaunchUrl(base, 'HEADER.PAYLOAD.SIG');
  assert.ok(tokenUrl.includes('token=HEADER.PAYLOAD.SIG'));
  assert.ok(!/[?&]code=/.test(tokenUrl), 'token launch URL must not carry a code param');
});
