import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseGeneratedMaterial,
  parseGeneration,
  parseDocumentSourceInput,
  parsePlanSessionPatch,
  parseQuestionPatch,
  parseReview,
  parseSourceInput,
  parseSubjectInput,
  sha256,
  StudyForgeValidationError,
} from '../src/lib/studyforge.ts';

test('StudyForge rejects client authority, unknown fields, and invalid source contracts', () => {
  assert.throws(
    () => parseSubjectInput({ name: 'Biology', tenantId: 'browser-tenant' }),
    (error: unknown) => error instanceof StudyForgeValidationError && error.field === 'tenantId',
  );
  assert.throws(
    () => parseSourceInput({ title: 'Invalid', sourceType: 'note', body: 'long enough', attachmentId: crypto.randomUUID() }),
    (error: unknown) => error instanceof StudyForgeValidationError && error.field === 'body',
  );
  assert.throws(
    () => parseSourceInput({ title: 'Invalid', sourceType: 'document' }),
    (error: unknown) => error instanceof StudyForgeValidationError && error.field === 'attachmentId',
  );
  assert.throws(
    () => parseDocumentSourceInput({
      title: 'Private notes',
      originalName: 'notes.txt',
      mimeType: 'text/plain',
      contentBase64: Buffer.from('private notes').toString('base64'),
      tenantId: crypto.randomUUID(),
    }),
    (error: unknown) => error instanceof StudyForgeValidationError && error.field === 'tenantId',
  );
});

test('StudyForge generation requests are bounded and idempotency keys are explicit', () => {
  const sourceId = crypto.randomUUID();
  const parsed = parseGeneration({
    sourceId,
    type: 'deck',
    title: 'Cells',
    idempotencyKey: 'studyforge:test:0001',
  });
  assert.equal(parsed.sourceId, sourceId);
  assert.equal(parsed.type, 'deck');
  assert.throws(
    () => parseGeneration({ sourceId, type: 'deck', title: 'Cells', idempotencyKey: 'short' }),
    StudyForgeValidationError,
  );
  assert.equal(parseReview({ rating: 'good' }).rating, 'good');
  assert.throws(() => parseReview({ rating: 'perfect' }), StudyForgeValidationError);
});

test('StudyForge generated questions and plan sessions have bounded review edits', () => {
  const question = parseQuestionPatch({
    question: 'Which protocol resolves names?',
    choices: ['DNS', 'ARP'],
    correctIndex: 0,
    explanation: 'DNS resolves host names.',
    expectedVersion: 1,
  });
  assert.equal(question.choices?.length, 2);
  assert.throws(
    () => parseQuestionPatch({ choices: ['only one'], expectedVersion: 1 }),
    StudyForgeValidationError,
  );
  assert.equal(parsePlanSessionPatch({
    title: 'Review DNS',
    focus: 'Explain recursive resolution.',
    estimatedMinutes: 30,
    scheduledFor: '2026-08-01',
    expectedVersion: 1,
  }).estimatedMinutes, 30);
  assert.throws(
    () => parsePlanSessionPatch({ estimatedMinutes: 2, expectedVersion: 1 }),
    StudyForgeValidationError,
  );
});

test('StudyForge accepts only exact source excerpts and never fabricates citations', () => {
  const source = 'Mitochondria generate ATP through oxidative phosphorylation. Cells use ATP for energy.';
  const material = parseGeneratedMaterial('deck', JSON.stringify({
    cards: [{
      question: 'What do mitochondria generate?',
      answer: 'ATP',
      sourceExcerpt: 'Mitochondria generate ATP through oxidative phosphorylation.',
    }],
  }), source);
  assert.equal(material.type, 'deck');
  assert.throws(
    () => parseGeneratedMaterial('deck', JSON.stringify({
      cards: [{
        question: 'What do mitochondria generate?',
        answer: 'ATP',
        sourceExcerpt: 'According to Example University, mitochondria generate ATP.',
      }],
    }), source),
    (error: unknown) => error instanceof StudyForgeValidationError && /not present/.test(error.message),
  );
  assert.match(sha256(source), /^[0-9a-f]{64}$/);
});
