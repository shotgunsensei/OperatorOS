import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  OFFICEEXIT_EDITIONS, OFFICEEXIT_TENANT_LICENSE_TERMS_VERSION, createOfficeExitTenantToolGrant,
  isOfficeExitToolGrant, isToolBridgeData, officeExitCapabilitiesForEdition,
  type OfficeExitMappingLink, type OfficeExitPurchaseSync,
} from '@operatoros/sdk';
import { signToolBridgeAssertion, verifyToolBridgeAssertion } from '../src/lib/tool-bridge-assertion.js';

// Ephemeral memory-only fixture keys. No persistent key, credential or trust is created.
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const foreign = generateKeyPairSync('rsa', { modulusLength: 2048 });
const config = { issuer: 'https://authority.example.test', audience: 'https://office.example.test', keyId: 'memory-only-fixture-key' };
const signing = { ...config, privateKey: keys.privateKey };
const verifying = { ...config, publicKey: keys.publicKey };
const now = 1_800_000_000;
const active: OfficeExitPurchaseSync = {
  contractVersion: 1, moduleSlug: 'officeexit', purchaseKind: 'one_time', operatorosTenantId: 'tenant-fixture-A',
  purchaseId: '11111111-1111-4111-8111-111111111111', revision: 1, state: 'active',
  grant: createOfficeExitTenantToolGrant(),
};
const linking: OfficeExitMappingLink = {
  contractVersion: 1, moduleSlug: 'officeexit', operatorosTenantId: 'tenant-fixture-A', operatorosUserId: 'owner-fixture-A',
  officeexitOrganizationId: '22222222-2222-4222-8222-222222222222', officeexitUserId: '33333333-3333-4333-8333-333333333333',
};
function forge(payload: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', typ: 'operatoros-tool-bridge+jwt', kid: config.keyId }): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode(header)}.${encode(payload)}`;
  return `${input}.${sign('RSA-SHA256', Buffer.from(input), keys.privateKey).toString('base64url')}`;
}
const issued = signToolBridgeAssertion(signing, 'officeexit.purchase.sync', active, now);
const payload = verifyToolBridgeAssertion(verifying, 'officeexit.purchase.sync', issued, now);

test('frozen signed contract preserves explicit grant and binds exact issuer/audience/operation with bounded lifetime', () => {
  assert.deepEqual(payload.data, active);
  assert.equal(payload.exp - payload.iat, 60);
  assert.equal(payload.nbf, payload.iat);
  assert.equal(payload.iss, config.issuer);
  assert.equal(payload.aud, config.audience);
  assert.notEqual(verifyToolBridgeAssertion(verifying, 'officeexit.purchase.sync', signToolBridgeAssertion(signing, 'officeexit.purchase.sync', active, now), now).jti, payload.jti);
  const linked = signToolBridgeAssertion(signing, 'officeexit.mapping.link', linking, now);
  assert.deepEqual(verifyToolBridgeAssertion(verifying, 'officeexit.mapping.link', linked, now).data, linking);
  assert.throws(() => verifyToolBridgeAssertion(verifying, 'officeexit.purchase.sync', linked, now), { code: 'TOOL_BRIDGE_ASSERTION_REJECTED' });
});

for (const state of ['refunded', 'disputed', 'cancelled'] as const) {
  test(`${state} is a signed grant-free revision, not a new positive license`, () => {
    const data = { ...active, state, revision: 2, grant: null };
    assert.deepEqual(verifyToolBridgeAssertion(verifying, 'officeexit.purchase.sync', signToolBridgeAssertion(signing, 'officeexit.purchase.sync', data, now), now).data, data);
    assert.equal(isToolBridgeData('officeexit.purchase.sync', { ...data, grant: active.grant }), false);
  });
}

for (const edition of OFFICEEXIT_EDITIONS) {
  test(`${edition} legacy matrix is preserved while the tenant purchase accepts only the complete MSP Pro alias`, () => {
    const grant = { edition, coverage: 'entire_tenant', capabilities: officeExitCapabilitiesForEdition(edition), licenseTermsVersion: OFFICEEXIT_TENANT_LICENSE_TERMS_VERSION };
    assert.equal(isOfficeExitToolGrant(grant), edition === 'MSP Pro');
    assert.equal(isOfficeExitToolGrant({ ...grant, coverage: undefined }), false);
    assert.equal(isOfficeExitToolGrant({ ...grant, coverage: 'per_device' }), false);
    assert.equal(isOfficeExitToolGrant({ ...grant, maximumDevices: 3 }), false);
    assert.equal(isOfficeExitToolGrant({ ...grant, capabilities: [...grant.capabilities, 'invented'] }), false);
    assert.equal(isOfficeExitToolGrant({ ...grant, capabilities: [...grant.capabilities, ...grant.capabilities] }), false);
  });
}

for (const [name, patch] of [
  ['wrong issuer', { iss: 'https://foreign.example.test' }], ['wrong audience', { aud: 'https://foreign.example.test' }],
  ['wrong operation', { op: 'officeexit.mapping.link' }], ['missing expiration', { exp: undefined }],
  ['long lifetime', { exp: now + 61 }], ['empty lifetime', { exp: now }],
  ['future timestamp', { iat: now + 6, nbf: now + 6, exp: now + 60 }],
  ['noninteger expiration', { exp: now + 0.5 }], ['nbf drift', { nbf: now - 1 }],
  ['nonstring tenant', { data: { ...active, operatorosTenantId: ['tenant-fixture-A'] } }],
  ['array state', { data: { ...active, state: ['refunded'], grant: null } }],
  ['extra payload field', { admin: true }], ['missing jti', { jti: undefined }],
] as const) {
  test(`valid signature still rejects ${name}`, () => {
    assert.throws(() => verifyToolBridgeAssertion(verifying, 'officeexit.purchase.sync', forge({ ...payload, ...patch }), now), { code: 'TOOL_BRIDGE_ASSERTION_REJECTED' });
  });
}

test('header/key/algorithm/tamper/expiry and alternate token encodings fail closed', () => {
  assert.throws(() => verifyToolBridgeAssertion({ ...verifying, publicKey: foreign.publicKey }, 'officeexit.purchase.sync', issued, now));
  assert.throws(() => verifyToolBridgeAssertion({ ...verifying, keyId: 'other' }, 'officeexit.purchase.sync', issued, now));
  assert.throws(() => verifyToolBridgeAssertion(verifying, 'officeexit.purchase.sync', issued, now + 65));
  assert.doesNotThrow(() => verifyToolBridgeAssertion(verifying, 'officeexit.purchase.sync', issued, now + 64));
  for (const header of [
    { alg: 'none', typ: 'operatoros-tool-bridge+jwt', kid: config.keyId },
    { alg: 'HS256', typ: 'operatoros-tool-bridge+jwt', kid: config.keyId },
    { alg: 'RS256', typ: 'JWT', kid: config.keyId },
    { alg: 'RS256', typ: 'operatoros-tool-bridge+jwt', kid: config.keyId, jku: 'https://foreign.example.test/key' },
  ]) assert.throws(() => verifyToolBridgeAssertion(verifying, 'officeexit.purchase.sync', forge(payload as unknown as Record<string, unknown>, header), now));
  for (const token of ['', issued + '.', issued + '=', issued.slice(0, -10), 'a'.repeat(16_385)]) {
    assert.throws(() => verifyToolBridgeAssertion(verifying, 'officeexit.purchase.sync', token, now));
  }
});

test('signer requires explicit dedicated RSA authority, valid operation and bounded exact data', () => {
  const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  for (const bad of [
    { ...signing, issuer: 'http://authority.example.test' }, { ...signing, audience: config.audience + '/path' },
    { ...signing, privateKey: ec.privateKey }, { ...signing, keyId: '' },
  ]) assert.throws(() => signToolBridgeAssertion(bad, 'officeexit.purchase.sync', active, now));
  assert.throws(() => signToolBridgeAssertion(signing, 'unknown' as never, active, now));
  assert.throws(() => signToolBridgeAssertion(signing, 'officeexit.purchase.sync', active, Number.MAX_SAFE_INTEGER));
  assert.throws(() => signToolBridgeAssertion(signing, 'officeexit.purchase.sync', { ...active, revision: 0 }, now));
  assert.throws(() => signToolBridgeAssertion(signing, 'officeexit.purchase.sync', { ...active, grant: null }, now));
  assert.equal(isToolBridgeData('officeexit.mapping.link', { ...linking, officeexitUserId: ['33333333-3333-4333-8333-333333333333'] }), false);
});
