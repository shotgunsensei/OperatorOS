import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { snapProofCaptureIdentityStatus } from '../src/lib/snapproof-capture-identity.js';

const trusted = { userId: 'owner-a', tenantId: 'tenant-a' };
test('capture identity requires both exact trusted IDs and never changes authority', () => {
  const input = { expectedCaptureIdentity: { ...trusted } };
  assert.equal(snapProofCaptureIdentityStatus(input, trusted), 'match');
  assert.deepEqual(trusted, { userId: 'owner-a', tenantId: 'tenant-a' });
  assert.equal(snapProofCaptureIdentityStatus({ expectedCaptureIdentity: { ...trusted, userId: 'owner-b' } }, trusted), 'mismatch');
  assert.equal(snapProofCaptureIdentityStatus({ expectedCaptureIdentity: { ...trusted, tenantId: 'tenant-b' } }, trusted), 'mismatch');
  assert.equal(snapProofCaptureIdentityStatus({}, trusted), 'missing');
});

for (const value of [undefined, null, [], 'owner-a', {}, { userId: 'owner-a' }, { ...trusted, role: 'admin' }, { ...trusted, userId: '' }, { ...trusted, tenantId: 42 }, { ...trusted, userId: 'owner-a\n' }, { ...trusted, userId: 'a'.repeat(129) }]) {
  test(`malformed provided capture identity fails closed: ${JSON.stringify(value)}`, () => {
    assert.equal(snapProofCaptureIdentityStatus({ expectedCaptureIdentity: value }, trusted), 'invalid');
  });
}

test('identity assertion is wired to file upload before decoding and replay, without changing notes', () => {
  const source = readFileSync(new URL('../src/routes/snapproofos-phase32-routes.ts', import.meta.url), 'utf8');
  const fileStart = source.indexOf('`${base}/jobs/:id/files`');
  const notesStart = source.indexOf('`${base}/jobs/:id/notes`');
  assert.ok(fileStart > notesStart && notesStart >= 0);
  const fileRoute = source.slice(fileStart, source.indexOf('app.patch(', fileStart));
  const notesRoute = source.slice(notesStart, source.indexOf('app.get(', notesStart));
  assert.match(fileRoute, /preHandler: writeGuards/);
  const assertion = fileRoute.indexOf('snapProofCaptureIdentityStatus(input, { userId: actor(request), tenantId: tenant(request) })');
  assert.ok(assertion >= 0 && assertion < fileRoute.indexOf('parseEvidenceInput('));
  assert.ok(assertion < fileRoute.indexOf('await job('));
  assert.ok(assertion < fileRoute.indexOf('const replay ='));
  assert.match(fileRoute, /previous\.created_by_user_id !== actor\(request\)/);
  assert.doesNotMatch(notesRoute, /expectedCaptureIdentity|snapProofCaptureIdentityStatus/);
});
