'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CircleDot, Copy, DoorOpen, Loader2, RefreshCw, ShieldCheck, Users, Wifi } from 'lucide-react';
import { moduleShellApi, type NinjaPoolOnlineRoom, type NinjaPoolProfile } from '@/lib/auth';
import {
  BALL_RADIUS,
  PLAY_BOTTOM,
  PLAY_LEFT,
  PLAY_RIGHT,
  PLAY_TOP,
  POCKETS,
  POCKET_RADIUS,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  findFreeSpot,
  predictAim,
  type SimulationFrame,
} from '@/lib/ninja-pool-hall/physics';
import { ballsRemainingForGroup, playerHasClearedGroup } from '@/lib/ninja-pool-hall/rules';
import { simulateOnlineShot } from '@/lib/ninja-pool-hall/online';
import { NinjaPoolRoomSocket, type NinjaPoolSocketState } from '@/lib/ninja-pool-hall/network';
import { sfxClack, sfxCue, sfxPocket, unlockAudio, vibrate } from '@/lib/ninja-pool-hall/audio';
import type { Ball, Shot, Vec2 } from '@/lib/ninja-pool-hall/types';
import { visualQualityProfile } from '@/lib/ninja-pool-hall/performance';

type Entry = 'online' | 'host' | 'join';

interface Props {
  entry: Entry;
  roomId: string | null;
  profile: NinjaPoolProfile;
  onRoomPath: (roomId: string | null) => void;
}

const BALL_COLORS: Record<number, string> = {
  0: '#f8fafc', 1: '#facc15', 2: '#2563eb', 3: '#dc2626', 4: '#7c3aed', 5: '#f97316',
  6: '#16a34a', 7: '#7f1d1d', 8: '#050505', 9: '#facc15', 10: '#2563eb', 11: '#dc2626',
  12: '#7c3aed', 13: '#f97316', 14: '#16a34a', 15: '#7f1d1d',
};

function clientId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
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
  ctx.shadowColor = 'rgba(0,0,0,.58)';
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

export default function NinjaPoolHallOnline({ entry, roomId, profile, onRoomPath }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const socketRef = useRef<NinjaPoolRoomSocket | null>(null);
  const roomRef = useRef<NinjaPoolOnlineRoom | null>(null);
  const handlerRef = useRef<(message: Record<string, any>) => void>(() => undefined);
  const processedGuestShots = useRef(new Set<string>());
  const [room, setRoom] = useState<NinjaPoolOnlineRoom | null>(null);
  const [socketState, setSocketState] = useState<NinjaPoolSocketState>('closed');
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(entry === 'host' || Boolean(roomId));
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Host a protected room or join another player in your OperatorOS tenant.');
  const [aimPoint, setAimPoint] = useState<Vec2>({ x: 650, y: TABLE_HEIGHT / 2 });
  const [cuePlacement, setCuePlacement] = useState<Vec2 | null>(null);
  const [power, setPower] = useState(0.58);
  const [english, setEnglish] = useState<Vec2>({ x: 0, y: 0 });
  const [calledPocket, setCalledPocket] = useState(0);
  const [animationFrame, setAnimationFrame] = useState<SimulationFrame | null>(null);
  const [animating, setAnimating] = useState(false);

  useEffect(() => { roomRef.current = room; }, [room]);

  const adoptRoom = useCallback((next: NinjaPoolOnlineRoom) => {
    if (roomRef.current && next.version < roomRef.current.version) return;
    roomRef.current = next;
    setRoom(next);
    setCuePlacement(null);
    setError(null);
    if (next.status === 'waiting') setStatus(`Room ${next.code} is ready. Share the code with a tenant member.`);
    else if (next.status === 'completed') setStatus(next.authoritativeState.gameOver?.reason ?? 'The rack is complete.');
    else if (next.status === 'active') setStatus(`${next.authoritativeState.players[next.authoritativeState.currentPlayer].name}'s turn.`);
  }, []);

  const playFrames = useCallback((frames: SimulationFrame[], ticks: number) => new Promise<void>((resolve) => {
    if (frames.length === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return resolve();
    const quality = visualQualityProfile();
    const duration = Math.max(420, Math.min(3_600, ticks * 3.5 * quality.durationScale));
    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      setAnimationFrame(frames[Math.min(frames.length - 1, Math.floor(progress * frames.length))] ?? frames.at(-1)!);
      if (progress >= 1) {
        animationRef.current = null;
        resolve();
      } else animationRef.current = requestAnimationFrame(step);
    };
    animationRef.current = requestAnimationFrame(step);
  }), []);

  const animateShot = useCallback(async (before: NinjaPoolOnlineRoom, shot: Shot) => {
    setAnimating(true);
    unlockAudio();
    sfxCue(shot.power, before.rulesSettings.sound);
    vibrate(Math.floor(14 + shot.power * 22), before.rulesSettings.vibration);
    const quality = visualQualityProfile();
    const result = simulateOnlineShot(before.authoritativeState, shot, before.rulesSettings, true, quality.frameInterval);
    await playFrames(result.frames, result.ticks);
    if (result.events.pocketed.length > 0) sfxPocket(before.rulesSettings.sound);
    else if (result.events.firstContact !== null) sfxClack(shot.power, before.rulesSettings.sound);
    setAnimationFrame(null);
    setAnimating(false);
    return result;
  }, [playFrames]);

  const processGuestShot = useCallback(async (message: Record<string, any>) => {
    const current = roomRef.current;
    if (!current || current.role !== 'host' || processedGuestShots.current.has(message.clientShotId)) return;
    processedGuestShots.current.add(message.clientShotId);
    try {
      setStatus('Guest shot received. Host simulation is verifying the table…');
      const result = await animateShot(current, message.shot as Shot);
      const sent = socketRef.current?.send({
        type: 'hostShotResult',
        expectedVersion: message.expectedVersion,
        clientShotId: message.clientShotId,
        shooterSeat: 1,
        shot: message.shot,
        resultHash: result.resultHash,
      });
      if (!sent) throw new Error('The host connection closed before the verified result could be sent.');
    } catch (cause: any) {
      processedGuestShots.current.delete(message.clientShotId);
      setError(cause?.message || 'The guest shot could not be verified.');
      socketRef.current?.send({ type: 'stateRequest' });
    }
  }, [animateShot]);

  handlerRef.current = (message) => {
    if (message.type === 'joined' || message.type === 'roomSnapshot' || message.type === 'staleVersion') {
      if (message.room) adoptRoom(message.room as NinjaPoolOnlineRoom);
      return;
    }
    if (message.type === 'shotCommitted' && message.room) {
      adoptRoom(message.room as NinjaPoolOnlineRoom);
      return;
    }
    if (message.type === 'guestShotIntent') {
      void processGuestShot(message);
      return;
    }
    if (message.type === 'desync') {
      setError('A deterministic result mismatch was rejected. The authoritative room state has been restored.');
      return;
    }
    if (message.type === 'error') setError(message.error || 'The online room rejected that action.');
  };

  useEffect(() => {
    if (!room?.id) return;
    const connection = new NinjaPoolRoomSocket({
      roomId: room.id,
      onMessage: (message) => handlerRef.current(message),
      onState: setSocketState,
    });
    socketRef.current = connection;
    connection.connect();
    return () => {
      connection.close(false);
      if (socketRef.current === connection) socketRef.current = null;
    };
  }, [room?.id]);

  useEffect(() => {
    let cancelled = false;
    const open = async () => {
      if (entry === 'host' && !roomId) {
        try {
          const created = await moduleShellApi.ninjaPoolHall.hostOnlineRoom({ clientRoomId: clientId('room') });
          if (!cancelled) { adoptRoom(created); onRoomPath(created.id); }
        } catch (cause: any) {
          if (!cancelled) setError(cause?.error || cause?.message || 'Unable to host an online room.');
        } finally { if (!cancelled) setLoading(false); }
      } else if (roomId) {
        try {
          const response = await moduleShellApi.ninjaPoolHall.getOnlineRoom(roomId);
          if (!cancelled) adoptRoom(response.room);
        } catch (cause: any) {
          if (!cancelled) setError(cause?.error || cause?.message || 'Unable to recover the online room.');
        } finally { if (!cancelled) setLoading(false); }
      } else setLoading(false);
    };
    void open();
    return () => { cancelled = true; };
  }, [adoptRoom, entry, onRoomPath, roomId]);

  useEffect(() => () => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
  }, []);

  const join = async () => {
    setLoading(true);
    setError(null);
    try {
      const joined = await moduleShellApi.ninjaPoolHall.joinOnlineRoom({ code: joinCode.trim().toUpperCase() });
      adoptRoom(joined);
      onRoomPath(joined.id);
    } catch (cause: any) {
      setError(cause?.error || cause?.message || 'That room could not be joined.');
    } finally { setLoading(false); }
  };

  const state = room?.authoritativeState ?? null;
  const seat = room?.role === 'host' ? 0 : 1;
  const canShoot = Boolean(room && state && room.status === 'active' && socketState === 'open' && !animating
    && !state.gameOver && !state.pendingChoice && state.currentPlayer === seat);
  const cueBall = state?.balls.find((ball) => ball.id === 0) ?? null;
  const onEight = state ? playerHasClearedGroup(state, seat) : false;
  const requiresPocket = Boolean(room?.rulesSettings.callShotOn8 && onEight);

  const drawTable = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !state) return;
    ctx.clearRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
    const rail = ctx.createLinearGradient(0, 0, 0, TABLE_HEIGHT);
    rail.addColorStop(0, '#27130f'); rail.addColorStop(.5, '#120708'); rail.addColorStop(1, '#050304');
    ctx.fillStyle = rail; ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
    const felt = ctx.createRadialGradient(500, 250, 40, 500, 250, 620);
    felt.addColorStop(0, '#64131d'); felt.addColorStop(.62, '#360a10'); felt.addColorStop(1, '#160306');
    ctx.fillStyle = felt; ctx.fillRect(PLAY_LEFT, PLAY_TOP, PLAY_RIGHT - PLAY_LEFT, PLAY_BOTTOM - PLAY_TOP);
    ctx.strokeStyle = 'rgba(248,113,113,.48)'; ctx.lineWidth = 2;
    ctx.strokeRect(PLAY_LEFT - 4, PLAY_TOP - 4, PLAY_RIGHT - PLAY_LEFT + 8, PLAY_BOTTOM - PLAY_TOP + 8);
    for (const pocket of POCKETS) { ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(pocket.x, pocket.y, POCKET_RADIUS + 2, 0, Math.PI * 2); ctx.fill(); }
    const positions = new Map<number, Vec2>();
    if (animationFrame) animationFrame.positions.forEach((pos) => { if (!pos.inPocket) positions.set(pos.id, { x: pos.x, y: pos.y }); });
    else state.balls.forEach((ball) => { if (!ball.inPocket) positions.set(ball.id, ball.id === 0 && cuePlacement ? cuePlacement : ball.pos); });
    const cuePos = positions.get(0);
    if (cuePos && canShoot && room?.rulesSettings.aimGuide) {
      const dx = aimPoint.x - cuePos.x; const dy = aimPoint.y - cuePos.y; const length = Math.hypot(dx, dy) || 1;
      const guide = predictAim(state, cuePos, { x: dx / length, y: dy / length });
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.setLineDash([8, 7]);
      ctx.beginPath(); ctx.moveTo(cuePos.x, cuePos.y); ctx.lineTo(guide.end.x, guide.end.y); ctx.stroke(); ctx.restore();
    }
    state.balls.forEach((ball) => { const position = positions.get(ball.id); if (position) drawBall(ctx, ball, position); });
    if (room?.status !== 'active') { ctx.fillStyle = 'rgba(3,7,18,.56)'; ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT); }
  }, [aimPoint, animationFrame, canShoot, cuePlacement, room?.rulesSettings.aimGuide, room?.status, state]);

  useEffect(() => drawTable(), [drawTable]);

  const pointerAim = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canShoot || !state) return;
    const point = canvasPoint(event.currentTarget, event.clientX, event.clientY);
    if (state.ballInHand && !cuePlacement) {
      const placement = findFreeSpot(state, point);
      setCuePlacement(placement);
      setAimPoint({ x: placement.x + 150, y: placement.y });
    } else setAimPoint(point);
  };

  const takeShot = async () => {
    const current = roomRef.current;
    if (!current || !canShoot || !cueBall) return;
    const origin = cuePlacement ?? cueBall.pos;
    const dx = aimPoint.x - origin.x; const dy = aimPoint.y - origin.y;
    if (Math.hypot(dx, dy) < 8) { setStatus('Aim farther away from the cue ball.'); return; }
    const shot: Shot = {
      angle: Math.atan2(dy, dx), power,
      tipOffset: english,
      ...(current.authoritativeState.ballInHand ? { cuePlacement: origin } : {}),
      ...(requiresPocket ? { calledPocket } : {}),
    };
    const expectedVersion = current.version;
    const clientShotId = clientId('shot');
    setError(null);
    try {
      const result = await animateShot(current, shot);
      const message = current.role === 'host'
        ? { type: 'hostShotResult', expectedVersion, clientShotId, shooterSeat: 0, shot, resultHash: result.resultHash }
        : { type: 'shotIntent', expectedVersion, clientShotId, shot };
      if (!socketRef.current?.send(message)) throw new Error('The room connection closed before the shot could be sent.');
      setStatus(current.role === 'host' ? 'Server re-simulating the host result…' : 'Shot sent to the host authority for verification…');
    } catch (cause: any) {
      setError(cause?.message || 'The shot could not be submitted.');
      socketRef.current?.send({ type: 'stateRequest' });
    }
  };

  const leave = () => {
    socketRef.current?.close(true);
    setRoom(null);
    onRoomPath(null);
  };

  const choose = (action: 'accept' | 'rerack') => {
    if (!room || !state?.pendingChoice || state.pendingChoice.chooser !== seat) return;
    socketRef.current?.send({ type: 'choice', expectedVersion: room.version, clientActionId: clientId('choice'), action });
  };

  if (!room) {
    return (
      <section className="npho-lobby" data-testid="ninja-pool-online-lobby">
        <style>{onlineCss}</style>
        <header><Wifi size={28} /><div><span>SYS::AUTHORIZED_ROOMS</span><h2>Online 8-ball</h2><p>Rooms are restricted to entitled members of your active OperatorOS tenant.</p></div></header>
        {error && <div className="npho-error" role="alert"><AlertTriangle size={17} />{error}</div>}
        {loading ? <div className="npho-loading"><Loader2 className="npho-spin" /> Preparing the table…</div> : (
          <div className="npho-entry-grid">
            <article><Users size={25} /><strong>Host a room</strong><p>Create a durable, authenticated room and share its four-character code.</p><button type="button" onClick={async () => { setLoading(true); try { const created = await moduleShellApi.ninjaPoolHall.hostOnlineRoom({ clientRoomId: clientId('room') }); adoptRoom(created); onRoomPath(created.id); } catch (cause: any) { setError(cause?.error || cause?.message); } finally { setLoading(false); } }}>Host table</button></article>
            <article><DoorOpen size={25} /><strong>Join a room</strong><p>Enter the room code from a player in your tenant.</p><label>Room code<input value={joinCode} maxLength={4} autoCapitalize="characters" onChange={(event) => setJoinCode(event.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase())} /></label><button type="button" disabled={joinCode.length !== 4} onClick={() => void join()}>Join table</button></article>
          </div>
        )}
      </section>
    );
  }

  const ballsLeft = (playerSeat: 0 | 1) => {
    const group = state?.players[playerSeat].group;
    return state && group ? ballsRemainingForGroup(state, group) : null;
  };

  return (
    <section className="npho-room" data-testid="ninja-pool-online-room">
      <style>{onlineCss}</style>
      {error && <div className="npho-error" role="alert"><AlertTriangle size={17} /><span>{error}</span><button type="button" onClick={() => socketRef.current?.send({ type: 'stateRequest' })}><RefreshCw size={14} /> Resync</button></div>}
      <div className="npho-card">
        <header className="npho-toolbar">
          <div><span><Wifi size={14} /> SYS::HOST_AUTHORITY</span><h2>Online room <b>{room.code}</b></h2><p>{status}</p></div>
          <div className={`npho-connection ${socketState}`}><i />{socketState}</div>
          <button className="npho-code" type="button" onClick={() => void navigator.clipboard?.writeText(room.code)}><Copy size={14} /> Copy code</button>
        </header>
        <div className="npho-score">
          {([0, 1] as const).map((playerSeat) => <article key={playerSeat} className={state?.currentPlayer === playerSeat && room.status === 'active' ? 'active' : ''}><strong>{state?.players[playerSeat].name}</strong><span>{playerSeat === 0 ? 'host' : 'guest'} · {state?.players[playerSeat].group ?? 'open'}{ballsLeft(playerSeat) !== null ? ` · ${ballsLeft(playerSeat)} left` : ''}</span></article>)}
        </div>
        <div className="npho-table">
          <canvas ref={canvasRef} width={TABLE_WIDTH} height={TABLE_HEIGHT} tabIndex={0} data-testid="ninja-pool-online-table" aria-label="Authenticated online 8-ball table. Touch or click to aim." onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); pointerAim(event); }} onPointerMove={(event) => { if (event.buttons > 0 && !state?.ballInHand) pointerAim(event); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void takeShot(); } }} />
          {room.status === 'waiting' && <div className="npho-overlay"><Users size={34} /><strong>Waiting for player two</strong><span>Share room code {room.code}. Only an authenticated member of this tenant can join.</span></div>}
          {room.status !== 'waiting' && room.status !== 'active' && <div className="npho-overlay"><CircleDot size={34} /><strong>Rack {room.status}</strong><span>{state?.gameOver?.reason ?? 'This room is finalized and remains available as a durable match trace.'}</span></div>}
        </div>
        {state?.pendingChoice && state.pendingChoice.chooser === seat && <div className="npho-choice"><strong>Rules choice required</strong><button type="button" onClick={() => choose('accept')}>Accept table</button><button type="button" onClick={() => choose('rerack')}>Re-rack</button></div>}
        <div className="npho-controls">
          <label>Power <b>{Math.round(power * 100)}%</b><input type="range" min="0.08" max="1" step="0.01" value={power} disabled={!canShoot} onChange={(event) => setPower(Number(event.target.value))} /></label>
          <label>Side English <b>{english.x.toFixed(2)}</b><input type="range" min="-0.85" max="0.85" step="0.05" value={english.x} disabled={!canShoot} onChange={(event) => setEnglish((value) => ({ ...value, x: Number(event.target.value) }))} /></label>
          <label>Follow / draw <b>{english.y.toFixed(2)}</b><input type="range" min="-0.5" max="0.5" step="0.05" value={english.y} disabled={!canShoot} onChange={(event) => setEnglish((value) => ({ ...value, y: Number(event.target.value) }))} /></label>
          {requiresPocket && <label>Called pocket<select value={calledPocket} onChange={(event) => setCalledPocket(Number(event.target.value))}>{POCKETS.map((_, index) => <option key={index} value={index}>Pocket {index + 1}</option>)}</select></label>}
          <button className="primary" type="button" disabled={!canShoot} onClick={() => void takeShot()} data-testid="ninja-pool-online-shoot">{animating ? <Loader2 className="npho-spin" size={17} /> : <CircleDot size={17} />}{animating ? 'Balls moving…' : 'Take shot'}</button>
          <button type="button" onClick={leave}><DoorOpen size={16} /> Leave</button>
        </div>
        <div className="npho-trust"><ShieldCheck size={17} /><span><b>Authoritative room:</b> the host runs the visible simulation, OperatorOS independently re-simulates every result, rejects impossible or stale shots, and persists each accepted state for reconnect recovery.</span></div>
      </div>
    </section>
  );
}

const onlineCss = `
  .npho-lobby,.npho-room{color:#f8fafc}.npho-lobby,.npho-card{border:1px solid rgba(248,113,113,.2);background:rgba(9,9,13,.91);box-shadow:0 24px 70px rgba(0,0,0,.34);border-radius:18px;overflow:hidden}.npho-lobby{padding:22px}.npho-lobby>header{display:flex;gap:13px;align-items:center}.npho-lobby>header>svg{color:#f87171}.npho-lobby header span,.npho-toolbar>div:first-child>span{color:#f87171;font:700 10px ui-monospace,monospace;letter-spacing:.16em}.npho-lobby h2,.npho-toolbar h2{margin:5px 0 3px;text-transform:uppercase}.npho-lobby p,.npho-toolbar p{margin:0;color:#94a3b8;font-size:12px;line-height:1.5}.npho-entry-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:20px}.npho-entry-grid article{padding:20px;border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.55);border-radius:13px;display:grid;gap:9px}.npho-entry-grid article>svg{color:#f87171}.npho-entry-grid strong{font-size:18px;text-transform:uppercase}.npho-entry-grid label{display:grid;gap:5px;color:#cbd5e1;font-size:10px}.npho-entry-grid input,.npho-controls select{background:#0f172a;color:#fff;border:1px solid #334155;border-radius:7px;padding:9px}.npho-entry-grid input{font:800 22px ui-monospace,monospace;letter-spacing:.3em;text-transform:uppercase}.npho-entry-grid button,.npho-controls button,.npho-choice button,.npho-code,.npho-error button{min-height:40px;padding:9px 13px;border-radius:8px;border:1px solid rgba(148,163,184,.24);background:rgba(30,41,59,.75);color:#fff;font-weight:800;display:inline-flex;align-items:center;justify-content:center;gap:7px}.npho-entry-grid button,.npho-controls button.primary{border:0;background:linear-gradient(135deg,#ef4444,#b91c1c)}.npho-entry-grid button:disabled,.npho-controls button:disabled{opacity:.45}.npho-loading{padding:34px;display:flex;justify-content:center;gap:9px;color:#cbd5e1}.npho-error{margin-bottom:12px;padding:11px 13px;border:1px solid rgba(248,113,113,.38);background:rgba(127,29,29,.26);border-radius:9px;color:#fecaca;display:flex;gap:8px;align-items:center}.npho-error span{flex:1}.npho-toolbar{padding:17px 19px;display:flex;gap:12px;align-items:center}.npho-toolbar>div:first-child{flex:1}.npho-toolbar h2 b{color:#f87171}.npho-toolbar>div:first-child>span{display:flex;gap:6px;align-items:center}.npho-connection{padding:7px 9px;border:1px solid rgba(148,163,184,.2);border-radius:999px;color:#94a3b8;font-size:10px;text-transform:uppercase;display:flex;gap:6px;align-items:center}.npho-connection i{width:7px;height:7px;border-radius:50%;background:#64748b}.npho-connection.open{color:#bbf7d0;border-color:rgba(34,197,94,.28)}.npho-connection.open i{background:#22c55e;box-shadow:0 0 10px #22c55e}.npho-score{padding:0 19px 12px;display:grid;grid-template-columns:1fr 1fr;gap:8px}.npho-score article{padding:9px 11px;border:1px solid rgba(148,163,184,.15);background:rgba(15,23,42,.62);border-radius:9px}.npho-score article.active{border-color:rgba(248,113,113,.58);background:rgba(127,29,29,.22)}.npho-score strong,.npho-score span{display:block}.npho-score span{margin-top:3px;color:#94a3b8;font-size:10px;text-transform:uppercase}.npho-table{position:relative;margin:0 18px;border:1px solid rgba(248,113,113,.28);background:#050305;touch-action:none}.npho-table canvas{display:block;width:100%;aspect-ratio:2/1;cursor:crosshair}.npho-table canvas:focus-visible{outline:3px solid #f87171;outline-offset:3px}.npho-overlay{position:absolute;inset:0;padding:24px;display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;text-align:center;background:rgba(3,7,18,.35)}.npho-overlay svg{color:#f87171}.npho-overlay strong{font-size:clamp(18px,3vw,30px);text-transform:uppercase}.npho-overlay span{max-width:560px;color:#cbd5e1;font-size:12px}.npho-choice{margin:12px 18px 0;padding:11px;border:1px solid rgba(250,204,21,.28);background:rgba(113,63,18,.18);border-radius:9px;display:flex;gap:8px;align-items:center}.npho-choice strong{flex:1}.npho-controls{padding:16px 18px;display:flex;gap:9px;align-items:end;flex-wrap:wrap}.npho-controls label{min-width:145px;flex:1;display:grid;gap:5px;color:#cbd5e1;font-size:10px}.npho-controls label b{float:right}.npho-controls input{width:100%;accent-color:#ef4444}.npho-trust{margin:0 18px 18px;padding:11px 12px;border:1px solid rgba(34,197,94,.22);background:rgba(22,101,52,.11);border-radius:9px;color:#bbf7d0;display:flex;gap:8px;font-size:11px;line-height:1.5}.npho-trust svg{flex:none}.npho-spin{animation:npho-spin .8s linear infinite}@keyframes npho-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.npho-spin{animation:none}}@media(max-width:760px){.npho-entry-grid{grid-template-columns:1fr}.npho-toolbar{align-items:flex-start;flex-wrap:wrap}.npho-toolbar>div:first-child{flex-basis:100%}.npho-table{margin:0 7px}.npho-controls{display:grid;grid-template-columns:1fr 1fr}.npho-controls label{grid-column:1/-1}.npho-score{padding-inline:7px}.npho-code{font-size:0}.npho-code svg{margin:0}}
`;
