process.env.OPERATOROS_BASE_URL = 'https://operatoros.test';
process.env.APP_ENV = 'dev';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSsoLaunchUrlWithCode,
  createSsoExchangeCode,
  createSsoHandoffClaims,
  normalizeSsoEnv,
  parseSsoExchangeCode,
  resolveSsoSecret,
  signSsoHandoffToken,
  verifySsoHandoffToken,
} from '../../../packages/sso/index.js';
import { getModuleById } from '../../../packages/modules/registry.js';
import {
  isPkceChallenge,
  isPkceVerifier,
  isSsoTransactionValue,
} from '../../../packages/sso/browser-contract.js';

const SECRET = 'sso-helper-test-secret-1234567890';

test('shared SSO helper builds required audience-bound claims', () => {
  const module = getModuleById('techdeck');
  assert.ok(module);

  const claims = createSsoHandoffClaims({
    now: 1_800_000_000,
    user: {
      id: 'user-1',
      email: 'operator@example.com',
      role: 'user',
      platformRole: 'user',
    },
    tenant: {
      id: 'tenant-1',
      role: 'owner',
    },
    module,
    isPlatformAdmin: false,
    jti: 'jti-fixture',
    nonce: 'nonce-fixture',
  });

  assert.equal(claims.sub, 'user-1');
  assert.equal(claims.userId, 'user-1');
  assert.equal(claims.email, 'operator@example.com');
  assert.equal(claims.tenantId, 'tenant-1');
  assert.equal(claims.role, 'owner');
  assert.equal(claims.moduleId, 'techdeck');
  assert.equal(claims.entitlementKey, 'techdeck');
  assert.equal(claims.iss, 'https://operatoros.test');
  assert.equal(claims.aud, 'techdeck');
  assert.equal(claims.iat, 1_800_000_000);
  assert.equal(claims.exp, 1_800_000_060);
  assert.equal(claims.jti, 'jti-fixture');
  assert.equal(claims.nonce, 'nonce-fixture');
});

test('shared SSO helper signs and verifies only the intended module audience', () => {
  const module = getModuleById('techdeck');
  assert.ok(module);
  const claims = createSsoHandoffClaims({
    user: { id: 'user-1', email: 'operator@example.com', role: 'user', platformRole: 'user' },
    tenant: { id: 'tenant-1', role: 'owner' },
    module,
    isPlatformAdmin: false,
  });
  const token = signSsoHandoffToken(claims, SECRET);

  const verified = verifySsoHandoffToken(token, {
    secret: SECRET,
    issuer: 'https://operatoros.test',
    moduleId: 'techdeck',
  });
  assert.equal(verified.moduleId, 'techdeck');
  assert.equal(verified.entitlementKey, 'techdeck');

  assert.throws(
    () => verifySsoHandoffToken(token, {
      secret: SECRET,
      issuer: 'https://operatoros.test',
      moduleId: 'pulsedesk',
    }),
    /audience invalid/,
  );
});

test('shared SSO helper rejects expired tokens and normalizes env/secrets', () => {
  const module = getModuleById('techdeck');
  assert.ok(module);
  const claims = createSsoHandoffClaims({
    now: Math.floor(Date.now() / 1000) - 120,
    ttlSeconds: 1,
    user: { id: 'user-1', email: 'operator@example.com', role: 'user', platformRole: 'user' },
    tenant: { id: 'tenant-1', role: 'owner' },
    module,
    isPlatformAdmin: false,
  });
  const token = signSsoHandoffToken(claims, SECRET);

  assert.throws(
    () => verifySsoHandoffToken(token, {
      secret: SECRET,
      issuer: 'https://operatoros.test',
      moduleId: 'techdeck',
    }),
    /jwt expired/,
  );
  assert.equal(normalizeSsoEnv('production'), 'prod');
  assert.equal(normalizeSsoEnv('stage'), 'staging');
  assert.equal(normalizeSsoEnv(undefined), 'dev');
  assert.equal(resolveSsoSecret('short'), null);
  assert.equal(resolveSsoSecret(SECRET), SECRET);
});

test('opaque exchange code round-trips the jti+aud binding under the correct secret', () => {
  const jti = 'handoff-jti-abc123';
  const aud = 'pulsedesk';
  const code = createSsoExchangeCode({ jti, aud }, SECRET);

  // The binding is AES-GCM encrypted, so neither jti nor aud may appear in the
  // URL-safe code. (This is what makes a leaked launch URL non-redeemable at
  // public /consume, and un-retargetable to another module.)
  assert.ok(!code.includes(jti));
  assert.ok(!code.includes(aud));
  assert.match(code, /^[A-Za-z0-9_-]+$/); // base64url, no padding/separators
  assert.deepEqual(parseSsoExchangeCode(code, SECRET), { jti, aud });

  // Same binding encrypts to a different code each time (random IV) yet still
  // decrypts back to the same binding — no deterministic ciphertext to correlate.
  const code2 = createSsoExchangeCode({ jti, aud }, SECRET);
  assert.notEqual(code, code2);
  assert.deepEqual(parseSsoExchangeCode(code2, SECRET), { jti, aud });
});

test('opaque browser authorization code preserves its complete transaction binding', () => {
  const binding = {
    jti: 'handoff-jti-browser',
    aud: 'techdeck',
    clientId: 'operatoros:techdeck',
    redirectUri: 'https://techdeck.operatoros.net/sso',
    returnTo: '/tickets?view=mine',
    state: 's'.repeat(43),
    nonce: 'n'.repeat(43),
    codeChallenge: 'c'.repeat(43),
  };
  const code = createSsoExchangeCode(binding, SECRET);
  assert.deepEqual(parseSsoExchangeCode(code, SECRET), binding);
  for (const privateValue of Object.values(binding)) {
    assert.ok(!code.includes(privateValue), 'encrypted code must not disclose transaction binding values');
  }
});

test('browser transaction validators enforce state, nonce, and S256 PKCE shapes', () => {
  assert.equal(isSsoTransactionValue('s'.repeat(43)), true);
  assert.equal(isSsoTransactionValue('short'), false);
  assert.equal(isPkceChallenge('c'.repeat(43)), true);
  assert.equal(isPkceChallenge('c'.repeat(42)), false);
  assert.equal(isPkceVerifier('v'.repeat(64)), true);
  assert.equal(isPkceVerifier('contains spaces'.repeat(4)), false);
});

test('opaque exchange code fails closed on tamper, wrong secret, or malformed input', () => {
  const jti = 'handoff-jti-xyz789';
  const code = createSsoExchangeCode({ jti, aud: 'pulsedesk' }, SECRET);

  // Wrong secret → auth tag mismatch → null (cannot be redeemed).
  assert.equal(parseSsoExchangeCode(code, 'a-different-secret-000000000000'), null);

  // Any tamper of the ciphertext/iv/tag → auth tag mismatch → null.
  const raw = Buffer.from(code, 'base64url');
  raw[raw.length - 1] ^= 0xff; // flip a bit in the auth tag
  assert.equal(parseSsoExchangeCode(raw.toString('base64url'), SECRET), null);
  const raw2 = Buffer.from(code, 'base64url');
  raw2[0] ^= 0xff; // flip a bit in the IV
  assert.equal(parseSsoExchangeCode(raw2.toString('base64url'), SECRET), null);

  // Malformed / truncated / empty / non-string inputs → null (never throws).
  assert.equal(parseSsoExchangeCode('', SECRET), null);
  assert.equal(parseSsoExchangeCode('too-short', SECRET), null);
  assert.equal(parseSsoExchangeCode('!!!not-base64!!!', SECRET), null);
  assert.equal(parseSsoExchangeCode(undefined, SECRET), null);
  assert.equal(parseSsoExchangeCode(null, SECRET), null);
  assert.equal(parseSsoExchangeCode(42, SECRET), null);
});

test('shared SSO launch URL with code targets the module /sso receiver', () => {
  const code = createSsoExchangeCode({ jti: 'jti-fixture', aud: 'pulsedesk' }, SECRET);
  assert.equal(
    buildSsoLaunchUrlWithCode('https://techdeck.operatoros.net/', code),
    `https://techdeck.operatoros.net/sso?code=${encodeURIComponent(code)}`,
  );
});
