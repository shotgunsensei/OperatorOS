import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { inspectOfficeExitLinkRequest, proposeOfficeExitLink } from '../src/lib/tool-link-relay.js';
import { verifyToolBridgeAssertion } from '../src/lib/tool-bridge-assertion.js';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const context = { issuer: 'https://authority.example.test', audience: 'https://office.example.test', keyId: 'ephemeral-test-key' };
const signing = { ...context, privateKey: keys.privateKey }, verifying = { ...context, publicKey: keys.publicKey };
const identity = { tenantId: 'fixture-tenant', userId: 'fixture-owner' }, now = 1_800_000_000_000;
const request = { requestId: '11111111-1111-4111-8111-111111111111', officeexitOrganizationId: '22222222-2222-4222-8222-222222222222',
  officeexitUserId: '33333333-3333-4333-8333-333333333333', officeexitOrganizationName: 'Synthetic local organization', expiresAt: new Date(now + 240_000).toISOString() };
test('inspect is a separately signed operation and no URL carries the assertion or credentials', async () => {
  const deps = { now: () => now, fetch: (async (url, options) => {
    assert.equal(url, context.audience + '/api/operatoros/link-requests/inspect');
    assert.equal(options!.redirect, 'error'); assert.equal(options!.credentials, 'omit');
    const body = JSON.parse(options!.body as string); assert.deepEqual(Object.keys(body), ['assertion']);
    const claims = verifyToolBridgeAssertion(verifying, 'officeexit.mapping.inspect', body.assertion, now / 1000);
    assert.deepEqual(claims.data, { contractVersion: 1, moduleSlug: 'officeexit', operatorosTenantId: identity.tenantId,
      operatorosUserId: identity.userId, requestId: request.requestId });
    assert.throws(() => verifyToolBridgeAssertion(verifying, 'officeexit.mapping.link', body.assertion, now / 1000));
    return new Response(JSON.stringify(request));
  }) as typeof fetch };
  assert.deepEqual(await inspectOfficeExitLinkRequest(signing, identity, request.requestId, deps), request);
});
test('proposal preserves frozen mapping data, requests local confirmation, and returns only fixed reference URL', async () => {
  const result = await proposeOfficeExitLink(signing, identity, request, { now: () => now, fetch: (async (url, options) => {
    assert.equal(url, context.audience + '/api/operatoros/link-requests/propose');
    const body = JSON.parse(options!.body as string); assert.deepEqual(Object.keys(body).sort(), ['assertion', 'requestId']);
    assert.equal(body.requestId, request.requestId);
    const claims = verifyToolBridgeAssertion(verifying, 'officeexit.mapping.link', body.assertion, now / 1000);
    assert.deepEqual(claims.data, { contractVersion: 1, moduleSlug: 'officeexit', operatorosTenantId: identity.tenantId,
      operatorosUserId: identity.userId, officeexitOrganizationId: request.officeexitOrganizationId, officeexitUserId: request.officeexitUserId });
    return new Response(JSON.stringify({ pendingConfirmation: true }));
  }) as typeof fetch });
  assert.deepEqual(result, { redirectUrl: context.audience + '/operatoros/link?request=' + request.requestId });
  assert.doesNotMatch(result.redirectUrl, /assertion|token|eyJ|secret/);
});
for (const invalid of [
  { ...request, requestId: '44444444-4444-4444-8444-444444444444' }, { ...request, officeexitUserId: ['x'] },
  { ...request, expiresAt: new Date(now - 1).toISOString() }, { ...request, expiresAt: new Date(now + 3600_000).toISOString() },
  { ...request, extra: 'untrusted' }, { ...request, officeexitOrganizationName: 'x'.repeat(201) }, [], null,
]) {
  test('invalid or changed consumer correlation cannot be proposed as a reviewed request: ' + JSON.stringify(invalid).slice(0, 90), async () => {
    await assert.rejects(inspectOfficeExitLinkRequest(signing, identity, request.requestId,
      { now: () => now, fetch: (async () => new Response(JSON.stringify(invalid))) as typeof fetch }));
  });
}
test('bad request, expiry, redirect, oversized result or noncanonical destination fails closed', async () => {
  let calls = 0;
  const deps = { now: () => now, fetch: (async () => { calls++; return new Response(JSON.stringify(request)); }) as typeof fetch };
  await assert.rejects(inspectOfficeExitLinkRequest(signing, identity, 'not-a-reference', deps));
  await assert.rejects(proposeOfficeExitLink(signing, identity, { ...request, expiresAt: new Date(now - 1).toISOString() }, deps));
  assert.equal(calls, 0);
  for (const response of [new Response('', { status: 302 }), new Response('x'.repeat(2049)), new Response('not-json')]) {
    await assert.rejects(inspectOfficeExitLinkRequest(signing, identity, request.requestId, { now: () => now, fetch: (async () => response) as typeof fetch }));
  }
  await assert.rejects(inspectOfficeExitLinkRequest({ ...signing, audience: 'https://office.example.test/redirect' }, identity, request.requestId, deps));
});
