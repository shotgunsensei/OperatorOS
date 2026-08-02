'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CircleDot,
  History,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trophy,
  Users,
} from 'lucide-react';
import {
  moduleShellApi,
  type NinjaPoolMatch,
  type NinjaPoolMatchMode,
  type NinjaPoolPreferences,
  type NinjaPoolProfile,
  type NinjaPoolShotInput,
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
  findFreeSpot,
  makeInitialBalls,
  predictAim,
  simulateShot,
  type SimulationFrame,
} from '@/lib/ninja-pool-hall/physics';
import {
  acceptTable,
  applyShotResult,
  ballsRemainingForGroup,
  makeInitialGameState,
  playerHasClearedGroup,
  pocketIndexAt,
  rerackAndBreak,
} from '@/lib/ninja-pool-hall/rules';
import { chooseBotShot } from '@/lib/ninja-pool-hall/bot';
import { sfxClack, sfxCue, sfxLose, sfxPocket, sfxWin, unlockAudio, vibrate } from '@/lib/ninja-pool-hall/audio';
import type { Ball, GameState, Shot, Vec2 } from '@/lib/ninja-pool-hall/types';

interface Props {
  mode: NinjaPoolMatchMode;
  profile: NinjaPoolProfile;
  onMatchPath: (matchId: string | null) => void;
}

const BALL_COLORS: Record<number, string> = {
  0: '#f8fafc', 1: '#facc15', 2: '#2563eb', 3: '#dc2626', 4: '#7c3aed',
  5: '#f97316', 6: '#16a34a', 7: '#7f1d1d', 8: '#050505', 9: '#facc15',
  10: '#2563eb', 11: '#dc2626', 12: '#7c3aed', 13: '#f97316', 14: '#16a34a', 15: '#7f1d1d',
};

function actionId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : value;
}

function initialState(profile: NinjaPoolProfile, mode: NinjaPoolMatchMode, opponentName: string): GameState {
  return makeInitialGameState(
    makeInitialBalls(),
    [profile.displayName, mode === 'bot' ? 'CPU' : opponentName],
  );
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
  ctx.shadowColor = 'rgba(0,0,0,.55)';
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
  if (ball.id !== 0) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 5.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.font = '700 7px ui-monospace,monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(ball.id), pos.x, pos.y + 0.4);
  }
  ctx.restore();
}

function stateParity(local: GameState, server: GameState): boolean {
  return local.currentPlayer === server.currentPlayer
    && local.shotCount === server.shotCount
    && local.groupsAssigned === server.groupsAssigned
    && local.players[0].group === server.players[0].group
    && local.players[1].group === server.players[1].group
    && (local.gameOver?.winner ?? null) === (server.gameOver?.winner ?? null)
    && (local.pendingChoice?.type ?? null) === (server.pendingChoice?.type ?? null);
}

export default function NinjaPoolHallMatch({ mode, profile, onMatchPath }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const botTimerRef = useRef<number | null>(null);
  const [opponentName, setOpponentName] = useState(mode === 'bot' ? 'CPU' : 'Player 2');
  const [match, setMatch] = useState<NinjaPoolMatch | null>(null);
  const [matches, setMatches] = useState<NinjaPoolMatch[]>([]);
  const [gameState, setGameState] = useState<GameState>(() => initialState(profile, mode, opponentName));
  const [animationFrame, setAnimationFrame] = useState<SimulationFrame | null>(null);
  const [aimPoint, setAimPoint] = useState<Vec2>({ x: 650, y: TABLE_HEIGHT / 2 });
  const [power, setPower] = useState(0.58);
  const [calledPocket, setCalledPocket] = useState(0);
  const [status, setStatus] = useState('Start a structured 8-ball match. Results are saved as unverified local-play evidence.');
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ending, setEnding] = useState(false);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preferences: NinjaPoolPreferences = match?.rulesSettings ?? profile.preferences;
  const active = match?.status === 'active';
  const cueBall = useMemo(() => gameState.balls.find((ball) => ball.id === 0) ?? null, [gameState.balls]);
  const playerOnEight = playerHasClearedGroup(gameState, gameState.currentPlayer);
  const requiresCalledPocket = preferences.callShotOn8 && playerOnEight;
  const humanCanShoot = active
    && !recoveryRequired
    && !animating
    && !saving
    && !gameState.gameOver
    && !gameState.pendingChoice
    && (mode === 'local' || gameState.currentPlayer === 0);

  const loadMatches = useCallback(async (discoverActive = false) => {
    setLoading(true);
    try {
      const response = await moduleShellApi.ninjaPoolHall.listMatches(20);
      setMatches(response.matches);
      if (discoverActive && !match) {
        const existing = response.matches.find((candidate) => candidate.status === 'active');
        if (existing) {
          setMatch(existing);
          setRecoveryRequired(true);
          onMatchPath(existing.id);
          setStatus('A logical match summary was recovered. Physical ball positions are not trusted after reload; end it before starting another.');
        }
      }
      setError(null);
    } catch (cause: any) {
      setError(cause?.error || cause?.message || 'Unable to load match history.');
    } finally {
      setLoading(false);
    }
  }, [match, onMatchPath]);

  useEffect(() => {
    void loadMatches(true);
    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      if (botTimerRef.current !== null) window.clearTimeout(botTimerRef.current);
    };
  }, [loadMatches]);

  const drawTable = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
    const rail = ctx.createLinearGradient(0, 0, 0, TABLE_HEIGHT);
    rail.addColorStop(0, '#27130f');
    rail.addColorStop(0.5, '#120708');
    rail.addColorStop(1, '#050304');
    ctx.fillStyle = rail;
    ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
    const felt = ctx.createRadialGradient(500, 250, 40, 500, 250, 620);
    felt.addColorStop(0, '#64131d');
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
    }
    const positions = new Map<number, Vec2>();
    if (animationFrame) {
      for (const position of animationFrame.positions) {
        if (!position.inPocket) positions.set(position.id, { x: position.x, y: position.y });
      }
    } else {
      for (const ball of gameState.balls) if (!ball.inPocket) positions.set(ball.id, ball.pos);
    }
    const cuePos = positions.get(0);
    if (cuePos && humanCanShoot && preferences.aimGuide) {
      const dx = aimPoint.x - cuePos.x;
      const dy = aimPoint.y - cuePos.y;
      const magnitude = Math.hypot(dx, dy) || 1;
      const direction = { x: dx / magnitude, y: dy / magnitude };
      const guide = predictAim(gameState, cuePos, direction);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,.78)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 7]);
      ctx.beginPath();
      ctx.moveTo(cuePos.x, cuePos.y);
      ctx.lineTo(guide.end.x, guide.end.y);
      ctx.stroke();
      ctx.restore();
    }
    for (const ball of gameState.balls) {
      const position = positions.get(ball.id);
      if (position) drawBall(ctx, ball, position);
    }
    if (!active || recoveryRequired) {
      ctx.fillStyle = 'rgba(3,7,18,.58)';
      ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
    }
  }, [active, aimPoint, animationFrame, gameState, humanCanShoot, preferences.aimGuide, recoveryRequired]);

  useEffect(() => drawTable(), [drawTable]);

  const playFrames = useCallback((frames: SimulationFrame[], ticks: number) => new Promise<void>((resolve) => {
    if (frames.length === 0) return resolve();
    const duration = Math.max(620, Math.min(4_000, ticks * 4));
    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const index = Math.min(frames.length - 1, Math.floor(progress * frames.length));
      setAnimationFrame(frames[index] ?? frames.at(-1)!);
      if (progress >= 1) {
        animationRef.current = null;
        resolve();
      } else {
        animationRef.current = requestAnimationFrame(step);
      }
    };
    animationRef.current = requestAnimationFrame(step);
  }), []);

  const startMatch = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const created = await moduleShellApi.ninjaPoolHall.startMatch({
        mode,
        opponentName: mode === 'bot' ? 'CPU' : opponentName,
        clientStartId: actionId('start'),
      });
      setMatch(created);
      onMatchPath(created.id);
      if (created.recovered) {
        setRecoveryRequired(true);
        setStatus('An active match already exists. Physical table state cannot be reconstructed from the bounded server summary.');
      } else {
        setGameState(initialState(profile, mode, mode === 'bot' ? 'CPU' : opponentName));
        setRecoveryRequired(false);
        setStatus(`${profile.displayName} breaks. Aim on the table, set power, and shoot.`);
      }
      await loadMatches();
    } catch (cause: any) {
      setError(cause?.error || cause?.message || 'Unable to start the match.');
    } finally {
      setStarting(false);
    }
  }, [loadMatches, mode, onMatchPath, opponentName, profile]);

  const abandon = useCallback(async () => {
    if (!match || match.status !== 'active') return;
    setEnding(true);
    setError(null);
    try {
      const updated = await moduleShellApi.ninjaPoolHall.abandonMatch(match.id, match.version);
      setMatch(updated);
      setRecoveryRequired(false);
      onMatchPath(null);
      setStatus('Match ended without a result. Start another when ready.');
      await loadMatches();
    } catch (cause: any) {
      setError(cause?.error || cause?.message || 'Unable to end the match.');
    } finally {
      setEnding(false);
    }
  }, [loadMatches, match, onMatchPath]);

  const executeShot = useCallback(async (shot: Shot, shooterSeat: 0 | 1) => {
    if (!match || match.status !== 'active' || recoveryRequired || animating || saving) return;
    const before = gameState;
    setAnimating(true);
    setError(null);
    setStatus(shooterSeat === 1 && mode === 'bot' ? 'CPU is shooting…' : 'Shot in motion…');
    try {
      unlockAudio();
      sfxCue(shot.power, preferences.sound);
      vibrate(Math.floor(15 + shot.power * 25), preferences.vibration);
      const simulation = simulateShot(before, shot, {
        tableSpeed: preferences.tableSpeed,
        recordFrames: true,
        frameInterval: 3,
      });
      await playFrames(simulation.frames, simulation.ticks);
      if (simulation.events.pocketed.length > 0) sfxPocket(preferences.sound);
      else if (simulation.events.firstContact !== null) sfxClack(shot.power, preferences.sound);
      const resolved = applyShotResult(
        before,
        simulation.finalState,
        simulation.events,
        preferences,
        shot.calledPocket === undefined ? undefined : { calledPocket: shot.calledPocket },
      );
      setSaving(true);
      const input: NinjaPoolShotInput = {
        expectedVersion: match.version,
        clientShotId: actionId('shot'),
        shooterSeat,
        ...(shot.calledPocket === undefined ? {} : { calledPocket: shot.calledPocket }),
        ...(simulation.events.pocketed.includes(8)
          ? { eightPocket: pocketIndexAt(simulation.finalState.balls.find((ball) => ball.id === 8)!.pos) }
          : {}),
        events: simulation.events,
      };
      const response = await moduleShellApi.ninjaPoolHall.saveMatchShot(match.id, input);
      if (!stateParity(resolved.state, response.match.logicalState)) {
        throw new Error('Server rule projection did not match the local deterministic result.');
      }
      setMatch(response.match);
      setGameState(resolved.state);
      setAnimationFrame(null);
      if (resolved.state.gameOver) {
        const winner = resolved.state.gameOver.winner;
        const winnerName = winner === null ? 'No one' : resolved.state.players[winner].name;
        setStatus(`${winnerName} wins — ${resolved.state.gameOver.reason}`);
        if (mode === 'bot') {
          if (winner === 0) sfxWin(preferences.sound);
          else sfxLose(preferences.sound);
        } else sfxWin(preferences.sound);
        onMatchPath(response.match.id);
        await loadMatches();
      } else if (resolved.state.pendingChoice) {
        setStatus('A rules choice is required before the next shot.');
      } else {
        const notes = response.outcome.potNotes?.join(' · ');
        setStatus(notes || `${resolved.state.players[resolved.state.currentPlayer].name}'s turn.`);
      }
    } catch (cause: any) {
      setAnimationFrame(null);
      setRecoveryRequired(true);
      setError(cause?.error || cause?.message || 'The shot could not be reconciled. End or reload this match.');
      setStatus('Physical state is no longer trusted after an uncertain save.');
    } finally {
      setSaving(false);
      setAnimating(false);
    }
  }, [animating, gameState, loadMatches, match, mode, onMatchPath, playFrames, preferences, recoveryRequired, saving]);

  const takeHumanShot = useCallback(() => {
    if (!humanCanShoot || !cueBall) return;
    const dx = aimPoint.x - cueBall.pos.x;
    const dy = aimPoint.y - cueBall.pos.y;
    if (Math.hypot(dx, dy) < 8) {
      setStatus('Aim farther away from the cue ball.');
      return;
    }
    void executeShot({
      angle: Math.atan2(dy, dx),
      power,
      ...(requiresCalledPocket ? { calledPocket } : {}),
    }, gameState.currentPlayer);
  }, [aimPoint, calledPocket, cueBall, executeShot, gameState.currentPlayer, humanCanShoot, power, requiresCalledPocket]);

  useEffect(() => {
    if (mode !== 'bot' || !active || recoveryRequired || animating || saving || gameState.gameOver) return;
    if (gameState.pendingChoice?.chooser === 1 && match) {
      botTimerRef.current = window.setTimeout(async () => {
        try {
          const response = await moduleShellApi.ninjaPoolHall.resolveMatchChoice(match.id, {
            expectedVersion: match.version,
            clientActionId: actionId('choice'),
            action: 'accept',
          });
          setMatch(response.match);
          setGameState((current) => acceptTable(current));
        } catch (cause: any) {
          setRecoveryRequired(true);
          setError(cause?.error || cause?.message || 'CPU choice could not be saved.');
        }
      }, 650);
      return () => {
        if (botTimerRef.current !== null) window.clearTimeout(botTimerRef.current);
      };
    }
    if (gameState.currentPlayer !== 1 || gameState.pendingChoice) return;
    botTimerRef.current = window.setTimeout(() => {
      const shot = chooseBotShot(gameState);
      void executeShot(shot, 1);
    }, 850);
    return () => {
      if (botTimerRef.current !== null) window.clearTimeout(botTimerRef.current);
    };
  }, [active, animating, executeShot, gameState, match, mode, recoveryRequired, saving]);

  const resolveChoice = useCallback(async (action: 'accept' | 'rerack') => {
    if (!match || !gameState.pendingChoice) return;
    setSaving(true);
    try {
      const response = await moduleShellApi.ninjaPoolHall.resolveMatchChoice(match.id, {
        expectedVersion: match.version,
        clientActionId: actionId('choice'),
        action,
      });
      const next = action === 'accept'
        ? acceptTable(gameState)
        : rerackAndBreak(gameState, makeInitialBalls());
      setMatch(response.match);
      setGameState(next);
      setStatus(action === 'accept' ? 'Table accepted. Continue play.' : 'Rack reset. The chooser breaks again.');
    } catch (cause: any) {
      setRecoveryRequired(true);
      setError(cause?.error || cause?.message || 'Unable to save the rules choice.');
    } finally {
      setSaving(false);
    }
  }, [gameState, match]);

  const pointerAim = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!humanCanShoot) return;
    const point = canvasPoint(event.currentTarget, event.clientX, event.clientY);
    if (gameState.ballInHand) {
      const placement = findFreeSpot(gameState, point);
      setGameState((current) => ({
        ...current,
        balls: current.balls.map((ball) => ball.id === 0
          ? { ...ball, pos: placement, vel: { x: 0, y: 0 }, inPocket: false }
          : ball),
      }));
      setAimPoint({ x: placement.x + 150, y: placement.y });
      setStatus('Cue ball placed. Drag or tap again to aim.');
      return;
    }
    setAimPoint(point);
  };

  const ballsLeft = (seat: 0 | 1) => {
    const group = gameState.players[seat].group;
    return group ? ballsRemainingForGroup(gameState, group) : null;
  };

  return (
    <section className="nph-match" data-testid={`ninja-pool-${mode}-match`}>
      <style>{matchCss}</style>
      {error && (
        <div className="nphm-error" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button type="button" onClick={() => void loadMatches(true)}><RefreshCw size={15} /> Reload</button>
        </div>
      )}
      <div className="nphm-layout">
        <div className="nphm-card">
          <header className="nphm-toolbar">
            <div>
              <span>{mode === 'bot' ? <Bot size={14} /> : <Users size={14} />} SYS::{mode === 'bot' ? 'CPU_MATCH' : 'HOT_SEAT'}</span>
              <h2>{mode === 'bot' ? 'Vs CPU' : 'Local two-player'}</h2>
              <p>{status}</p>
            </div>
            <div className="nphm-score" aria-label="Match score">
              {[0, 1].map((seat) => (
                <article key={seat} className={gameState.currentPlayer === seat && active ? 'active' : ''}>
                  <strong>{gameState.players[seat as 0 | 1].name}</strong>
                  <span>{gameState.players[seat as 0 | 1].group ?? 'open'}{ballsLeft(seat as 0 | 1) !== null ? ` · ${ballsLeft(seat as 0 | 1)} left` : ''}</span>
                </article>
              ))}
            </div>
          </header>
          <div className="nphm-table">
            <canvas
              ref={canvasRef}
              width={TABLE_WIDTH}
              height={TABLE_HEIGHT}
              tabIndex={0}
              data-testid="ninja-pool-match-table"
              aria-label="Ninja Pool Hall 8-ball table. Touch or click to aim."
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                pointerAim(event);
              }}
              onPointerMove={(event) => {
                if (event.buttons > 0 && !gameState.ballInHand) pointerAim(event);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  takeHumanShot();
                }
              }}
            />
            {(!active || recoveryRequired) && (
              <div className="nphm-overlay">
                {match?.status === 'completed' ? <Trophy size={36} /> : <CircleDot size={36} />}
                <strong>{recoveryRequired ? 'Match recovery required' : match?.status === 'completed' ? 'Match complete' : 'Table ready'}</strong>
                <span>{recoveryRequired
                  ? 'OperatorOS retained the logical result trail, not continuous ball coordinates. End this match before starting a fresh table.'
                  : 'Start a real rules-driven local match. All saved outcomes remain clearly labeled client-reported.'}</span>
                {recoveryRequired && match?.status === 'active' ? (
                  <button type="button" onClick={() => void abandon()} disabled={ending}>
                    {ending ? <Loader2 className="nphm-spin" size={17} /> : <RotateCcw size={17} />} End recovered match
                  </button>
                ) : (
                  <div className="nphm-start">
                    {mode === 'local' && !active && (
                      <label>Player 2 name<input value={opponentName} maxLength={40} onChange={(event) => setOpponentName(event.target.value)} /></label>
                    )}
                    <button type="button" onClick={() => void startMatch()} disabled={starting || (mode === 'local' && !opponentName.trim())} data-testid="ninja-pool-start-match">
                      {starting ? <Loader2 className="nphm-spin" size={17} /> : <Play size={17} />} {starting ? 'Starting…' : 'Start match'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          {gameState.pendingChoice && active && !recoveryRequired && (mode === 'local' || gameState.pendingChoice.chooser === 0) && (
            <div className="nphm-choice">
              <strong>{gameState.pendingChoice.type === '8OnBreak' ? '8-ball made on the break' : 'Break requirements not met'}</strong>
              <span>{gameState.players[gameState.pendingChoice.chooser].name} chooses the table outcome.</span>
              <button type="button" onClick={() => void resolveChoice('accept')} disabled={saving}>Accept table</button>
              <button type="button" onClick={() => void resolveChoice('rerack')} disabled={saving}>Re-rack</button>
            </div>
          )}
          <div className="nphm-controls">
            <label>Shot power <b>{Math.round(power * 100)}%</b><input type="range" min="0.08" max="1" step="0.01" value={power} disabled={!humanCanShoot} onChange={(event) => setPower(Number(event.target.value))} /></label>
            {requiresCalledPocket && humanCanShoot && (
              <label>Called 8-ball pocket<select value={calledPocket} onChange={(event) => setCalledPocket(Number(event.target.value))}>{POCKETS.map((_, index) => <option key={index} value={index}>Pocket {index + 1}</option>)}</select></label>
            )}
            <button type="button" className="primary" onClick={takeHumanShot} disabled={!humanCanShoot} data-testid="ninja-pool-match-shoot">
              {animating || saving ? <Loader2 className="nphm-spin" size={18} /> : <CircleDot size={18} />} {animating ? 'Balls moving…' : saving ? 'Saving…' : 'Take shot'}
            </button>
            <button type="button" onClick={() => void abandon()} disabled={!active || animating || saving || ending}><RotateCcw size={17} /> End match</button>
          </div>
          <div className="nphm-boundary"><ShieldCheck size={17} /><span><b>Verified result:</b> Rules and result history are tracked automatically, while physical shot details come from this device. These results never power a competitive leaderboard or rewards.</span></div>
        </div>
        <aside className="nphm-history">
          <header><span><History size={16} /> Match history</span><button type="button" onClick={() => void loadMatches()} aria-label="Refresh match history"><RefreshCw className={loading ? 'nphm-spin' : ''} size={15} /></button></header>
          {loading && matches.length === 0 ? <p>Loading results…</p> : matches.length === 0 ? <p>No structured matches yet.</p> : matches.map((item) => (
            <article key={item.id}>
              <div><strong>{item.mode === 'bot' ? 'Vs CPU' : `Vs ${item.opponentName}`}</strong><time>{formatDate(item.startedAt)}</time></div>
              <span>{item.status}{item.result ? ` · ${item.result.replace('_', ' ')}` : ''}</span>
              <small>{item.shotCount} shots · {item.evidence.replaceAll('_', ' ')}</small>
            </article>
          ))}
        </aside>
      </div>
    </section>
  );
}

const matchCss = `
  .nph-match{color:#f8fafc}.nphm-layout{display:grid;grid-template-columns:minmax(0,1fr) 285px;gap:18px;align-items:start}.nphm-card,.nphm-history{border:1px solid rgba(248,113,113,.2);background:rgba(9,9,13,.9);box-shadow:0 24px 70px rgba(0,0,0,.34);border-radius:18px;overflow:hidden}.nphm-toolbar{padding:18px 20px;display:flex;justify-content:space-between;gap:18px}.nphm-toolbar>div:first-child>span{display:flex;align-items:center;gap:7px;color:#f87171;font:700 11px ui-monospace,monospace;letter-spacing:.16em}.nphm-toolbar h2{margin:6px 0 3px;text-transform:uppercase;font-size:clamp(22px,3vw,32px)}.nphm-toolbar p{margin:0;color:#94a3b8;font-size:12px;max-width:620px}.nphm-score{display:flex;gap:8px}.nphm-score article{min-width:130px;padding:9px 11px;border:1px solid rgba(148,163,184,.16);border-radius:10px;background:rgba(15,23,42,.7)}.nphm-score article.active{border-color:rgba(248,113,113,.6);background:rgba(127,29,29,.25)}.nphm-score strong,.nphm-score span{display:block}.nphm-score span{margin-top:3px;color:#94a3b8;font-size:10px;text-transform:uppercase}.nphm-table{position:relative;margin:0 18px;border:1px solid rgba(248,113,113,.28);background:#050305;touch-action:none}.nphm-table canvas{display:block;width:100%;aspect-ratio:2/1;cursor:crosshair}.nphm-table canvas:focus-visible{outline:3px solid #f87171;outline-offset:3px}.nphm-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:8px;padding:22px}.nphm-overlay svg{color:#f87171}.nphm-overlay>strong{font-size:clamp(18px,3vw,30px);text-transform:uppercase}.nphm-overlay>span{max-width:520px;color:#cbd5e1;font-size:12px}.nphm-overlay button,.nphm-controls button,.nphm-choice button{min-height:42px;padding:9px 14px;border-radius:9px;border:1px solid rgba(148,163,184,.24);background:rgba(30,41,59,.74);color:#fff;font-weight:800;display:inline-flex;align-items:center;justify-content:center;gap:7px;cursor:pointer}.nphm-overlay button,.nphm-controls button.primary{border:0;background:linear-gradient(135deg,#ef4444,#b91c1c)}.nphm-start{display:flex;gap:10px;align-items:end}.nphm-start label{display:grid;gap:5px;color:#cbd5e1;font-size:10px;text-align:left}.nphm-start input,.nphm-controls select{background:#0f172a;color:#fff;border:1px solid #334155;border-radius:7px;padding:8px}.nphm-choice{margin:12px 18px 0;padding:12px;display:flex;gap:9px;align-items:center;flex-wrap:wrap;border:1px solid rgba(250,204,21,.28);background:rgba(113,63,18,.2);border-radius:10px}.nphm-choice span{color:#fde68a;font-size:12px;flex:1}.nphm-controls{padding:17px 19px;display:flex;align-items:end;gap:10px;flex-wrap:wrap}.nphm-controls label{display:grid;gap:6px;flex:1;min-width:180px;color:#cbd5e1;font-size:11px}.nphm-controls label b{float:right}.nphm-controls input{width:100%;accent-color:#ef4444}.nphm-controls button:disabled,.nphm-overlay button:disabled,.nphm-choice button:disabled{opacity:.45;cursor:not-allowed}.nphm-boundary{margin:0 19px 18px;padding:11px 13px;display:flex;gap:8px;border:1px solid rgba(34,197,94,.22);background:rgba(22,101,52,.11);border-radius:9px;color:#bbf7d0;font-size:11px;line-height:1.5}.nphm-boundary svg{flex:none}.nphm-history{position:sticky;top:18px}.nphm-history header{padding:14px 15px;display:flex;justify-content:space-between;border-bottom:1px solid rgba(148,163,184,.14)}.nphm-history header span{display:flex;gap:7px;align-items:center;text-transform:uppercase;font-size:11px;font-weight:800}.nphm-history button{border:0;background:none;color:#94a3b8;cursor:pointer}.nphm-history>p{padding:25px;color:#94a3b8;font-size:12px}.nphm-history article{padding:13px 15px;border-bottom:1px solid rgba(148,163,184,.1)}.nphm-history article div{display:flex;justify-content:space-between;gap:8px}.nphm-history time{color:#64748b;font-size:9px}.nphm-history article>span,.nphm-history small{display:block;margin-top:5px;color:#cbd5e1;font-size:10px;text-transform:uppercase}.nphm-history small{color:#64748b}.nphm-error{margin-bottom:12px;padding:12px;border:1px solid rgba(248,113,113,.4);background:rgba(127,29,29,.28);border-radius:10px;display:flex;gap:9px;align-items:center;color:#fecaca}.nphm-error span{flex:1}.nphm-error button{border:1px solid rgba(254,202,202,.3);background:transparent;color:#fff;padding:7px 9px;border-radius:7px;display:flex;gap:5px}.nphm-spin{animation:nphm-spin .8s linear infinite}@keyframes nphm-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.nphm-spin{animation:none}}@media(max-width:980px){.nphm-layout{grid-template-columns:1fr}.nphm-history{position:static}}@media(max-width:700px){.nphm-toolbar{display:grid}.nphm-score{display:grid;grid-template-columns:1fr 1fr}.nphm-score article{min-width:0}.nphm-table{margin:0 7px}.nphm-controls{display:grid;grid-template-columns:1fr 1fr}.nphm-controls label{grid-column:1/-1}.nphm-start{display:grid}.nphm-choice span{flex-basis:100%}}
`;
