import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertNinjaPoolPracticeProgress,
  assertNinjaPoolPracticeVersion,
  NINJA_POOL_HISTORY_DEFAULT_LIMIT,
  NINJA_POOL_HISTORY_MAX_LIMIT,
  NINJA_POOL_MAX_SESSION_SHOTS,
  NINJA_POOL_OBJECT_BALL_COUNT,
  NINJA_POOL_PRACTICE_STATUSES,
  NinjaPoolPracticeStateError,
  NinjaPoolPracticeValidationError,
  NinjaPoolPracticeVersionConflictError,
  parseNinjaPoolPracticeAbandon,
  parseNinjaPoolPracticeListQuery,
  parseNinjaPoolPracticeProgress,
  parseNinjaPoolPracticeStart,
  parseNinjaPoolPracticeVersion,
} from '../src/lib/ninja-pool-practice.ts';

test('Ninja Pool practice preserves the bounded local-session vocabulary', () => {
  assert.deepEqual(NINJA_POOL_PRACTICE_STATUSES, ['active', 'completed', 'abandoned']);
  assert.equal(NINJA_POOL_OBJECT_BALL_COUNT, 15);
  assert.equal(NINJA_POOL_MAX_SESSION_SHOTS, 1_000);
  assert.equal(NINJA_POOL_HISTORY_DEFAULT_LIMIT, 8);
  assert.equal(NINJA_POOL_HISTORY_MAX_LIMIT, 25);
});

test('practice start accepts no client-owned state or authority', () => {
  for (const empty of [undefined, null, '', {}]) {
    assert.deepEqual(parseNinjaPoolPracticeStart(empty), {});
  }

  for (const forbiddenField of [
    'tenantId',
    'userId',
    'status',
    'shots',
    'objectBallsPocketed',
    'scratches',
    'version',
    'balls',
    'gameState',
    'score',
  ]) {
    assert.throws(
      () => parseNinjaPoolPracticeStart({ [forbiddenField]: 'attacker-value' }),
      (error: unknown) => error instanceof NinjaPoolPracticeValidationError
        && error.statusCode === 400
        && error.field === forbiddenField,
    );
  }
});

test('practice progress accepts only bounded counters and optimistic version', () => {
  assert.deepEqual(parseNinjaPoolPracticeProgress({
    expectedVersion: '7',
    shots: '12',
    objectBallsPocketed: '4',
    scratches: '1',
  }), {
    expectedVersion: 7,
    shots: 12,
    objectBallsPocketed: 4,
    scratches: 1,
  });

  for (const [body, field] of [
    [{ expectedVersion: 0, shots: 1, objectBallsPocketed: 0, scratches: 0 }, 'expectedVersion'],
    [{ expectedVersion: 1, shots: 0, objectBallsPocketed: 0, scratches: 0 }, 'shots'],
    [{ expectedVersion: 1, shots: 1_001, objectBallsPocketed: 0, scratches: 0 }, 'shots'],
    [{ expectedVersion: 1, shots: 1.5, objectBallsPocketed: 0, scratches: 0 }, 'shots'],
    [{ expectedVersion: 1, shots: 1, objectBallsPocketed: 16, scratches: 0 }, 'objectBallsPocketed'],
    [{ expectedVersion: 1, shots: 1, objectBallsPocketed: 0, scratches: 2 }, 'scratches'],
    [{ expectedVersion: 1, shots: 1, objectBallsPocketed: 0, scratches: 0, tenantId: 'foreign' }, 'tenantId'],
    [{ expectedVersion: 1, shots: 1, objectBallsPocketed: 0, scratches: 0, ballState: [] }, 'ballState'],
  ] as const) {
    assert.throws(
      () => parseNinjaPoolPracticeProgress(body),
      (error: unknown) => error instanceof NinjaPoolPracticeValidationError
        && error.field === field,
    );
  }
});

test('history and abandon inputs stay strictly allowlisted and bounded', () => {
  assert.deepEqual(parseNinjaPoolPracticeListQuery(undefined), { limit: 8 });
  assert.deepEqual(parseNinjaPoolPracticeListQuery({ limit: '25' }), { limit: 25 });
  assert.deepEqual(parseNinjaPoolPracticeAbandon({ expectedVersion: '9' }), {
    expectedVersion: 9,
  });

  for (const invalid of [{ limit: 0 }, { limit: 26 }, { limit: 1.2 }, { tenantId: 'foreign' }]) {
    assert.throws(() => parseNinjaPoolPracticeListQuery(invalid), NinjaPoolPracticeValidationError);
  }
  assert.throws(
    () => parseNinjaPoolPracticeAbandon({ expectedVersion: 1, userId: 'another-user' }),
    (error: unknown) => error instanceof NinjaPoolPracticeValidationError
      && error.field === 'userId',
  );
});

test('practice progress represents exactly one new shot with monotonic counters', () => {
  const before = {
    status: 'active' as const,
    shots: 9,
    objectBallsPocketed: 3,
    scratches: 1,
  };

  assert.equal(assertNinjaPoolPracticeProgress(before, {
    expectedVersion: 4,
    shots: 10,
    objectBallsPocketed: 5,
    scratches: 2,
  }), 'active');
  assert.equal(assertNinjaPoolPracticeProgress(before, {
    expectedVersion: 4,
    shots: 10,
    objectBallsPocketed: 15,
    scratches: 1,
  }), 'completed');

  for (const progress of [
    { expectedVersion: 4, shots: 9, objectBallsPocketed: 3, scratches: 1 },
    { expectedVersion: 4, shots: 11, objectBallsPocketed: 3, scratches: 1 },
    { expectedVersion: 4, shots: 10, objectBallsPocketed: 2, scratches: 1 },
    { expectedVersion: 4, shots: 10, objectBallsPocketed: 3, scratches: 0 },
    { expectedVersion: 4, shots: 10, objectBallsPocketed: 3, scratches: 3 },
  ]) {
    assert.throws(
      () => assertNinjaPoolPracticeProgress(before, progress),
      (error: unknown) => error instanceof NinjaPoolPracticeStateError
        && error.statusCode === 409
        && error.code === 'INVALID_NINJA_POOL_PRACTICE_PROGRESS',
    );
  }
});

test('finalized sessions reject further progress', () => {
  for (const status of ['completed', 'abandoned'] as const) {
    assert.throws(
      () => assertNinjaPoolPracticeProgress({
        status,
        shots: 5,
        objectBallsPocketed: 2,
        scratches: 0,
      }, {
        expectedVersion: 2,
        shots: 6,
        objectBallsPocketed: 2,
        scratches: 0,
      }),
      (error: unknown) => error instanceof NinjaPoolPracticeStateError
        && error.statusCode === 409
        && error.code === 'NINJA_POOL_PRACTICE_FINALIZED',
    );
  }
});

test('version checks expose a structured 409 conflict without coercing invalid values', () => {
  assert.equal(parseNinjaPoolPracticeVersion('12'), 12);
  assert.doesNotThrow(() => assertNinjaPoolPracticeVersion(12, 12));
  assert.throws(
    () => assertNinjaPoolPracticeVersion(11, 12),
    (error: unknown) => error instanceof NinjaPoolPracticeVersionConflictError
      && error.statusCode === 409
      && error.code === 'NINJA_POOL_PRACTICE_VERSION_CONFLICT'
      && error.expectedVersion === 11
      && error.actualVersion === 12,
  );

  for (const invalid of [undefined, null, 0, -1, 1.5, '1.5', 'abc']) {
    assert.throws(
      () => parseNinjaPoolPracticeVersion(invalid),
      (error: unknown) => error instanceof NinjaPoolPracticeValidationError
        && error.field === 'expectedVersion',
    );
  }
});
