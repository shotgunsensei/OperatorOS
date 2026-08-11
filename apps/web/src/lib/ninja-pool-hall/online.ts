import { simulateShot, type SimulationFrame } from './physics';
import { applyShotResult } from './rules';
import type { GameState, Settings, Shot, ShotEvents } from './types';

function rounded(value: number): number {
  if (Object.is(value, -0)) return 0;
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}

export function canonicalOnlineState(state: GameState): Record<string, unknown> {
  return {
    balls: [...state.balls]
      .sort((left, right) => left.id - right.id)
      .map((ball) => ({
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
  recordFrames = false,
  frameInterval = 3,
): { state: GameState; events: ShotEvents; ticks: number; frames: SimulationFrame[]; resultHash: string } {
  const simulation = simulateShot(state, shot, {
    tableSpeed: settings.tableSpeed,
    recordFrames,
    frameInterval,
  });
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
    frames: simulation.frames,
    resultHash: hashOnlineResult(resolved.state, simulation.events),
  };
}
