process.env.OPERATOROS_BASE_URL = 'https://operatoros.test';
process.env.APP_ENV = 'dev';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSsoLaunchUrl,
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
  assert.equal(claims.exp, 1_800_000_090);
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

test('shared SSO launch URL targets the module /sso receiver', () => {
  const token = 'signed-token';
  assert.equal(
    buildSsoLaunchUrl('https://techdeck.operatoros.net/', token),
    'https://techdeck.operatoros.net/sso?token=signed-token',
  );
});

test('opaque exchange code round-trips the jti under the correct secret', () => {
  const jti = 'handoff-jti-abc123';
  const code = createSsoExchangeCode(jti, SECRET);

  // The jti is AES-GCM encrypted, so it must NOT appear in the URL-safe code.
  // (This is what makes a leaked launch URL non-redeemable at public /consume.)
  assert.ok(!code.includes(jti));
  assert.match(code, /^[A-Za-z0-9_-]+$/); // base64url, no padding/separators
  assert.equal(parseSsoExchangeCode(code, SECRET), jti);

  // Same jti encrypts to a different code each time (random IV) yet still
  // decrypts back to the same jti — no deterministic ciphertext to correlate.
  const code2 = createSsoExchangeCode(jti, SECRET);
  assert.notEqual(code, code2);
  assert.equal(parseSsoExchangeCode(code2, SECRET), jti);
});

test('opaque exchange code fails closed on tamper, wrong secret, or malformed input', () => {
  const jti = 'handoff-jti-xyz789';
  const code = createSsoExchangeCode(jti, SECRET);

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
  const code = createSsoExchangeCode('jti-fixture', SECRET);
  assert.equal(
    buildSsoLaunchUrlWithCode('https://techdeck.operatoros.net/', code),
    `https://techdeck.operatoros.net/sso?code=${encodeURIComponent(code)}`,
  );
});
