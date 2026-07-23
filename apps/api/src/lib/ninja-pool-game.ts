/**
 * Logical 8-ball state used by the server-side rules projection.
 *
 * The browser owns continuous physics and coordinates. The API stores only
 * the bounded logical state needed to deterministically apply the promoted
 * rules engine to client-reported shot facts. This validates lifecycle and
 * rules transitions without claiming that OperatorOS can prove a physical
 * shot occurred.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export type BallId = number;
export type Group = 'solids' | 'stripes';

export interface Ball {
  id: BallId;
  pos: Vec2;
  vel: Vec2;
  inPocket: boolean;
}

export interface ShotEvents {
  pocketed: BallId[];
  firstContact: BallId | null;
  cueHitCushion: boolean;
  cushionAfterContact: boolean;
  railsHitAfterContact: number;
  objectBallsToRail: number;
}

export interface PlayerInfo {
  name: string;
  group: Group | null;
}

export type PendingChoice =
  | { type: '8OnBreak'; chooser: 0 | 1 }
  | { type: 'FailedBreak'; chooser: 0 | 1 };

export interface GameState {
  balls: Ball[];
  currentPlayer: 0 | 1;
  players: [PlayerInfo, PlayerInfo];
  ballInHand: boolean;
  ballInHandBehindHeadString?: boolean;
  groupsAssigned: boolean;
  gameOver: { winner: 0 | 1 | null; reason: string } | null;
  shotCount: number;
  consecutiveFouls?: [number, number];
  pendingChoice?: PendingChoice | null;
}

export interface Settings {
  aimGuide: boolean;
  tableSpeed: number;
  sound: boolean;
  vibration: boolean;
  callShotOn8: boolean;
  threeFoulRule: boolean;
}

export const BALL_RADIUS = 12;
export const TABLE_WIDTH = 1_000;
export const TABLE_HEIGHT = 500;
export const RAIL = 44;
export const HEAD_SPOT: Vec2 = { x: RAIL + (TABLE_WIDTH - RAIL * 2) * 0.25, y: TABLE_HEIGHT / 2 };
export const FOOT_SPOT: Vec2 = { x: RAIL + (TABLE_WIDTH - RAIL * 2) * 0.75, y: TABLE_HEIGHT / 2 };
export const POCKET_CAPTURE_RADIUS = BALL_RADIUS * 1.55;
export const POCKETS: Vec2[] = [
  { x: RAIL, y: RAIL },
  { x: TABLE_WIDTH / 2, y: RAIL },
  { x: TABLE_WIDTH - RAIL, y: RAIL },
  { x: RAIL, y: TABLE_HEIGHT - RAIL },
  { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT - RAIL },
  { x: TABLE_WIDTH - RAIL, y: TABLE_HEIGHT - RAIL },
];

export function makeLogicalBalls(pocketed: readonly number[] = []): Ball[] {
  const pocketedSet = new Set(pocketed);
  return Array.from({ length: 16 }, (_, id) => ({
    id,
    pos: id === 0 ? { ...HEAD_SPOT } : { x: FOOT_SPOT.x + id, y: FOOT_SPOT.y },
    vel: { x: 0, y: 0 },
    inPocket: pocketedSet.has(id),
  }));
}

export function findSpotPosition(state: GameState, preferred: Vec2 = FOOT_SPOT): Vec2 {
  const occupied = state.balls.filter((ball) => !ball.inPocket);
  for (let offset = 0; offset <= 240; offset += BALL_RADIUS * 2 + 1) {
    for (const direction of [1, -1]) {
      const candidate = { x: preferred.x + offset * direction, y: preferred.y };
      if (candidate.x < RAIL + BALL_RADIUS || candidate.x > TABLE_WIDTH - RAIL - BALL_RADIUS) continue;
      const clear = occupied.every((ball) => {
        const dx = ball.pos.x - candidate.x;
        const dy = ball.pos.y - candidate.y;
        return dx * dx + dy * dy >= (BALL_RADIUS * 2 + 0.5) ** 2;
      });
      if (clear) return candidate;
    }
  }
  return { ...preferred };
}
