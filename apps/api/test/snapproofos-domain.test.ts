import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCustodyHash,
  parseCaseInput,
  parseEvidenceInput,
  parseRetentionInput,
  sanitizeContext,
  sha256Json,
  SnapProofValidationError,
} from '../src/lib/snapproofos.ts';

test('SnapProofOS rejects client authority, secrets, invalid captures, and unsafe files', () => {
  assert.throws(
    () => parseCaseInput({ tenantId: 'foreign', reference: 'A-1', title: 'Bad authority' }),
    (error: unknown) => error instanceof SnapProofValidationError && /trusted OperatorOS session/.test(error.message),
  );
  assert.throws(
    () => sanitizeContext({ authorization: 'Bearer leaked' }, 'captureContext'),
    (error: unknown) => error instanceof SnapProofValidationError && /secret-bearing/.test(error.message),
  );
  assert.throws(
    () => parseEvidenceInput({
      title: 'Future capture',
      evidenceType: 'photo',
      capturedAt: '2999-01-01T00:00:00.000Z',
      sourceType: 'camera',
      originalName: 'proof.png',
      declaredMimeType: 'image/png',
      contentBase64: 'AAAA',
    }),
    SnapProofValidationError,
  );
  assert.throws(
    () => parseEvidenceInput({
      title: 'Missing private bytes',
      evidenceType: 'document',
      sourceType: 'upload',
      originalName: 'proof.pdf',
      declaredMimeType: 'application/pdf',
    }),
    SnapProofValidationError,
  );
});

test('SnapProofOS hashes canonical JSON and custody facts deterministically', () => {
  assert.equal(sha256Json({ b: 2, a: 1 }), sha256Json({ a: 1, b: 2 }));
  const event = {
    tenantId: 'tenant',
    caseId: 'case',
    evidenceId: null,
    actorUserId: 'user',
    sequenceNumber: 1,
    eventType: 'case_created',
    previousHash: null,
    payload: { reference: 'SP-1' },
    createdAt: '2026-07-26T12:00:00.000Z',
  };
  assert.equal(createCustodyHash(event), createCustodyHash({ ...event, payload: { reference: 'SP-1' } }));
  assert.notEqual(createCustodyHash(event), createCustodyHash({ ...event, sequenceNumber: 2 }));
});

test('SnapProofOS accepts bounded case, note evidence, and future retention contracts', () => {
  const caseInput = parseCaseInput({
    reference: 'SP-2026-001',
    title: 'Completed field installation',
    sourceContext: { captureChannel: 'operatoros_web' },
  });
  assert.equal(caseInput.reference, 'SP-2026-001');
  const evidence = parseEvidenceInput({
    title: 'Technician completion note',
    evidenceType: 'note',
    description: 'Installation completed and customer acknowledged.',
    sourceType: 'technician_note',
  });
  assert.equal(evidence.content, null);
  assert.equal(evidence.evidenceType, 'note');
  const retention = parseRetentionInput({
    expectedVersion: 1,
    legalHold: true,
    retentionUntil: '2035-01-01T00:00:00.000Z',
  });
  assert.equal(retention.legalHold, true);
  assert.equal(retention.retentionUntil?.toISOString(), '2035-01-01T00:00:00.000Z');
});
