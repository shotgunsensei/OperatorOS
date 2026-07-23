import assert from 'node:assert/strict';
import test from 'node:test';
import { makeLogicalBalls, type GameState, type ShotEvents } from '../src/lib/ninja-pool-game.ts';
import {
  acceptTable,
  applyShotResult,
  makeInitialGameState,
  rerackAndBreak,
} from '../src/lib/ninja-pool-rules.ts';

function clone(state: GameState): GameState {
  return structuredClone(state);
}

function mark(state: GameState, ids: number[]): void {
  for (const id of ids) {
    const ball = state.balls.find((candidate) => candidate.id === id);
    if (ball) ball.inPocket = true;
  }
}

function events(overrides: Partial<ShotEvents> = {}): ShotEvents {
  return {
    pocketed: [],
    firstContact: null,
    cueHitCushion: false,
    cushionAfterContact: false,
    railsHitAfterContact: 0,
    objectBallsToRail: 0,
    ...overrides,
  };
}

test('promoted rules accept a legal break and require a choice on a failed break', () => {
  const legalBefore = makeInitialGameState(makeLogicalBalls(), ['A', 'B']);
  const legal = applyShotResult(legalBefore, clone(legalBefore), events({
    firstContact: 1,
    cushionAfterContact: true,
    railsHitAfterContact: 5,
    objectBallsToRail: 4,
  }));
  assert.equal(legal.foul, null);
  assert.equal(legal.state.currentPlayer, 1);

  const failedBefore = makeInitialGameState(makeLogicalBalls(), ['A', 'B']);
  const failed = applyShotResult(failedBefore, clone(failedBefore), events({
    firstContact: 1,
    cushionAfterContact: true,
    railsHitAfterContact: 2,
    objectBallsToRail: 2,
  }));
  assert.match(failed.foul?.reason ?? '', /failed break/i);
  assert.deepEqual(failed.state.pendingChoice, { type: 'FailedBreak', chooser: 1 });
  assert.equal(acceptTable(failed.state).pendingChoice, null);
  const reracked = rerackAndBreak(failed.state, makeLogicalBalls());
  assert.equal(reracked.shotCount, 0);
  assert.equal(reracked.currentPlayer, 1);
});

test('promoted rules assign groups only after a legal post-break pot', () => {
  const before = makeInitialGameState(makeLogicalBalls(), ['A', 'B']);
  before.shotCount = 1;
  const after = clone(before);
  mark(after, [3]);
  const result = applyShotResult(before, after, events({
    pocketed: [3],
    firstContact: 3,
    cushionAfterContact: true,
  }));
  assert.equal(result.foul, null);
  assert.equal(result.turnContinues, true);
  assert.equal(result.state.players[0].group, 'solids');
  assert.equal(result.state.players[1].group, 'stripes');
});

test('promoted rules award and forfeit the 8 ball deterministically', () => {
  const legalBefore = makeInitialGameState(makeLogicalBalls([1, 2, 3, 4, 5, 6, 7]), ['A', 'B']);
  legalBefore.shotCount = 5;
  legalBefore.groupsAssigned = true;
  legalBefore.players[0].group = 'solids';
  legalBefore.players[1].group = 'stripes';
  const legalAfter = clone(legalBefore);
  mark(legalAfter, [8]);
  const legal = applyShotResult(legalBefore, legalAfter, events({
    pocketed: [8], firstContact: 8, cushionAfterContact: true,
  }));
  assert.equal(legal.state.gameOver?.winner, 0);

  const earlyBefore = makeInitialGameState(makeLogicalBalls(), ['A', 'B']);
  earlyBefore.shotCount = 3;
  earlyBefore.groupsAssigned = true;
  earlyBefore.players[0].group = 'solids';
  earlyBefore.players[1].group = 'stripes';
  const earlyAfter = clone(earlyBefore);
  mark(earlyAfter, [8]);
  const early = applyShotResult(earlyBefore, earlyAfter, events({
    pocketed: [8], firstContact: 1, cushionAfterContact: true,
  }));
  assert.equal(early.state.gameOver?.winner, 1);
  assert.match(early.state.gameOver?.reason ?? '', /8/i);
});

test('three consecutive fouls lose only when the saved rule variant is enabled', () => {
  const before = makeInitialGameState(makeLogicalBalls(), ['A', 'B']);
  before.shotCount = 2;
  before.groupsAssigned = true;
  before.players[0].group = 'solids';
  before.players[1].group = 'stripes';
  before.consecutiveFouls = [2, 0];
  const enabled = applyShotResult(before, clone(before), events(), {
    callShotOn8: false,
    threeFoulRule: true,
  });
  assert.equal(enabled.state.gameOver?.winner, 1);
  assert.match(enabled.state.gameOver?.reason ?? '', /three consecutive fouls/i);

  const disabled = applyShotResult(before, clone(before), events(), {
    callShotOn8: false,
    threeFoulRule: false,
  });
  assert.equal(disabled.state.gameOver, null);
  assert.deepEqual(disabled.state.consecutiveFouls, [3, 0]);
});
