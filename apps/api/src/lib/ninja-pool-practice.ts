/**
 * Server contract for Operator Pool Hall's first shared-runtime workflow.
 *
 * The actual pool simulation stays local and deterministic in the browser.
 * These parsers accept only bounded progress summaries; they never accept
 * tenant/user authority, ball coordinates, arbitrary game state, or scores
 * suitable for a competitive leaderboard.
 */

export const NINJA_POOL_PRACTICE_STATUSES = [
  'active',
  'completed',
  'abandoned',
] as const;

export type NinjaPoolPracticeStatus = (typeof NINJA_POOL_PRACTICE_STATUSES)[number];

export const NINJA_POOL_OBJECT_BALL_COUNT = 15;
export const NINJA_POOL_MAX_SESSION_SHOTS = 1_000;
export const NINJA_POOL_HISTORY_DEFAULT_LIMIT = 8;
export const NINJA_POOL_HISTORY_MAX_LIMIT = 25;
export const NINJA_POOL_STARTS_PER_HOUR = 10;
export const NINJA_POOL_RETAINED_SESSIONS = 100;

export type NinjaPoolPracticeValidationCode =
  | 'INVALID_NINJA_POOL_PRACTICE_INPUT'
  | 'INVALID_NINJA_POOL_PRACTICE_PROGRESS';

export class NinjaPoolPracticeValidationError extends Error {
  readonly statusCode = 400;

  constructor(
    message: string,
    readonly field?: string,
    readonly code: NinjaPoolPracticeValidationCode = 'INVALID_NINJA_POOL_PRACTICE_INPUT',
  ) {
    super(message);
    this.name = 'NinjaPoolPracticeValidationError';
  }
}

export class NinjaPoolPracticeVersionConflictError extends Error {
  readonly statusCode = 409;
  readonly code = 'NINJA_POOL_PRACTICE_VERSION_CONFLICT';

  constructor(
    readonly expectedVersion: number,
    readonly actualVersion: number,
  ) {
    super(`Practice session version ${expectedVersion} is stale; current version is ${actualVersion}`);
    this.name = 'NinjaPoolPracticeVersionConflictError';
  }
}

export class NinjaPoolPracticeStateError extends Error {
  readonly statusCode = 409;

  constructor(
    message: string,
    readonly code: 'NINJA_POOL_PRACTICE_FINALIZED' | 'INVALID_NINJA_POOL_PRACTICE_PROGRESS',
  ) {
    super(message);
    this.name = 'NinjaPoolPracticeStateError';
  }
}

export interface NinjaPoolPracticeProgressInput {
  expectedVersion: number;
  shots: number;
  objectBallsPocketed: number;
  scratches: number;
}

export interface NinjaPoolPracticeAbandonInput {
  expectedVersion: number;
}

export interface NinjaPoolPracticeListQuery {
  limit: number;
}

function objectRecord(input: unknown, allowMissing = false): Record<string, unknown> {
  if (allowMissing && (input === undefined || input === null || input === '')) return {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new NinjaPoolPracticeValidationError('Request body must be an object');
  }
  return input as Record<string, unknown>;
}

function assertKnownFields(body: Record<string, unknown>, fields: ReadonlySet<string>): void {
  for (const field of Object.keys(body)) {
    if (!fields.has(field)) {
      throw new NinjaPoolPracticeValidationError(
        `${field} is not accepted by the Ninja Pool practice contract`,
        field,
      );
    }
  }
}

function wholeNumber(value: unknown, field: string, min: number, max: number): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^\d+$/.test(value.trim())
      ? Number(value.trim())
      : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new NinjaPoolPracticeValidationError(
      `${field} must be a whole number from ${min} to ${max}`,
      field,
    );
  }
  return parsed;
}

export function parseNinjaPoolPracticeVersion(value: unknown): number {
  return wholeNumber(value, 'expectedVersion', 1, 2_147_483_647);
}

export function parseNinjaPoolPracticeStart(input: unknown): Record<string, never> {
  const body = objectRecord(input, true);
  assertKnownFields(body, new Set());
  return {};
}

export function parseNinjaPoolPracticeProgress(
  input: unknown,
): NinjaPoolPracticeProgressInput {
  const body = objectRecord(input);
  assertKnownFields(body, new Set([
    'expectedVersion',
    'shots',
    'objectBallsPocketed',
    'scratches',
  ]));
  const shots = wholeNumber(body.shots, 'shots', 1, NINJA_POOL_MAX_SESSION_SHOTS);
  const objectBallsPocketed = wholeNumber(
    body.objectBallsPocketed,
    'objectBallsPocketed',
    0,
    NINJA_POOL_OBJECT_BALL_COUNT,
  );
  const scratches = wholeNumber(body.scratches, 'scratches', 0, shots);
  return {
    expectedVersion: parseNinjaPoolPracticeVersion(body.expectedVersion),
    shots,
    objectBallsPocketed,
    scratches,
  };
}

export function parseNinjaPoolPracticeAbandon(
  input: unknown,
): NinjaPoolPracticeAbandonInput {
  const body = objectRecord(input);
  assertKnownFields(body, new Set(['expectedVersion']));
  return { expectedVersion: parseNinjaPoolPracticeVersion(body.expectedVersion) };
}

export function parseNinjaPoolPracticeListQuery(input: unknown): NinjaPoolPracticeListQuery {
  if (input === undefined || input === null || input === '') {
    return { limit: NINJA_POOL_HISTORY_DEFAULT_LIMIT };
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new NinjaPoolPracticeValidationError('Query must be an object');
  }
  const query = input as Record<string, unknown>;
  assertKnownFields(query, new Set(['limit']));
  return {
    limit: query.limit === undefined || query.limit === ''
      ? NINJA_POOL_HISTORY_DEFAULT_LIMIT
      : wholeNumber(query.limit, 'limit', 1, NINJA_POOL_HISTORY_MAX_LIMIT),
  };
}

export function assertNinjaPoolPracticeVersion(
  expectedVersion: number,
  actualVersion: number,
): void {
  const expected = parseNinjaPoolPracticeVersion(expectedVersion);
  const actual = parseNinjaPoolPracticeVersion(actualVersion);
  if (expected !== actual) {
    throw new NinjaPoolPracticeVersionConflictError(expected, actual);
  }
}

export function assertNinjaPoolPracticeProgress(
  before: {
    status: NinjaPoolPracticeStatus;
    shots: number;
    objectBallsPocketed: number;
    scratches: number;
  },
  progress: NinjaPoolPracticeProgressInput,
): NinjaPoolPracticeStatus {
  if (before.status !== 'active') {
    throw new NinjaPoolPracticeStateError(
      'Practice session is already finalized',
      'NINJA_POOL_PRACTICE_FINALIZED',
    );
  }
  const oneNewShot = progress.shots === before.shots + 1;
  const ballsAreMonotonic = progress.objectBallsPocketed >= before.objectBallsPocketed;
  const scratchesAreMonotonic = progress.scratches >= before.scratches
    && progress.scratches <= before.scratches + 1;
  if (!oneNewShot || !ballsAreMonotonic || !scratchesAreMonotonic) {
    throw new NinjaPoolPracticeStateError(
      'Practice progress must represent exactly one new local shot with monotonic counters',
      'INVALID_NINJA_POOL_PRACTICE_PROGRESS',
    );
  }
  return progress.objectBallsPocketed === NINJA_POOL_OBJECT_BALL_COUNT
    ? 'completed'
    : 'active';
}
