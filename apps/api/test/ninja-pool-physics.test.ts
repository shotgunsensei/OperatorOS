import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BALL_RADIUS,
  HEAD_SPOT,
  PLAY_BOTTOM,
  PLAY_LEFT,
  PLAY_RIGHT,
  PLAY_TOP,
  makeInitialBalls,
  predictAim,
  simulateShot,
} from '../../web/src/lib/ninja-pool-hall/physics.ts';
import type { GameState } from '../../web/src/lib/ninja-pool-hall/types.ts';

function practiceState(): GameState {
  return {
    balls: makeInitialBalls(),
    currentPlayer: 0,
    players: [
      { name: 'You', group: null },
      { name: 'Practice', group: null },
    ],
    ballInHand: false,
    groupsAssigned: false,
    gameOver: null,
    shotCount: 0,
    consecutiveFouls: [0, 0],
    pendingChoice: null,
  };
}

test('promoted engine builds a complete, stationary standard rack', () => {
  const balls = makeInitialBalls();
  assert.equal(balls.length, 16);
  assert.deepEqual([...balls.map((ball) => ball.id)].sort((a, b) => a - b), [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  ]);
  assert.deepEqual(balls.find((ball) => ball.id === 0)?.pos, HEAD_SPOT);
  assert.ok(balls.every((ball) => !ball.inPocket));
  assert.ok(balls.every((ball) => ball.vel.x === 0 && ball.vel.y === 0));
});

test('identical fixed-step shots are deterministic and do not mutate input', () => {
  const state = practiceState();
  const before = structuredClone(state);
  const shot = {
    angle: 0,
    power: 0.55,
    tipOffset: { x: 0.12, y: -0.18 },
  };
  const options = { tableSpeed: 1, recordFrames: true, frameInterval: 12 };

  const first = simulateShot(state, shot, options);
  const second = simulateShot(state, shot, options);

  assert.deepEqual(state, before, 'simulateShot mutated its input state');
  assert.deepEqual(first, second);
  assert.ok(first.ticks > 0);
  assert.equal(first.frames[0]?.tick, 0);
  assert.equal(first.frames.at(-1)?.tick, first.ticks);
  assert.ok(first.finalState.balls.every((ball) => Number.isFinite(ball.pos.x) && Number.isFinite(ball.pos.y)));
  assert.ok(first.finalState.balls
    .filter((ball) => !ball.inPocket)
    .every((ball) => ball.vel.x === 0 && ball.vel.y === 0));
  assert.ok(first.finalState.balls
    .filter((ball) => !ball.inPocket)
    .every((ball) => ball.pos.x >= PLAY_LEFT + BALL_RADIUS
      && ball.pos.x <= PLAY_RIGHT - BALL_RADIUS
      && ball.pos.y >= PLAY_TOP + BALL_RADIUS
      && ball.pos.y <= PLAY_BOTTOM - BALL_RADIUS));
});

test('aim prediction deterministically targets the rack apex without mutating state', () => {
  const state = practiceState();
  const before = structuredClone(state);
  const cue = state.balls.find((ball) => ball.id === 0);
  assert.ok(cue);

  const first = predictAim(state, cue.pos, { x: 1, y: 0 });
  const second = predictAim(state, cue.pos, { x: 1, y: 0 });

  assert.deepEqual(first, second);
  assert.equal(first.hitBall?.id, 1);
  assert.ok(first.distance > 0);
  assert.ok(first.end.x > cue.pos.x);
  assert.deepEqual(state, before);
});
