import type { GameState, ShotEvents } from './ninja-pool-game.js';

export const NINJA_POOL_MATCH_MODES = ['bot', 'local'] as const;
export const NINJA_POOL_MATCH_STATUSES = ['active', 'completed', 'abandoned'] as const;
export type NinjaPoolMatchMode = (typeof NINJA_POOL_MATCH_MODES)[number];
export type NinjaPoolMatchStatus = (typeof NINJA_POOL_MATCH_STATUSES)[number];

export const NINJA_POOL_MATCH_STARTS_PER_HOUR = 20;
export const NINJA_POOL_MATCH_HISTORY_LIMIT = 100;
export const NINJA_POOL_MAX_MATCH_SHOTS = 500;

export interface NinjaPoolRulePreferences {
  aimGuide: boolean;
  tableSpeed: number;
  sound: boolean;
  vibration: boolean;
  callShotOn8: boolean;
  threeFoulRule: boolean;
}

export const DEFAULT_NINJA_POOL_PREFERENCES: NinjaPoolRulePreferences = {
  aimGuide: true,
  tableSpeed: 1,
  sound: true,
  vibration: true,
  callShotOn8: false,
  threeFoulRule: false,
};

export interface NinjaPoolStartInput {
  mode: NinjaPoolMatchMode;
  opponentName: string;
  clientStartId: string;
}

export interface NinjaPoolShotInput {
  expectedVersion: number;
  clientShotId: string;
  shooterSeat: 0 | 1;
  calledPocket?: number;
  eightPocket?: number;
  events: ShotEvents;
}

export interface NinjaPoolChoiceInput {
  expectedVersion: number;
  clientActionId: string;
  action: 'accept' | 'rerack';
}

export class NinjaPoolMatchValidationError extends Error {
  readonly statusCode = 400;
  readonly code = 'INVALID_NINJA_POOL_MATCH_INPUT';

  constructor(message: string, readonly field?: string) {
    super(message);
    this.name = 'NinjaPoolMatchValidationError';
  }
}

export class NinjaPoolMatchConflictError extends Error {
  readonly statusCode = 409;

  constructor(
    message: string,
    readonly code:
      | 'NINJA_POOL_MATCH_VERSION_CONFLICT'
      | 'NINJA_POOL_MATCH_FINALIZED'
      | 'NINJA_POOL_MATCH_TURN_CONFLICT'
      | 'NINJA_POOL_MATCH_CHOICE_REQUIRED',
  ) {
    super(message);
    this.name = 'NinjaPoolMatchConflictError';
  }
}

function record(input: unknown, allowMissing = false): Record<string, unknown> {
  if (allowMissing && (input === undefined || input === null || input === '')) return {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new NinjaPoolMatchValidationError('Request body must be an object');
  }
  return input as Record<string, unknown>;
}

function knownFields(body: Record<string, unknown>, fields: readonly string[]): void {
  const accepted = new Set(fields);
  for (const field of Object.keys(body)) {
    if (!accepted.has(field)) {
      throw new NinjaPoolMatchValidationError(`${field} is not accepted by the Ninja Pool contract`, field);
    }
  }
}

function text(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== 'string') {
    throw new NinjaPoolMatchValidationError(`${field} must be text`, field);
  }
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < min || normalized.length > max) {
    throw new NinjaPoolMatchValidationError(`${field} must be ${min}-${max} characters`, field);
  }
  return normalized;
}

function integer(value: unknown, field: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
    throw new NinjaPoolMatchValidationError(`${field} must be a whole number from ${min} to ${max}`, field);
  }
  return Number(value);
}

function bool(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new NinjaPoolMatchValidationError(`${field} must be true or false`, field);
  }
  return value;
}

function clientId(value: unknown, field: string): string {
  const normalized = text(value, field, 8, 160);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(normalized)) {
    throw new NinjaPoolMatchValidationError(`${field} has an invalid format`, field);
  }
  return normalized;
}

export function parseNinjaPoolProfileUpdate(input: unknown): {
  expectedVersion: number;
  displayName: string;
  preferences: NinjaPoolRulePreferences;
} {
  const body = record(input);
  knownFields(body, ['expectedVersion', 'displayName', 'preferences']);
  const preferences = record(body.preferences);
  knownFields(preferences, [
    'aimGuide',
    'tableSpeed',
    'sound',
    'vibration',
    'callShotOn8',
    'threeFoulRule',
  ]);
  const tableSpeed = typeof preferences.tableSpeed === 'number' ? preferences.tableSpeed : Number.NaN;
  if (!Number.isFinite(tableSpeed) || tableSpeed < 0.6 || tableSpeed > 1.4) {
    throw new NinjaPoolMatchValidationError('tableSpeed must be from 0.6 to 1.4', 'tableSpeed');
  }
  return {
    expectedVersion: integer(body.expectedVersion, 'expectedVersion', 0, 2_147_483_647),
    displayName: text(body.displayName, 'displayName', 1, 40),
    preferences: {
      aimGuide: bool(preferences.aimGuide, 'aimGuide'),
      tableSpeed,
      sound: bool(preferences.sound, 'sound'),
      vibration: bool(preferences.vibration, 'vibration'),
      callShotOn8: bool(preferences.callShotOn8, 'callShotOn8'),
      threeFoulRule: bool(preferences.threeFoulRule, 'threeFoulRule'),
    },
  };
}

export function parseNinjaPoolMatchStart(input: unknown): NinjaPoolStartInput {
  const body = record(input);
  knownFields(body, ['mode', 'opponentName', 'clientStartId']);
  if (body.mode !== 'bot' && body.mode !== 'local') {
    throw new NinjaPoolMatchValidationError('mode must be bot or local', 'mode');
  }
  return {
    mode: body.mode,
    opponentName: text(body.opponentName, 'opponentName', 1, 40),
    clientStartId: clientId(body.clientStartId, 'clientStartId'),
  };
}

export function parseNinjaPoolShot(input: unknown): NinjaPoolShotInput {
  const body = record(input);
  knownFields(body, ['expectedVersion', 'clientShotId', 'shooterSeat', 'calledPocket', 'eightPocket', 'events']);
  const events = record(body.events);
  knownFields(events, [
    'pocketed',
    'firstContact',
    'cueHitCushion',
    'cushionAfterContact',
    'railsHitAfterContact',
    'objectBallsToRail',
  ]);
  if (!Array.isArray(events.pocketed) || events.pocketed.length > 16) {
    throw new NinjaPoolMatchValidationError('events.pocketed must contain at most 16 ball IDs', 'pocketed');
  }
  const pocketed = events.pocketed.map((id) => integer(id, 'pocketed', 0, 15));
  if (new Set(pocketed).size !== pocketed.length) {
    throw new NinjaPoolMatchValidationError('events.pocketed must not contain duplicates', 'pocketed');
  }
  if (body.eightPocket !== undefined && !pocketed.includes(8)) {
    throw new NinjaPoolMatchValidationError(
      'eightPocket is only valid when the 8 ball was pocketed',
      'eightPocket',
    );
  }
  const firstContact = events.firstContact === null
    ? null
    : integer(events.firstContact, 'firstContact', 1, 15);
  return {
    expectedVersion: integer(body.expectedVersion, 'expectedVersion', 1, 2_147_483_647),
    clientShotId: clientId(body.clientShotId, 'clientShotId'),
    shooterSeat: integer(body.shooterSeat, 'shooterSeat', 0, 1) as 0 | 1,
    ...(body.calledPocket === undefined
      ? {}
      : { calledPocket: integer(body.calledPocket, 'calledPocket', 0, 5) }),
    ...(body.eightPocket === undefined
      ? {}
      : { eightPocket: integer(body.eightPocket, 'eightPocket', 0, 5) }),
    events: {
      pocketed,
      firstContact,
      cueHitCushion: bool(events.cueHitCushion, 'cueHitCushion'),
      cushionAfterContact: bool(events.cushionAfterContact, 'cushionAfterContact'),
      railsHitAfterContact: integer(events.railsHitAfterContact, 'railsHitAfterContact', 0, 100),
      objectBallsToRail: integer(events.objectBallsToRail, 'objectBallsToRail', 0, 15),
    },
  };
}

export function parseNinjaPoolChoice(input: unknown): NinjaPoolChoiceInput {
  const body = record(input);
  knownFields(body, ['expectedVersion', 'clientActionId', 'action']);
  if (body.action !== 'accept' && body.action !== 'rerack') {
    throw new NinjaPoolMatchValidationError('action must be accept or rerack', 'action');
  }
  return {
    expectedVersion: integer(body.expectedVersion, 'expectedVersion', 1, 2_147_483_647),
    clientActionId: clientId(body.clientActionId, 'clientActionId'),
    action: body.action,
  };
}

export function parseNinjaPoolMatchAbandon(input: unknown): { expectedVersion: number } {
  const body = record(input);
  knownFields(body, ['expectedVersion']);
  return {
    expectedVersion: integer(body.expectedVersion, 'expectedVersion', 1, 2_147_483_647),
  };
}

export function parseNinjaPoolMatchListQuery(input: unknown): { limit: number } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { limit: 20 };
  const query = input as Record<string, unknown>;
  knownFields(query, ['limit']);
  if (query.limit === undefined || query.limit === '') return { limit: 20 };
  const value = typeof query.limit === 'string' && /^\d+$/.test(query.limit)
    ? Number(query.limit)
    : query.limit;
  return { limit: integer(value, 'limit', 1, NINJA_POOL_MATCH_HISTORY_LIMIT) };
}

export function toStoredLogicalState(state: GameState): GameState {
  return {
    ...state,
    balls: state.balls.map((ball) => ({
      id: ball.id,
      pos: { x: ball.pos.x, y: ball.pos.y },
      vel: { x: 0, y: 0 },
      inPocket: ball.inPocket,
    })),
  };
}
