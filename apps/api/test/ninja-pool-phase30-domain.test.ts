import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseBotShot, createSeededRandom } from '../../web/src/lib/ninja-pool-hall/bot.ts';
import { simulateOnlineShot as simulateBrowserShot } from '../../web/src/lib/ninja-pool-hall/online.ts';
import { HEAD_SPOT, findFreeSpot, makeInitialBalls } from '../src/lib/ninja-pool-physics.ts';
import { acceptTable, makeInitialGameState } from '../src/lib/ninja-pool-rules.ts';
import {
  NinjaPoolOnlineValidationError,
  parseNinjaPoolClientMessage,
  samePendingShot,
  simulateOnlineShot,
  validateOnlineShotForState,
} from '../src/lib/ninja-pool-online.ts';
import type { Settings, Shot } from '../src/lib/ninja-pool-game.ts';

const settings: Settings = {
  aimGuide: true,
  tableSpeed: 1,
  sound: false,
  vibration: false,
  callShotOn8: false,
  threeFoulRule: false,
};

const goldenShots: Array<{ shot: Shot; hash: string; ticks: number }> = [
  { shot: { angle: 0, power: 0.55 }, hash: '9500fdfc', ticks: 571 },
  { shot: { angle: 0.03125, power: 0.72, tipOffset: { x: 0.2, y: -0.3 } }, hash: 'f16e433d', ticks: 546 },
  { shot: { angle: -0.11, power: 0.9, tipOffset: { x: -0.4, y: 0.15 } }, hash: '94804045', ticks: 859 },
  { shot: { angle: 0.42, power: 0.33, tipOffset: { x: 0.1, y: 0.1 } }, hash: 'd3313ecd', ticks: 803 },
];

test('Phase 30 fixed initial states produce golden cross-runtime physics and rule hashes', () => {
  for (const fixture of goldenShots) {
    const state = makeInitialGameState(makeInitialBalls(), ['Host', 'Guest']);
    const server = simulateOnlineShot(state, fixture.shot, settings);
    const browser = simulateBrowserShot(state, fixture.shot, settings);
    assert.equal(server.resultHash, fixture.hash);
    assert.equal(server.ticks, fixture.ticks);
    assert.deepEqual(browser.state, server.state);
    assert.deepEqual(browser.events, server.events);
    assert.equal(browser.resultHash, server.resultHash);
  }
});

test('Phase 30 chained scratch resolution keeps browser and API cue placement identical', () => {
  const initial = makeInitialGameState(makeInitialBalls(), ['Host', 'Guest']);
  const breakShot: Shot = { angle: 0.020510791102664284, power: 0.9, tipOffset: { x: 0, y: 0 } };
  const guestShot: Shot = { angle: -2.9648882598199773, power: 0.51, tipOffset: { x: 0, y: 0 } };
  const afterBreak = simulateOnlineShot(initial, breakShot, settings).state;
  const server = simulateOnlineShot(afterBreak, guestShot, settings);
  const browser = simulateBrowserShot(afterBreak, guestShot, settings);
  assert.deepEqual(server.events.pocketed, [1, 0]);
  assert.deepEqual(server.state, browser.state);
  assert.equal(server.resultHash, browser.resultHash);
  assert.deepEqual(server.state.balls.find((ball) => ball.id === 0)?.pos, HEAD_SPOT);
});

test('Phase 30 rejects malformed, impossible, and authority-expanding shot messages', () => {
  const state = makeInitialGameState(makeInitialBalls(), ['Host', 'Guest']);
  assert.throws(() => parseNinjaPoolClientMessage({
    type: 'shotIntent', expectedVersion: 1, clientShotId: 'shot-valid-0001',
    shot: { angle: 0, power: 5 },
  }), NinjaPoolOnlineValidationError);
  assert.throws(() => parseNinjaPoolClientMessage({
    type: 'hostShotResult', expectedVersion: 1, clientShotId: 'shot-valid-0002',
    shooterSeat: 0, shot: { angle: 0, power: 0.5 }, resultHash: 'not-a-hash', tenantId: 'forged',
  }), NinjaPoolOnlineValidationError);
  assert.throws(() => validateOnlineShotForState(state, {
    angle: 0, power: 0.5, cuePlacement: HEAD_SPOT,
  }), /only allowed with ball in hand/i);
  state.ballInHand = true;
  state.ballInHandBehindHeadString = true;
  assert.throws(() => validateOnlineShotForState(state, { angle: 0, power: 0.5 }), /placement is required/i);
  assert.throws(() => validateOnlineShotForState(state, {
    angle: 0, power: 0.5, cuePlacement: { x: 700, y: 250 },
  }), /behind the head string/i);
});

test('Phase 30 preserves an authenticated guest shot across the host relay parse', () => {
  const clientShotId = 'shot-relay-angle-0001';
  const guest = parseNinjaPoolClientMessage({
    type: 'shotIntent', expectedVersion: 16, clientShotId,
    shot: { angle: 0.17789771518802425, power: 0.55, tipOffset: { x: 0, y: 0 } },
  });
  assert.equal(guest.type, 'shotIntent');
  if (guest.type !== 'shotIntent') return;
  const host = parseNinjaPoolClientMessage({
    type: 'hostShotResult', expectedVersion: guest.expectedVersion, clientShotId,
    shooterSeat: 1, shot: guest.shot, resultHash: '1234abcd',
  });
  assert.equal(host.type, 'hostShotResult');
  if (host.type !== 'hostShotResult') return;
  assert.equal(host.shot.angle, guest.shot.angle);
  assert.equal(samePendingShot({
    expectedVersion: guest.expectedVersion,
    clientShotId,
    shooterSeat: 1,
    shot: guest.shot,
    requestedByUserId: 'guest-user',
  }, {
    expectedVersion: host.expectedVersion,
    clientShotId,
    shooterSeat: host.shooterSeat,
    shot: host.shot,
    requestedByUserId: 'guest-user',
  }), true);
});

test('CPU players complete a deterministic rack with bounded shots and source-correct illegal 8-ball enforcement', () => {
  let state = makeInitialGameState(makeInitialBalls(), ['CPU A', 'CPU B']);
  const started = performance.now();
  for (let shotCount = 0; shotCount < 100 && !state.gameOver; shotCount += 1) {
    if (state.pendingChoice) state = acceptTable(state);
    let shot = chooseBotShot(state, createSeededRandom(3 + state.shotCount * 17 + state.currentPlayer));
    if (state.ballInHand) shot = { ...shot, cuePlacement: findFreeSpot(state, HEAD_SPOT) };
    validateOnlineShotForState(state, shot);
    state = simulateOnlineShot(state, shot, settings).state;
  }
  assert.deepEqual(state.gameOver, { winner: 0, reason: 'Pocketed the 8 ball before clearing your group' });
  assert.equal(state.shotCount, 14);
  assert.ok(performance.now() - started < 2_000, 'deterministic full-rack simulation exceeded its test performance budget');
});
