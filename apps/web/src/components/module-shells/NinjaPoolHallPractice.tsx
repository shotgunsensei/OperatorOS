'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CircleDot,
  Crosshair,
  History,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Target,
  Trophy,
} from 'lucide-react';
import {
  moduleShellApi,
  type NinjaPoolPracticeProgressInput,
  type NinjaPoolPracticeSession,
} from '@/lib/auth';
import {
  BALL_RADIUS,
  HEAD_SPOT,
  PLAY_BOTTOM,
  PLAY_LEFT,
  PLAY_RIGHT,
  PLAY_TOP,
  POCKETS,
  POCKET_RADIUS,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  makeInitialBalls,
  predictAim,
  simulateShot,
  type SimulationFrame,
} from '@/lib/ninja-pool-hall/physics';
import {
  findActivePracticeSummary,
  reconcilePracticeProgress,
} from '@/lib/ninja-pool-hall/practice-recovery';
import type {
  Ball,
  GameState,
  Vec2,
} from '@/lib/ninja-pool-hall/types';

const BALL_COLORS: Record<number, string> = {
  0: '#f8fafc',
  1: '#facc15',
  2: '#2563eb',
  3: '#dc2626',
  4: '#7c3aed',
  5: '#f97316',
  6: '#16a34a',
  7: '#7f1d1d',
  8: '#050505',
  9: '#facc15',
  10: '#2563eb',
  11: '#dc2626',
  12: '#7c3aed',
  13: '#f97316',
  14: '#16a34a',
  15: '#7f1d1d',
};

type RetryAction = 'history' | 'start' | 'save' | 'abandon' | 'reconcile';

interface ActionError {
  message: string;
  status?: number;
  code?: string;
  retry: RetryAction;
}

function newRackState(): GameState {
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

function apiError(error: unknown, retry: RetryAction): ActionError {
  const candidate = error as {
    status?: number;
    code?: string;
    error?: string;
    message?: string;
  };
  return {
    message: candidate?.error ?? candidate?.message ?? 'Ninja Pool Hall request failed',
    status: candidate?.status,
    code: candidate?.code,
    retry,
  };
}

function isVersionConflict(error: unknown): boolean {
  const candidate = error as { status?: number; code?: string };
  return candidate?.status === 409
    && candidate?.code === 'NINJA_POOL_PRACTICE_VERSION_CONFLICT';
}

function sessionFromConflict(
  error: unknown,
  expectedId: string,
): NinjaPoolPracticeSession | null {
  const candidate = error as { currentSession?: unknown; session?: unknown };
  const value = candidate?.currentSession ?? candidate?.session;
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<NinjaPoolPracticeSession>;
  if (row.id !== expectedId) return null;
  if (row.status !== 'active' && row.status !== 'completed' && row.status !== 'abandoned') return null;
  if (![row.shots, row.objectBallsPocketed, row.scratches, row.version]
    .every((field) => Number.isSafeInteger(field))) return null;
  if (typeof row.startedAt !== 'string' || typeof row.updatedAt !== 'string') return null;
  if (row.completedAt !== null && typeof row.completedAt !== 'string') return null;
  return row as NinjaPoolPracticeSession;
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : value;
}

function sessionLabel(session: NinjaPoolPracticeSession): string {
  if (session.status === 'completed') return 'Cleared';
  if (session.status === 'abandoned') return 'Ended';
  return 'In progress';
}

function resetScratchedCue(balls: Ball[]): Ball[] {
  return balls.map((ball) => ball.id === 0
    ? {
      ...ball,
      inPocket: false,
      pos: { ...HEAD_SPOT },
      vel: { x: 0, y: 0 },
    }
    : ball);
}

function countObjectBallsPocketed(state: GameState): number {
  return state.balls.filter((ball) => ball.id !== 0 && ball.inPocket).length;
}

function canvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number): Vec2 {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(TABLE_WIDTH, ((clientX - rect.left) / rect.width) * TABLE_WIDTH)),
    y: Math.max(0, Math.min(TABLE_HEIGHT, ((clientY - rect.top) / rect.height) * TABLE_HEIGHT)),
  };
}

function drawBall(ctx: CanvasRenderingContext2D, ball: Ball, pos: Vec2): void {
  const color = BALL_COLORS[ball.id] ?? '#e2e8f0';
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.52)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  if (ball.id >= 9) {
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, BALL_RADIUS - 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillRect(pos.x - BALL_RADIUS + 2, pos.y - 5, BALL_RADIUS * 2 - 4, 10);
  }

  const highlight = ctx.createRadialGradient(
    pos.x - 4,
    pos.y - 5,
    1,
    pos.x,
    pos.y,
    BALL_RADIUS,
  );
  highlight.addColorStop(0, 'rgba(255,255,255,.72)');
  highlight.addColorStop(0.45, 'rgba(255,255,255,.10)');
  highlight.addColorStop(1, 'rgba(0,0,0,.18)');
  ctx.fillStyle = highlight;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  if (ball.id !== 0) {
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 5.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.font = '700 7px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(ball.id), pos.x, pos.y + 0.4);
  }
  ctx.restore();
}

export default function NinjaPoolHallPractice() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const sessionRef = useRef<NinjaPoolPracticeSession | null>(null);
  const [gameState, setGameState] = useState<GameState>(() => newRackState());
  const [animationFrame, setAnimationFrame] = useState<SimulationFrame | null>(null);
  const [aimPoint, setAimPoint] = useState<Vec2>({ x: 650, y: TABLE_HEIGHT / 2 });
  const [power, setPower] = useState(0.58);
  const [session, setSession] = useState<NinjaPoolPracticeSession | null>(null);
  const [history, setHistory] = useState<NinjaPoolPracticeSession[]>([]);
  const [pendingProgress, setPendingProgress] = useState<NinjaPoolPracticeProgressInput | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ending, setEnding] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const [error, setError] = useState<ActionError | null>(null);
  const [statusMessage, setStatusMessage] = useState('Start a rack, aim on the table, set power, and shoot.');

  const cueBall = useMemo(
    () => gameState.balls.find((ball) => ball.id === 0) ?? null,
    [gameState.balls],
  );
  const objectBallsPocketed = useMemo(() => countObjectBallsPocketed(gameState), [gameState]);
  const active = session?.status === 'active';
  const displayedObjectBallsPocketed = recoveryRequired
    ? session?.objectBallsPocketed ?? objectBallsPocketed
    : objectBallsPocketed;
  const controlsLocked = !active
    || recoveryRequired
    || animating
    || saving
    || reconciling
    || pendingProgress !== null;

  const loadHistory = useCallback(async (discoverActive = false) => {
    setHistoryLoading(true);
    try {
      const response = await moduleShellApi.ninjaPoolHall.listPracticeSessions(8);
      setHistory(response.sessions);
      if (discoverActive && !sessionRef.current) {
        const recovered = findActivePracticeSummary(response.sessions);
        if (recovered) {
          sessionRef.current = recovered;
          setSession(recovered);
          setRecoveryRequired(true);
          setStatusMessage(
            'An active summary was recovered. Exact ball positions stay local, so end this rack cleanly before starting another.',
          );
        }
      }
      setError((current) => current?.retry === 'history' ? null : current);
    } catch (cause) {
      setError(apiError(cause, 'history'));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory(true);
    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    };
  }, [loadHistory]);

  const drawTable = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
    const rail = ctx.createLinearGradient(0, 0, 0, TABLE_HEIGHT);
    rail.addColorStop(0, '#27130f');
    rail.addColorStop(0.5, '#120708');
    rail.addColorStop(1, '#050304');
    ctx.fillStyle = rail;
    ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

    const felt = ctx.createRadialGradient(500, 250, 40, 500, 250, 620);
    felt.addColorStop(0, '#5f111a');
    felt.addColorStop(0.62, '#360a10');
    felt.addColorStop(1, '#160306');
    ctx.fillStyle = felt;
    ctx.fillRect(PLAY_LEFT, PLAY_TOP, PLAY_RIGHT - PLAY_LEFT, PLAY_BOTTOM - PLAY_TOP);
    ctx.strokeStyle = 'rgba(248,113,113,.48)';
    ctx.lineWidth = 2;
    ctx.strokeRect(PLAY_LEFT - 4, PLAY_TOP - 4, PLAY_RIGHT - PLAY_LEFT + 8, PLAY_BOTTOM - PLAY_TOP + 8);

    for (const pocket of POCKETS) {
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(pocket.x, pocket.y, POCKET_RADIUS + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(239,68,68,.55)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    const positions = new Map<number, Vec2>();
    if (animationFrame) {
      for (const position of animationFrame.positions) {
        if (!position.inPocket) positions.set(position.id, { x: position.x, y: position.y });
      }
    } else {
      for (const ball of gameState.balls) {
        if (!ball.inPocket) positions.set(ball.id, ball.pos);
      }
    }

    const cuePos = positions.get(0);
    if (cuePos && active && !recoveryRequired && !animating) {
      const dx = aimPoint.x - cuePos.x;
      const dy = aimPoint.y - cuePos.y;
      const magnitude = Math.hypot(dx, dy) || 1;
      const direction = { x: dx / magnitude, y: dy / magnitude };
      const guide = predictAim(gameState, cuePos, direction);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,.76)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 7]);
      ctx.beginPath();
      ctx.moveTo(cuePos.x, cuePos.y);
      ctx.lineTo(guide.end.x, guide.end.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(248,113,113,.9)';
      ctx.beginPath();
      ctx.arc(guide.end.x, guide.end.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(202,138,4,.92)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cuePos.x - direction.x * 24, cuePos.y - direction.y * 24);
      ctx.lineTo(cuePos.x - direction.x * (94 + power * 50), cuePos.y - direction.y * (94 + power * 50));
      ctx.stroke();
      ctx.restore();
    }

    for (const ball of gameState.balls) {
      const pos = positions.get(ball.id);
      if (pos) drawBall(ctx, ball, pos);
    }

    if (!active || recoveryRequired) {
      ctx.fillStyle = 'rgba(3,7,18,.54)';
      ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
    }
  }, [active, aimPoint, animating, animationFrame, gameState, power, recoveryRequired]);

  useEffect(() => {
    drawTable();
  }, [drawTable]);

  const reconcileSession = useCallback(async (
    target: NinjaPoolPracticeSession,
    pending: NinjaPoolPracticeProgressInput | null,
    conflict?: unknown,
  ) => {
    setReconciling(true);
    setError(null);
    try {
      const embedded = sessionFromConflict(conflict, target.id);
      const response = embedded
        ? { sessions: [embedded] }
        : await moduleShellApi.ninjaPoolHall.listPracticeSessions(25);
      if (!embedded) setHistory(response.sessions.slice(0, 8));

      const result = pending
        ? reconcilePracticeProgress(target.id, pending, response.sessions)
        : (() => {
          const current = response.sessions.find((candidate) => candidate.id === target.id);
          return current
            ? { kind: 'server-state' as const, session: current }
            : { kind: 'missing' as const };
        })();

      if (result.kind === 'committed') {
        sessionRef.current = result.session;
        setSession(result.session);
        setPendingProgress(null);
        setRecoveryRequired(false);
        setStatusMessage(result.session.status === 'completed'
          ? `Rack cleared in ${result.session.shots} shots. The saved summary was reconciled.`
          : `${result.session.objectBallsPocketed} down · ${15 - result.session.objectBallsPocketed} remaining. The saved shot was reconciled.`);
        return;
      }

      if (result.kind === 'server-state') {
        sessionRef.current = result.session;
        setSession(result.session);
        setPendingProgress(null);
        const requiresRecovery = result.session.status === 'active';
        setRecoveryRequired(requiresRecovery);
        setStatusMessage(requiresRecovery
          ? 'The server summary changed, but exact table positions are local-only. End the recovered rack before starting another.'
          : `The server reports this rack as ${result.session.status}. Start a new local rack when ready.`);
        return;
      }

      setPendingProgress(null);
      setRecoveryRequired(target.status === 'active');
      setStatusMessage(
        'The current summary was not returned. Local shot retry was cleared; reload status or end the recovered rack.',
      );
    } catch (cause) {
      setError(apiError(cause, 'reconcile'));
    } finally {
      setReconciling(false);
    }
  }, []);

  const startRack = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      // Close the initial-load/manual-start race before POST. The server also
      // enforces one active session, but an existing summary cannot restore
      // the browser-only ball positions and must enter recovery instead.
      const beforeStart = await moduleShellApi.ninjaPoolHall.listPracticeSessions(25);
      const existing = findActivePracticeSummary(beforeStart.sessions);
      if (existing) {
        sessionRef.current = existing;
        setSession(existing);
        setHistory(beforeStart.sessions.slice(0, 8));
        setPendingProgress(null);
        setRecoveryRequired(true);
        setStatusMessage(
          'An active summary already exists. End the recovered rack before starting a new local table.',
        );
        return;
      }

      const created = await moduleShellApi.ninjaPoolHall.startPracticeSession();
      sessionRef.current = created;
      setSession(created);
      setGameState(newRackState());
      setPendingProgress(null);
      setRecoveryRequired(false);
      setStatusMessage('Rack live. Aim by touching or clicking the table.');
      await loadHistory();
    } catch (cause) {
      setError(apiError(cause, 'start'));
    } finally {
      setStarting(false);
    }
  }, [loadHistory]);

  const saveProgress = useCallback(async (progress: NinjaPoolPracticeProgressInput) => {
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await moduleShellApi.ninjaPoolHall.savePracticeShot(session.id, progress);
      sessionRef.current = updated;
      setSession(updated);
      setPendingProgress(null);
      setRecoveryRequired(false);
      if (updated.status === 'completed') {
        setStatusMessage(`Rack cleared in ${updated.shots} shots. Clean work.`);
      } else {
        setStatusMessage(`${updated.objectBallsPocketed} down · ${15 - updated.objectBallsPocketed} remaining.`);
      }
      await loadHistory();
    } catch (cause) {
      if (isVersionConflict(cause)) {
        await reconcileSession(session, progress, cause);
      } else {
        setError(apiError(cause, 'save'));
      }
    } finally {
      setSaving(false);
    }
  }, [loadHistory, reconcileSession, session]);

  const playFrames = useCallback((frames: SimulationFrame[], ticks: number) => {
    return new Promise<void>((resolve) => {
      if (frames.length === 0) {
        resolve();
        return;
      }
      const duration = Math.max(620, Math.min(4_200, ticks * 4));
      const started = performance.now();
      const step = (now: number) => {
        const progress = Math.min(1, (now - started) / duration);
        const index = Math.min(frames.length - 1, Math.floor(progress * frames.length));
        setAnimationFrame(frames[index] ?? frames[frames.length - 1]!);
        if (progress >= 1) {
          animationRef.current = null;
          resolve();
          return;
        }
        animationRef.current = requestAnimationFrame(step);
      };
      animationRef.current = requestAnimationFrame(step);
    });
  }, []);

  const takeShot = useCallback(async () => {
    if (!session || controlsLocked || !cueBall) return;
    const dx = aimPoint.x - cueBall.pos.x;
    const dy = aimPoint.y - cueBall.pos.y;
    if (Math.hypot(dx, dy) < 8) {
      setStatusMessage('Aim farther away from the cue ball before shooting.');
      return;
    }

    setAnimating(true);
    setError(null);
    setStatusMessage('Shot in motion…');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    try {
      const result = simulateShot(gameState, {
        angle: Math.atan2(dy, dx),
        power,
      }, {
        recordFrames: true,
        frameInterval: 3,
      });
      await playFrames(result.frames, result.ticks);
      const scratched = result.events.pocketed.includes(0);
      const balls = scratched
        ? resetScratchedCue(result.finalState.balls)
        : result.finalState.balls;
      const nextState: GameState = {
        ...gameState,
        balls,
        shotCount: gameState.shotCount + 1,
      };
      setGameState(nextState);
      setAnimationFrame(null);
      const progress: NinjaPoolPracticeProgressInput = {
        expectedVersion: session.version,
        shots: session.shots + 1,
        objectBallsPocketed: countObjectBallsPocketed(nextState),
        scratches: session.scratches + (scratched ? 1 : 0),
      };
      setPendingProgress(progress);
      if (scratched) setStatusMessage('Scratch. Cue ball reset to the head spot; saving shot…');
      await saveProgress(progress);
    } catch (cause) {
      setAnimationFrame(null);
      setError(apiError(cause, 'save'));
    } finally {
      setAnimating(false);
    }
  }, [aimPoint, controlsLocked, cueBall, gameState, playFrames, power, saveProgress, session]);

  const abandonRack = useCallback(async () => {
    if (!session || session.status !== 'active') return;
    setEnding(true);
    setError(null);
    try {
      const updated = await moduleShellApi.ninjaPoolHall.abandonPracticeSession(
        session.id,
        session.version,
      );
      sessionRef.current = updated;
      setSession(updated);
      setPendingProgress(null);
      setRecoveryRequired(false);
      setStatusMessage('Rack ended. Start another when ready.');
      await loadHistory();
    } catch (cause) {
      if (isVersionConflict(cause)) {
        await reconcileSession(session, null, cause);
      } else {
        setError(apiError(cause, 'abandon'));
      }
    } finally {
      setEnding(false);
    }
  }, [loadHistory, reconcileSession, session]);

  const retry = useCallback(() => {
    if (!error) return;
    if (error.retry === 'history') void loadHistory(true);
    if (error.retry === 'start') void startRack();
    if (error.retry === 'save' && pendingProgress) void saveProgress(pendingProgress);
    if (error.retry === 'abandon') void abandonRack();
    if (error.retry === 'reconcile' && session) {
      void reconcileSession(session, pendingProgress);
    }
  }, [abandonRack, error, loadHistory, pendingProgress, reconcileSession, saveProgress, session, startRack]);

  const discardUncertainLocalRack = useCallback(() => {
    if (!session) return;
    setAnimationFrame(null);
    setGameState(newRackState());
    setPendingProgress(null);
    setError(null);
    setRecoveryRequired(session.status === 'active');
    setStatusMessage(
      'The uncertain local table was discarded. Its server summary was not treated as authoritative physics; end or reload the recovered rack.',
    );
  }, [session]);

  const aimFromPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (controlsLocked) return;
    setAimPoint(canvasPoint(event.currentTarget, event.clientX, event.clientY));
  };

  const aimFromKeyboard = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (controlsLocked) return;
    const step = event.shiftKey ? 30 : 12;
    const offsets: Partial<Record<string, Vec2>> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const offset = offsets[event.key];
    if (offset) {
      event.preventDefault();
      setAimPoint((current) => ({
        x: Math.max(0, Math.min(TABLE_WIDTH, current.x + offset.x)),
        y: Math.max(0, Math.min(TABLE_HEIGHT, current.y + offset.y)),
      }));
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      void takeShot();
    }
  };

  return (
    <section className="nph-practice" data-testid="ninja-pool-practice">
      <style>{practiceCss}</style>
      {error && (
        <div className="nph-error" role="alert" data-testid="ninja-pool-practice-error">
          <AlertTriangle size={18} />
          <div className="nph-error-copy">
            <strong>{error.message}</strong>
            <span>
              {error.status ? `HTTP ${error.status}` : 'Request error'}
              {error.code ? ` · ${error.code}` : ''}
            </span>
          </div>
          <div className="nph-error-actions">
            <button type="button" onClick={retry}><RefreshCw size={15} /> Retry</button>
            {error.retry === 'reconcile' && session && (
              <button type="button" onClick={discardUncertainLocalRack}>
                <RotateCcw size={15} /> Discard local rack
              </button>
            )}
          </div>
        </div>
      )}

      <div className="nph-layout">
        <div className="nph-game-card">
          <div className="nph-toolbar">
            <div>
              <span className="nph-kicker"><Crosshair size={14} /> SYS::FREE_SHOOT</span>
              <h2>Practice rack</h2>
              <p>{statusMessage}</p>
            </div>
            <div className="nph-stats" aria-label="Current rack stats">
              <span><b>{session?.shots ?? 0}</b> shots</span>
              <span><b>{displayedObjectBallsPocketed}</b> pocketed</span>
              <span><b>{session?.scratches ?? 0}</b> scratches</span>
            </div>
          </div>

          <div className="nph-table-wrap">
            <canvas
              ref={canvasRef}
              width={TABLE_WIDTH}
              height={TABLE_HEIGHT}
              tabIndex={0}
              aria-label="Ninja Pool Hall practice table. Touch or click to aim, or use arrow keys. Press Enter or Space to shoot."
              data-testid="ninja-pool-table"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                aimFromPointer(event);
              }}
              onPointerMove={(event) => {
                if (event.buttons > 0 || event.pointerType === 'touch') aimFromPointer(event);
              }}
              onKeyDown={aimFromKeyboard}
            />
            {(!active || recoveryRequired) && (
              <div className="nph-table-overlay">
                {recoveryRequired
                  ? <RefreshCw className={reconciling ? 'nph-spin' : ''} size={34} />
                  : session?.status === 'completed' ? <Trophy size={34} /> : <Target size={34} />}
                <strong>{recoveryRequired
                  ? 'Session summary recovered'
                  : session?.status === 'completed' ? 'Rack cleared' : 'Local drill ready'}</strong>
                <span>{recoveryRequired
                  ? 'OperatorOS retained the bounded totals, not the ball positions. End this recovered rack cleanly before starting another.'
                  : 'Physics runs entirely on this device; only bounded rack totals are saved.'}</span>
                {recoveryRequired && session ? (
                  <div className="nph-recovery-actions">
                    <button
                      type="button"
                      onClick={() => void abandonRack()}
                      disabled={ending || reconciling}
                      data-testid="ninja-pool-end-recovered-rack"
                    >
                      {ending ? <Loader2 className="nph-spin" size={17} /> : <RotateCcw size={17} />}
                      {ending ? 'Ending…' : 'End recovered rack'}
                    </button>
                    <button
                      type="button"
                      className="nph-recovery-refresh"
                      onClick={() => void reconcileSession(session, pendingProgress)}
                      disabled={ending || reconciling}
                      data-testid="ninja-pool-refresh-recovered-rack"
                    >
                      {reconciling ? <Loader2 className="nph-spin" size={17} /> : <RefreshCw size={17} />}
                      {reconciling ? 'Checking…' : 'Reload server summary'}
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => void startRack()} disabled={starting} data-testid="ninja-pool-start">
                    {starting ? <Loader2 className="nph-spin" size={17} /> : <Play size={17} />}
                    {starting ? 'Starting…' : session ? 'Start another rack' : 'Start practice rack'}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="nph-controls">
            <label>
              <span>Shot power <b>{Math.round(power * 100)}%</b></span>
              <input
                type="range"
                min="0.08"
                max="1"
                step="0.01"
                value={power}
                disabled={controlsLocked}
                onChange={(event) => setPower(Number(event.target.value))}
                data-testid="ninja-pool-power"
              />
            </label>
            <button
              type="button"
              className="nph-shoot"
              disabled={controlsLocked}
              onClick={() => void takeShot()}
              data-testid="ninja-pool-shoot"
            >
              {animating || saving ? <Loader2 className="nph-spin" size={18} /> : <CircleDot size={18} />}
              {animating ? 'Balls moving…' : saving ? 'Saving…' : 'Take shot'}
            </button>
            <button
              type="button"
              className="nph-secondary"
              disabled={!active || recoveryRequired || animating || saving || ending || reconciling || pendingProgress !== null}
              onClick={() => void abandonRack()}
              data-testid="ninja-pool-end-rack"
            >
              {ending ? <Loader2 className="nph-spin" size={17} /> : <RotateCcw size={17} />}
              End rack
            </button>
          </div>

          <div className="nph-boundary">
            <ShieldCheck size={17} />
            <span><b>Local-first boundary:</b> no WebSocket room, remote opponent, local login, billing, or competitive ranking is active in this slice.</span>
          </div>
        </div>

        <aside className="nph-history" data-testid="ninja-pool-practice-history">
          <div className="nph-history-title">
            <div><History size={17} /><strong>Recent racks</strong></div>
            <button type="button" onClick={() => void loadHistory(true)} aria-label="Refresh practice history">
              <RefreshCw size={15} className={historyLoading ? 'nph-spin' : ''} />
            </button>
          </div>
          {historyLoading && history.length === 0 ? (
            <div className="nph-history-loading" data-testid="ninja-pool-history-loading">
              {[0, 1, 2].map((item) => <span key={item} />)}
            </div>
          ) : history.length === 0 ? (
            <div className="nph-history-empty" data-testid="ninja-pool-history-empty">
              <Target size={24} />
              <strong>No racks logged yet</strong>
              <span>Your first local practice run will appear here.</span>
            </div>
          ) : (
            <div className="nph-history-list">
              {history.map((item) => (
                <article key={item.id}>
                  <div>
                    <span className={`nph-status nph-${item.status}`}>{sessionLabel(item)}</span>
                    <time>{formatDate(item.startedAt)}</time>
                  </div>
                  <strong>{item.objectBallsPocketed}/15 down</strong>
                  <p>{item.shots} shots · {item.scratches} scratches</p>
                </article>
              ))}
            </div>
          )}
          <div className="nph-history-note">
            <ShieldCheck size={15} /> Only your sessions in the active organization are returned.
          </div>
        </aside>
      </div>
    </section>
  );
}

const practiceCss = `
  .nph-practice { color:#f8fafc; }
  .nph-layout { display:grid; grid-template-columns:minmax(0,1fr) 285px; gap:18px; align-items:start; }
  .nph-game-card,.nph-history { border:1px solid rgba(248,113,113,.2); background:rgba(9,9,13,.88); box-shadow:0 24px 70px rgba(0,0,0,.34); }
  .nph-game-card { border-radius:18px; overflow:hidden; }
  .nph-toolbar { padding:20px 22px 16px; display:flex; align-items:flex-start; justify-content:space-between; gap:18px; }
  .nph-kicker { display:inline-flex; align-items:center; gap:7px; color:#f87171; font:700 11px ui-monospace,monospace; letter-spacing:.18em; }
  .nph-toolbar h2 { margin:7px 0 3px; font-size:clamp(22px,3vw,34px); text-transform:uppercase; letter-spacing:-.03em; }
  .nph-toolbar p { margin:0; color:#94a3b8; font-size:13px; }
  .nph-stats { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
  .nph-stats span { min-width:74px; padding:9px 11px; border:1px solid rgba(148,163,184,.16); background:rgba(15,23,42,.7); border-radius:10px; color:#94a3b8; font-size:11px; text-align:center; }
  .nph-stats b { display:block; color:#fff; font-size:18px; }
  .nph-table-wrap { position:relative; margin:0 18px; border:1px solid rgba(248,113,113,.28); background:#050305; box-shadow:0 18px 44px rgba(0,0,0,.42); touch-action:none; }
  .nph-table-wrap canvas { display:block; width:100%; aspect-ratio:2/1; cursor:crosshair; }
  .nph-table-wrap canvas:focus-visible { outline:3px solid rgba(248,113,113,.72); outline-offset:3px; }
  .nph-table-overlay { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; gap:8px; padding:22px; color:#f8fafc; }
  .nph-table-overlay svg { color:#f87171; filter:drop-shadow(0 0 18px rgba(239,68,68,.55)); }
  .nph-table-overlay strong { font-size:clamp(18px,3vw,30px); text-transform:uppercase; }
  .nph-table-overlay span { max-width:460px; color:#cbd5e1; font-size:13px; }
  .nph-table-overlay button,.nph-shoot { margin-top:8px; border:0; background:linear-gradient(135deg,#ef4444,#b91c1c); color:#fff; box-shadow:0 10px 28px rgba(239,68,68,.25); }
  .nph-table-overlay button,.nph-controls button { min-height:44px; border-radius:10px; padding:10px 16px; display:inline-flex; align-items:center; justify-content:center; gap:8px; font-weight:800; cursor:pointer; }
  .nph-recovery-actions { display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:8px; }
  .nph-table-overlay .nph-recovery-refresh { border:1px solid rgba(148,163,184,.28); background:rgba(15,23,42,.82); box-shadow:none; color:#e2e8f0; }
  .nph-controls { padding:18px 20px; display:grid; grid-template-columns:minmax(180px,1fr) auto auto; align-items:end; gap:12px; }
  .nph-controls label { display:grid; gap:8px; color:#cbd5e1; font-size:12px; }
  .nph-controls label span { display:flex; justify-content:space-between; }
  .nph-controls input { width:100%; accent-color:#ef4444; }
  .nph-secondary { border:1px solid rgba(148,163,184,.24); background:rgba(30,41,59,.66); color:#e2e8f0; }
  .nph-controls button:disabled,.nph-table-overlay button:disabled { opacity:.48; cursor:not-allowed; }
  .nph-controls button:focus-visible,.nph-table-overlay button:focus-visible,.nph-history button:focus-visible { outline:3px solid rgba(248,113,113,.6); outline-offset:2px; }
  .nph-boundary { margin:0 20px 20px; padding:11px 13px; display:flex; gap:9px; align-items:flex-start; border:1px solid rgba(34,197,94,.2); background:rgba(22,101,52,.10); color:#bbf7d0; border-radius:10px; font-size:12px; line-height:1.5; }
  .nph-boundary svg { flex:0 0 auto; margin-top:1px; }
  .nph-history { border-radius:16px; overflow:hidden; position:sticky; top:18px; }
  .nph-history-title { padding:15px 16px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid rgba(148,163,184,.14); }
  .nph-history-title div { display:flex; gap:8px; align-items:center; text-transform:uppercase; letter-spacing:.08em; font-size:12px; }
  .nph-history-title button { border:0; background:transparent; color:#94a3b8; cursor:pointer; padding:6px; }
  .nph-history-list { display:grid; }
  .nph-history-list article { padding:14px 16px; border-bottom:1px solid rgba(148,163,184,.11); }
  .nph-history-list article>div { display:flex; justify-content:space-between; gap:8px; align-items:center; }
  .nph-history-list time { color:#64748b; font-size:10px; }
  .nph-history-list strong { display:block; margin-top:9px; font-size:17px; }
  .nph-history-list p { margin:3px 0 0; color:#94a3b8; font-size:11px; }
  .nph-status { border-radius:999px; padding:3px 7px; font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; }
  .nph-completed { color:#86efac; background:rgba(22,163,74,.16); }
  .nph-active { color:#fde68a; background:rgba(202,138,4,.16); }
  .nph-abandoned { color:#cbd5e1; background:rgba(100,116,139,.18); }
  .nph-history-note { margin:12px; padding:10px; display:flex; gap:7px; color:#94a3b8; background:rgba(15,23,42,.6); border-radius:8px; font-size:10px; line-height:1.45; }
  .nph-history-loading { padding:14px; display:grid; gap:9px; }
  .nph-history-loading span { height:64px; border-radius:9px; background:linear-gradient(90deg,rgba(30,41,59,.7),rgba(71,85,105,.55),rgba(30,41,59,.7)); background-size:200% 100%; animation:nph-shimmer 1.3s linear infinite; }
  .nph-history-empty { min-height:210px; padding:24px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; gap:7px; color:#64748b; }
  .nph-history-empty strong { color:#cbd5e1; }
  .nph-history-empty span { font-size:11px; }
  .nph-error { margin-bottom:14px; padding:13px 14px; border:1px solid rgba(248,113,113,.4); background:rgba(127,29,29,.28); color:#fecaca; display:grid; grid-template-columns:auto 1fr auto; gap:10px; align-items:center; border-radius:11px; }
  .nph-error-copy { display:grid; gap:2px; }
  .nph-error span { font:11px ui-monospace,monospace; color:#fca5a5; }
  .nph-error-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:7px; }
  .nph-error button { border:1px solid rgba(254,202,202,.28); background:rgba(127,29,29,.4); color:#fff; border-radius:8px; padding:8px 10px; display:flex; gap:6px; align-items:center; cursor:pointer; }
  .nph-spin { animation:nph-spin .8s linear infinite; }
  @keyframes nph-spin { to { transform:rotate(360deg); } }
  @keyframes nph-shimmer { to { background-position:-200% 0; } }
  @media (prefers-reduced-motion:reduce) { .nph-spin,.nph-history-loading span { animation:none; } }
  @media (max-width:980px) { .nph-layout { grid-template-columns:1fr; } .nph-history { position:static; } }
  @media (max-width:680px) {
    .nph-toolbar { padding:16px; display:grid; }
    .nph-stats { justify-content:stretch; display:grid; grid-template-columns:repeat(3,1fr); }
    .nph-table-wrap { margin:0 8px; }
    .nph-controls { padding:16px; grid-template-columns:1fr 1fr; }
    .nph-controls label { grid-column:1/-1; }
    .nph-controls button { width:100%; padding:9px; }
    .nph-boundary { margin:0 12px 14px; }
    .nph-error { grid-template-columns:auto 1fr; }
    .nph-error-actions { grid-column:1/-1; justify-content:stretch; }
    .nph-error-actions button { flex:1; justify-content:center; }
  }
`;
