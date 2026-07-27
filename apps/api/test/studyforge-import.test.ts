import assert from 'node:assert/strict';
import test from 'node:test';
import { planStudyForgeImport, STUDYFORGE_SOURCE_COMMIT } from '../src/lib/studyforge-import.ts';

const descriptor = {
  sourceCommit: STUDYFORGE_SOURCE_COMMIT,
  export: {
    studySets: [{ id: 1, title: 'Cells' }],
    folders: [{ id: 2, name: 'Biology' }],
    flashcards: [{ id: 3, studySetId: 1 }],
    quizQuestions: [{ id: 4, studySetId: 1 }],
    quizAttempts: [],
    studySessions: [{ id: 5, studySetId: 1 }],
  },
};

test('StudyForge migration dry run is deterministic and pinned', () => {
  const first = planStudyForgeImport(descriptor);
  const second = planStudyForgeImport({
    sourceCommit: STUDYFORGE_SOURCE_COMMIT,
    export: { ...descriptor.export },
  });
  assert.deepEqual(first, second);
  assert.match(first.exportSha256, /^[0-9a-f]{64}$/);
  assert.equal(first.counts.studySets, 1);
  assert.equal(first.mode, 'dry-run');
});

test('StudyForge migration never imports child authority or applies data', () => {
  const plan = planStudyForgeImport(descriptor);
  assert.ok(plan.excluded.includes('password hashes'));
  assert.ok(plan.excluded.includes('subscriptions'));
  assert.match(plan.blockers.join(' '), /No apply mode/);
  assert.throws(() => planStudyForgeImport({ ...descriptor, sourceCommit: 'bad' }));
});
