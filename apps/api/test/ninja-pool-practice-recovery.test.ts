import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findActivePracticeSummary,
  reconcilePracticeProgress,
  type PracticeSessionSummary,
} from '../../web/src/lib/ninja-pool-hall/practice-recovery.ts';

function summary(
  overrides: Partial<PracticeSessionSummary> = {},
): PracticeSessionSummary {
  return {
    id: 'practice-1',
    status: 'active',
    shots: 4,
    objectBallsPocketed: 3,
    scratches: 1,
    version: 5,
    ...overrides,
  };
}

test('an exact next-version summary reconciles a committed shot whose response was lost', () => {
  const result = reconcilePracticeProgress('practice-1', {
    expectedVersion: 4,
    shots: 4,
    objectBallsPocketed: 3,
    scratches: 1,
  }, [summary()]);

  assert.equal(result.kind, 'committed');
  assert.equal(result.kind === 'committed' && result.session.version, 5);
});

test('a completed exact summary also reconciles without inventing table state', () => {
  const result = reconcilePracticeProgress('practice-1', {
    expectedVersion: 8,
    shots: 9,
    objectBallsPocketed: 15,
    scratches: 2,
  }, [summary({
    status: 'completed',
    shots: 9,
    objectBallsPocketed: 15,
    scratches: 2,
    version: 9,
  })]);

  assert.equal(result.kind, 'committed');
});

test('different counters or additional versions require server-state recovery', () => {
  const result = reconcilePracticeProgress('practice-1', {
    expectedVersion: 4,
    shots: 4,
    objectBallsPocketed: 3,
    scratches: 1,
  }, [summary({ shots: 5, version: 6 })]);

  assert.equal(result.kind, 'server-state');
  assert.equal(result.kind === 'server-state' && result.session.shots, 5);
});

test('reconciliation never substitutes another scoped session', () => {
  const result = reconcilePracticeProgress('practice-1', {
    expectedVersion: 4,
    shots: 4,
    objectBallsPocketed: 3,
    scratches: 1,
  }, [summary({ id: 'practice-2' })]);

  assert.deepEqual(result, { kind: 'missing' });
});

test('reload recovery recognizes the first active summary only', () => {
  const sessions = [
    summary({ id: 'completed', status: 'completed' }),
    summary({ id: 'active-latest' }),
    summary({ id: 'active-older' }),
  ];

  assert.equal(findActivePracticeSummary(sessions)?.id, 'active-latest');
  assert.equal(findActivePracticeSummary([
    summary({ status: 'abandoned' }),
    summary({ status: 'completed' }),
  ]), null);
});
