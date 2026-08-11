import { isDeepStrictEqual } from 'node:util';
import { acceptTable, applyShotResult, rerackAndBreak } from './ninja-pool-rules.js';
import {
  BALL_RADIUS,
  HEAD_STRING_X,
  PLAY_BOTTOM,
  PLAY_LEFT,
  PLAY_RIGHT,
  PLAY_TOP,
  findFreeSpot,
  makeInitialBalls,
  simulateShot,
} from './ninja-pool-physics.js';
import type { GameState, Settings, Shot, ShotEvents } from './ninja-pool-game.js';

export const NINJA_POOL_ROOM_TTL_MS = 60 * 60 * 1_000;
export const NINJA_POOL_ROOM_RECONNECT_MS = 5 * 60 * 1_000;
export const NINJA_POOL_ROOM_STARTS_PER_HOUR = 10;
// A player cannot physically sustain this cadence through the animated UI,
// while the ceiling still blocks automated shot floods without preventing a
// fast deterministic rack from completing inside one release-test window.
export const NINJA_POOL_ROOM_SHOTS_PER_MINUTE = 30;
export const NINJA_POOL_ROOM_MAX_SHOTS = 500;
export const NINJA_POOL_WS_MAX_MESSAGE_BYTES = 16_384;
export const NINJA_POOL_WS_MESSAGES_PER_10_SECONDS = 40;

export type NinjaPoolOnlineRole = 'host' | 'guest';
export type NinjaPoolOnlineStatus = 'waiting' | 'active' | 'completed' | 'abandoned' | 'expired';

export interface NinjaPoolPendingShot {
  expectedVersion: number;
  clientShotId: string;
  shooterSeat: 0 | 1;
  shot: Shot;
  requestedByUserId: string;
}

export type NinjaPoolClientMessage =
  | { type: 'stateRequest'; knownVersion?: number; knownSequence?: number }
  | { type: 'shotIntent'; expectedVersion: number; clientShotId: string; shot: Shot }
  | { type: 'hostShotResult'; expectedVersion: number; clientShotId: string; shooterSeat: 0 | 1; shot: Shot; resultHash: string }
  | { type: 'choice'; expectedVersion: number; clientActionId: string; action: 'accept' | 'rerack' }
  | { type: 'leave' }
  | { type: 'ping'; t: number };

export class NinjaPoolOnlineValidationError extends Error {
  readonly statusCode = 400;
  readonly code = 'INVALID_NINJA_POOL_ONLINE_INPUT';
  constructor(message: string, readonly field?: string) {
    super(message);
    this.name = 'NinjaPoolOnlineValidationError';
  }
}

function record(value: unknown, field = 'message'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new NinjaPoolOnlineValidationError(`${field} must be an object`, field);
  }
  return value as Record<string, unknown>;
}

function knownFields(value: Record<string, unknown>, fields: readonly string[]): void {
  const allowed = new Set(fields);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) throw new NinjaPoolOnlineValidationError(`${field} is not accepted`, field);
  }
}

function integer(value: unknown, field: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
    throw new NinjaPoolOnlineValidationError(`${field} must be a whole number from ${min} to ${max}`, field);
  }
  return Number(value);
}

function finite(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new NinjaPoolOnlineValidationError(`${field} must be a finite number from ${min} to ${max}`, field);
  }
  return value;
}

function clientActionId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(value)) {
    throw new NinjaPoolOnlineValidationError(`${field} has an invalid format`, field);
  }
  return value;
}

function parseShot(value: unknown): Shot {
  const body = record(value, 'shot');
  knownFields(body, ['angle', 'power', 'tipOffset', 'cuePlacement', 'calledPocket']);
  const rawAngle = finite(body.angle, 'shot.angle', -Math.PI * 1_000, Math.PI * 1_000);
  // Room messages are parsed once from the guest and again when the host
  // returns that authenticated intent. Preserve already-canonical angles so
  // the second pass cannot introduce an IEEE-754 one-ulp drift.
  const normalizedAngle = rawAngle >= -Math.PI && rawAngle <= Math.PI
    ? rawAngle
    : Math.atan2(Math.sin(rawAngle), Math.cos(rawAngle));
  const shot: Shot = {
    angle: normalizedAngle,
    power: finite(body.power, 'shot.power', 0.05, 1),
  };
  if (body.tipOffset !== undefined) {
    const tip = record(body.tipOffset, 'shot.tipOffset');
    knownFields(tip, ['x', 'y']);
    const x = finite(tip.x, 'shot.tipOffset.x', -1, 1);
    const y = finite(tip.y, 'shot.tipOffset.y', -1, 1);
    if (x * x + y * y > 1.000001) {
      throw new NinjaPoolOnlineValidationError('shot.tipOffset must stay on the cue-ball face', 'shot.tipOffset');
    }
    shot.tipOffset = { x, y };
  }
  if (body.cuePlacement !== undefined) {
    const placement = record(body.cuePlacement, 'shot.cuePlacement');
    knownFields(placement, ['x', 'y']);
    shot.cuePlacement = {
      x: finite(placement.x, 'shot.cuePlacement.x', PLAY_LEFT + BALL_RADIUS, PLAY_RIGHT - BALL_RADIUS),
      y: finite(placement.y, 'shot.cuePlacement.y', PLAY_TOP + BALL_RADIUS, PLAY_BOTTOM - BALL_RADIUS),
    };
  }
  if (body.calledPocket !== undefined) {
    shot.calledPocket = integer(body.calledPocket, 'shot.calledPocket', 0, 5);
  }
  return shot;
}

export function validateOnlineShotForState(state: GameState, shot: Shot): void {
  if (state.gameOver) throw new NinjaPoolOnlineValidationError('The rack is already complete', 'shot');
  if (state.pendingChoice) throw new NinjaPoolOnlineValidationError('A rules choice is required before shooting', 'shot');
  if (shot.cuePlacement && !state.ballInHand) {
    throw new NinjaPoolOnlineValidationError('Cue placement is only allowed with ball in hand', 'shot.cuePlacement');
  }
  if (state.ballInHand && !shot.cuePlacement) {
    throw new NinjaPoolOnlineValidationError('Cue placement is required with ball in hand', 'shot.cuePlacement');
  }
  if (shot.cuePlacement) {
    if (state.ballInHandBehindHeadString && shot.cuePlacement.x > HEAD_STRING_X) {
      throw new NinjaPoolOnlineValidationError('Cue placement must remain behind the head string', 'shot.cuePlacement');
    }
    const legal = findFreeSpot(state, shot.cuePlacement);
    if (Math.hypot(legal.x - shot.cuePlacement.x, legal.y - shot.cuePlacement.y) > 0.001) {
      throw new NinjaPoolOnlineValidationError('Cue placement overlaps a ball or cushion', 'shot.cuePlacement');
    }
  }
}

export function parseNinjaPoolRoomCreate(input: unknown): { clientRoomId: string } {
  const body = record(input, 'body');
  knownFields(body, ['clientRoomId']);
  return { clientRoomId: clientActionId(body.clientRoomId, 'clientRoomId') };
}

export function parseNinjaPoolRoomJoin(input: unknown): { code: string } {
  const body = record(input, 'body');
  knownFields(body, ['code']);
  if (typeof body.code !== 'string' || !/^[A-HJ-NP-Z2-9]{4}$/.test(body.code.trim().toUpperCase())) {
    throw new NinjaPoolOnlineValidationError('code must be a four-character room code', 'code');
  }
  return { code: body.code.trim().toUpperCase() };
}

export function parseNinjaPoolClientMessage(input: unknown): NinjaPoolClientMessage {
  const body = record(input);
  if (body.type === 'stateRequest') {
    knownFields(body, ['type', 'knownVersion', 'knownSequence']);
    return {
      type: 'stateRequest',
      ...(body.knownVersion === undefined ? {} : { knownVersion: integer(body.knownVersion, 'knownVersion', 0, 2_147_483_647) }),
      ...(body.knownSequence === undefined ? {} : { knownSequence: integer(body.knownSequence, 'knownSequence', 0, 2_147_483_647) }),
    };
  }
  if (body.type === 'shotIntent') {
    knownFields(body, ['type', 'expectedVersion', 'clientShotId', 'shot']);
    return {
      type: 'shotIntent',
      expectedVersion: integer(body.expectedVersion, 'expectedVersion', 1, 2_147_483_647),
      clientShotId: clientActionId(body.clientShotId, 'clientShotId'),
      shot: parseShot(body.shot),
    };
  }
  if (body.type === 'hostShotResult') {
    knownFields(body, ['type', 'expectedVersion', 'clientShotId', 'shooterSeat', 'shot', 'resultHash']);
    if (typeof body.resultHash !== 'string' || !/^[a-f0-9]{8}$/.test(body.resultHash)) {
      throw new NinjaPoolOnlineValidationError('resultHash must be an eight-character deterministic hash', 'resultHash');
    }
    return {
      type: 'hostShotResult',
      expectedVersion: integer(body.expectedVersion, 'expectedVersion', 1, 2_147_483_647),
      clientShotId: clientActionId(body.clientShotId, 'clientShotId'),
      shooterSeat: integer(body.shooterSeat, 'shooterSeat', 0, 1) as 0 | 1,
      shot: parseShot(body.shot),
      resultHash: body.resultHash,
    };
  }
  if (body.type === 'choice') {
    knownFields(body, ['type', 'expectedVersion', 'clientActionId', 'action']);
    if (body.action !== 'accept' && body.action !== 'rerack') {
      throw new NinjaPoolOnlineValidationError('action must be accept or rerack', 'action');
    }
    return {
      type: 'choice',
      expectedVersion: integer(body.expectedVersion, 'expectedVersion', 1, 2_147_483_647),
      clientActionId: clientActionId(body.clientActionId, 'clientActionId'),
      action: body.action,
    };
  }
  if (body.type === 'leave') {
    knownFields(body, ['type']);
    return { type: 'leave' };
  }
  if (body.type === 'ping') {
    knownFields(body, ['type', 't']);
    return { type: 'ping', t: finite(body.t, 't', 0, Number.MAX_SAFE_INTEGER) };
  }
  throw new NinjaPoolOnlineValidationError('Unknown room message type', 'type');
}

function rounded(value: number): number {
  if (Object.is(value, -0)) return 0;
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}

export function canonicalOnlineState(state: GameState): Record<string, unknown> {
  return {
    balls: [...state.balls].sort((left, right) => left.id - right.id).map((ball) => ({
      id: ball.id,
      pos: { x: rounded(ball.pos.x), y: rounded(ball.pos.y) },
      vel: { x: rounded(ball.vel.x), y: rounded(ball.vel.y) },
      inPocket: ball.inPocket,
    })),
    currentPlayer: state.currentPlayer,
    players: state.players.map((player) => ({ name: player.name, group: player.group })),
    ballInHand: state.ballInHand,
    ballInHandBehindHeadString: state.ballInHandBehindHeadString ?? false,
    groupsAssigned: state.groupsAssigned,
    gameOver: state.gameOver,
    shotCount: state.shotCount,
    consecutiveFouls: state.consecutiveFouls ?? [0, 0],
    pendingChoice: state.pendingChoice ?? null,
  };
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function hashOnlineResult(state: GameState, events: ShotEvents | null = null): string {
  return fnv1a(JSON.stringify({ state: canonicalOnlineState(state), events }));
}

export function simulateOnlineShot(
  state: GameState,
  shot: Shot,
  settings: Settings,
): { state: GameState; events: ShotEvents; ticks: number; resultHash: string } {
  validateOnlineShotForState(state, shot);
  const simulation = simulateShot(state, shot, { tableSpeed: settings.tableSpeed });
  const resolved = applyShotResult(
    state,
    simulation.finalState,
    simulation.events,
    settings,
    shot.calledPocket === undefined ? undefined : { calledPocket: shot.calledPocket },
  );
  return {
    state: resolved.state,
    events: simulation.events,
    ticks: simulation.ticks,
    resultHash: hashOnlineResult(resolved.state, simulation.events),
  };
}

export function samePendingShot(left: NinjaPoolPendingShot, right: NinjaPoolPendingShot): boolean {
  return left.expectedVersion === right.expectedVersion
    && left.clientShotId === right.clientShotId
    && left.shooterSeat === right.shooterSeat
    && left.requestedByUserId === right.requestedByUserId
    && isDeepStrictEqual(left.shot, right.shot);
}

export function applyOnlineChoice(state: GameState, action: 'accept' | 'rerack'): GameState {
  if (!state.pendingChoice) throw new NinjaPoolOnlineValidationError('No rules choice is pending', 'action');
  return action === 'accept' ? acceptTable(state) : rerackAndBreak(state, makeInitialBalls());
}
