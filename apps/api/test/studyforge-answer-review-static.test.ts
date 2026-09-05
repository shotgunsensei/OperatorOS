import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspace = readFileSync(
  new URL('../../web/src/components/module-shells/StudyForgeCompleteWorkspace.tsx', import.meta.url),
  'utf8',
);
const routes = readFileSync(new URL('../src/routes/studyforge-phase33-routes.ts', import.meta.url), 'utf8');

test('StudyForge loads persisted answer-level attempt review for the current tenant and user', () => {
  assert.match(routes, /SELECT id,quiz_id,correct_count,total_count,score_percent,review_json,completed_at FROM studyforge_quiz_attempts/);
  assert.match(routes, /WHERE tenant_id=\$\{tenantId\} AND user_id=\$\{userId\} AND quiz_id=\$\{set\.quiz_id\}/);
  assert.match(routes, /attempts: attempts\.rows\.map\(camel\)/);
});

test('StudyForge renders an expandable, read-only answer-by-answer review without HTML injection', () => {
  assert.match(workspace, /function AttemptReview/);
  assert.match(workspace, /Array\.isArray\(attempt\.reviewJson\)/);
  assert.match(workspace, /<details data-testid="studyforge-attempt-review"/);
  for (const label of ['Selected answer:', 'Correct answer:', 'Explanation:', 'Source excerpt:']) {
    assert.match(workspace, new RegExp(label));
  }
  assert.match(workspace, /questions\.find\(\(candidate\) => candidate\.id === item\.questionId\)/);
  assert.doesNotMatch(workspace, /dangerouslySetInnerHTML|innerHTML\s*=/);
});
