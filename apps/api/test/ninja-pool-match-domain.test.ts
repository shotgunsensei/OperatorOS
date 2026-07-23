import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_NINJA_POOL_PREFERENCES,
  NinjaPoolMatchValidationError,
  parseNinjaPoolChoice,
  parseNinjaPoolMatchAbandon,
  parseNinjaPoolMatchListQuery,
  parseNinjaPoolMatchStart,
  parseNinjaPoolProfileUpdate,
  parseNinjaPoolShot,
} from '../src/lib/ninja-pool-match.ts';

const validEvents = {
  pocketed: [3],
  firstContact: 3,
  cueHitCushion: false,
  cushionAfterContact: true,
  railsHitAfterContact: 2,
  objectBallsToRail: 1,
};

test('Ninja Pool profile accepts only bounded preferences and no authority fields', () => {
  assert.deepEqual(parseNinjaPoolProfileUpdate({
    expectedVersion: 0,
    displayName: '  Table Ninja  ',
    preferences: DEFAULT_NINJA_POOL_PREFERENCES,
  }), {
    expectedVersion: 0,
    displayName: 'Table Ninja',
    preferences: DEFAULT_NINJA_POOL_PREFERENCES,
  });

  for (const body of [
    { expectedVersion: 0, displayName: 'A', preferences: { ...DEFAULT_NINJA_POOL_PREFERENCES }, tenantId: 'foreign' },
    { expectedVersion: 0, displayName: '', preferences: DEFAULT_NINJA_POOL_PREFERENCES },
    { expectedVersion: 0, displayName: 'A', preferences: { ...DEFAULT_NINJA_POOL_PREFERENCES, tableSpeed: 2 } },
    { expectedVersion: 0, displayName: 'A', preferences: { ...DEFAULT_NINJA_POOL_PREFERENCES, sound: 'yes' } },
  ]) {
    assert.throws(() => parseNinjaPoolProfileUpdate(body), NinjaPoolMatchValidationError);
  }
});

test('match start permits only CPU and hot-seat modes with idempotency', () => {
  assert.deepEqual(parseNinjaPoolMatchStart({
    mode: 'bot',
    opponentName: 'CPU',
    clientStartId: 'start-12345678',
  }), {
    mode: 'bot',
    opponentName: 'CPU',
    clientStartId: 'start-12345678',
  });
  for (const body of [
    { mode: 'online', opponentName: 'Remote', clientStartId: 'start-12345678' },
    { mode: 'local', opponentName: 'P2', clientStartId: 'short' },
    { mode: 'local', opponentName: 'P2', clientStartId: 'start-12345678', userId: 'attacker' },
  ]) {
    assert.throws(() => parseNinjaPoolMatchStart(body), NinjaPoolMatchValidationError);
  }
});

test('shot facts are bounded, allowlisted, and reject impossible identifiers', () => {
  assert.deepEqual(parseNinjaPoolShot({
    expectedVersion: 2,
    clientShotId: 'shot-12345678',
    shooterSeat: 0,
    calledPocket: 5,
    eightPocket: 5,
    events: { ...validEvents, pocketed: [8] },
  }), {
    expectedVersion: 2,
    clientShotId: 'shot-12345678',
    shooterSeat: 0,
    calledPocket: 5,
    eightPocket: 5,
    events: { ...validEvents, pocketed: [8] },
  });

  assert.deepEqual(parseNinjaPoolShot({
    expectedVersion: 2,
    clientShotId: 'shot-12345679',
    shooterSeat: 0,
    calledPocket: 5,
    events: validEvents,
  }), {
    expectedVersion: 2,
    clientShotId: 'shot-12345679',
    shooterSeat: 0,
    calledPocket: 5,
    events: validEvents,
  });

  for (const body of [
    { expectedVersion: 2, clientShotId: 'shot-12345678', shooterSeat: 2, events: validEvents },
    { expectedVersion: 2, clientShotId: 'shot-12345678', shooterSeat: 0, events: { ...validEvents, pocketed: [3, 3] } },
    { expectedVersion: 2, clientShotId: 'shot-12345678', shooterSeat: 0, events: { ...validEvents, firstContact: 0 } },
    { expectedVersion: 2, clientShotId: 'shot-12345678', shooterSeat: 0, eightPocket: 2, events: validEvents },
    { expectedVersion: 2, clientShotId: 'shot-12345678', shooterSeat: 0, events: { ...validEvents, balls: [] } },
    { expectedVersion: 2, clientShotId: 'shot-12345678', shooterSeat: 0, events: validEvents, gameState: {} },
  ]) {
    assert.throws(() => parseNinjaPoolShot(body), NinjaPoolMatchValidationError);
  }
});

test('choice, abandon, and pagination contracts remain narrow', () => {
  assert.deepEqual(parseNinjaPoolChoice({
    expectedVersion: 4,
    clientActionId: 'choice-12345678',
    action: 'rerack',
  }), { expectedVersion: 4, clientActionId: 'choice-12345678', action: 'rerack' });
  assert.deepEqual(parseNinjaPoolMatchAbandon({ expectedVersion: 4 }), { expectedVersion: 4 });
  assert.deepEqual(parseNinjaPoolMatchListQuery({ limit: '100' }), { limit: 100 });
  assert.throws(() => parseNinjaPoolChoice({ expectedVersion: 4, clientActionId: 'choice-12345678', action: 'host' }), NinjaPoolMatchValidationError);
  assert.throws(() => parseNinjaPoolMatchAbandon({ expectedVersion: 4, tenantId: 'foreign' }), NinjaPoolMatchValidationError);
  assert.throws(() => parseNinjaPoolMatchListQuery({ limit: 101 }), NinjaPoolMatchValidationError);
});
