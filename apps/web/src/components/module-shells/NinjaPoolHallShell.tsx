'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bot,
  Crosshair,
  Gamepad2,
  Loader2,
  Settings,
  ShieldCheck,
  Target,
  Trophy,
  Users,
  Wifi,
} from 'lucide-react';
import { moduleShellApi, type NinjaPoolProfileResponse } from '@/lib/auth';
import NinjaPoolHallPractice from './NinjaPoolHallPractice';
import NinjaPoolHallMatch from './NinjaPoolHallMatch';
import NinjaPoolHallProfile from './NinjaPoolHallProfile';
import NinjaPoolHallMatchDetail from './NinjaPoolHallMatchDetail';
import NinjaPoolHallOnline from './NinjaPoolHallOnline';

type View =
  'home' | 'practice' | 'bot' | 'local' | 'online' | 'host' | 'join' | 'profile' | 'detail';

function modulePath(path: string): string {
  const clean = path.replace(/^\/modules\/ninja-pool-hall(?=\/|$)/, '') || '/';
  return clean.replace(/\/+$/, '') || '/';
}

function browserPath(path: string): string {
  if (
    typeof window !== 'undefined' &&
    window.location.pathname.startsWith('/modules/ninja-pool-hall')
  ) {
    return `/modules/ninja-pool-hall${path === '/' ? '' : path}`;
  }
  return path;
}

function routeState(routePath?: string): {
  view: View;
  matchId: string | null;
  roomId: string | null;
} {
  if (typeof window === 'undefined') return { view: 'home', matchId: null, roomId: null };
  const path = modulePath(routePath || window.location.pathname);
  const detail = path.match(/^\/matches\/([a-z0-9-]+)$/i);
  const onlineRoom = path.match(/^\/rooms\/([a-z0-9-]+)$/i);
  if (detail) return { view: 'detail', matchId: detail[1]!, roomId: null };
  if (onlineRoom) return { view: 'online', matchId: null, roomId: onlineRoom[1]! };
  if (path === '/practice') return { view: 'practice', matchId: null, roomId: null };
  if (path === '/cpu') return { view: 'bot', matchId: null, roomId: null };
  if (path === '/local') return { view: 'local', matchId: null, roomId: null };
  if (path === '/online') return { view: 'online', matchId: null, roomId: null };
  if (path === '/host') return { view: 'host', matchId: null, roomId: null };
  if (path === '/join') return { view: 'join', matchId: null, roomId: null };
  if (path === '/profile') return { view: 'profile', matchId: null, roomId: null };
  if (['/history', '/stats', '/rules', '/settings'].includes(path))
    return { view: 'profile', matchId: null, roomId: null };
  return { view: 'home', matchId: null, roomId: null };
}

const pathFor: Record<Exclude<View, 'detail'>, string> = {
  home: '/',
  practice: '/practice',
  bot: '/cpu',
  local: '/local',
  online: '/online',
  host: '/host',
  join: '/join',
  profile: '/profile',
};

export default function NinjaPoolHallShell({
  routePath,
  embedded = false,
  gameActive = false,
  canWrite,
}: {
  baseUrl?: string;
  routePath?: string;
  embedded?: boolean;
  gameActive?: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const initial = routeState(routePath);
  const [view, setView] = useState<View>(initial.view);
  const [matchId, setMatchId] = useState<string | null>(initial.matchId);
  const [roomId, setRoomId] = useState<string | null>(initial.roomId);
  const [profileData, setProfileData] = useState<NinjaPoolProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      setProfileData(await moduleShellApi.ninjaPoolHall.getProfile());
      setError(null);
    } catch (cause: any) {
      setError(cause?.error || cause?.message || 'Unable to load Operator Pool Hall profile.');
    }
  }, []);

  useEffect(() => {
    void loadProfile();
    const syncRoute = () => {
      const next = routeState();
      setView(next.view);
      setMatchId(next.matchId);
      setRoomId(next.roomId);
    };
    syncRoute();
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, [loadProfile]);

  useEffect(() => {
    const manifest = document.createElement('link');
    manifest.rel = 'manifest';
    manifest.href = '/ninja-pool-hall.webmanifest';
    document.head.appendChild(manifest);
    if ('serviceWorker' in navigator) {
      const scope =
        window.location.hostname === 'operatorpoolhall.operatoros.net'
          ? '/'
          : '/modules/ninja-pool-hall/';
      void navigator.serviceWorker
        .register('/ninja-pool-hall-sw.js', { scope })
        .catch(() => undefined);
    }
    return () => {
      manifest.remove();
    };
  }, []);

  const navigate = useCallback(
    (next: Exclude<View, 'detail'>) => {
      if (
        roomId &&
        next !== 'online' &&
        !window.confirm('Leave this active online room and return to another Pool Hall page?')
      )
        return;
      router.push(browserPath(pathFor[next]));
      setView(next);
      setMatchId(null);
      setRoomId(null);
    },
    [roomId, router],
  );

  const updateMatchPath = useCallback(
    (id: string | null) => {
      const fallback = view === 'local' ? '/local' : '/cpu';
      window.history.replaceState(null, '', browserPath(id ? `/matches/${id}` : fallback));
    },
    [view],
  );

  const openDetail = useCallback((id: string) => {
    window.history.pushState(null, '', browserPath(`/matches/${id}`));
    setMatchId(id);
    setView('detail');
  }, []);

  const updateRoomPath = useCallback((id: string | null) => {
    window.history.replaceState(null, '', browserPath(id ? `/rooms/${id}` : '/online'));
    setRoomId(id);
    setView('online');
  }, []);

  return (
    <div id="ninja-pool-hall-shell" className="nph-shell" data-testid="ninja-pool-hall-shell">
      <style>{shellCss}</style>
      <div className="nph-shell-wrap">
        {!embedded && (
          <header className="nph-shell-header">
            <div className="nph-shell-mark">
              <Crosshair size={26} />
            </div>
            <div className="nph-shell-copy">
              <span>OPERATOROS // TABLE OPERATIONS</span>
              <h1>
                Operator <b>Pool Hall</b>
              </h1>
              <p>
                Sharpen your 8-ball game with free practice, CPU matches, local hot-seat play, and
                protected online rooms.
              </p>
            </div>
            <div className="nph-shell-badges" aria-label="Game features">
              <span>
                <Gamepad2 size={14} /> Four playable modes
              </span>
              <span>
                <Wifi size={14} /> Private online rooms
              </span>
              <span>
                <ShieldCheck size={14} /> Results checked against the same game rules
              </span>
            </div>
          </header>
        )}

        {(!embedded || gameActive) && (
          <nav className="nph-nav" aria-label="Operator Pool Hall navigation">
            <button className={view === 'home' ? 'active' : ''} onClick={() => navigate('home')}>
              <Target size={15} /> Hall
            </button>
            <button
              className={view === 'practice' ? 'active' : ''}
              onClick={() => navigate('practice')}
            >
              <Crosshair size={15} /> Free Shoot
            </button>
            <button className={view === 'bot' ? 'active' : ''} onClick={() => navigate('bot')}>
              <Bot size={15} /> Vs CPU
            </button>
            <button className={view === 'local' ? 'active' : ''} onClick={() => navigate('local')}>
              <Users size={15} /> Local 2P
            </button>
            <button
              className={['online', 'host', 'join'].includes(view) ? 'active' : ''}
              onClick={() => navigate('online')}
            >
              <Wifi size={15} /> Online
            </button>
            <button
              className={view === 'profile' ? 'active' : ''}
              onClick={() => navigate('profile')}
            >
              <Settings size={15} /> Profile
            </button>
          </nav>
        )}

        {error && (
          <div className="nph-shell-error" role="alert">
            {error}
            <button type="button" onClick={() => void loadProfile()}>
              Retry
            </button>
          </div>
        )}

        {!profileData ? (
          <div className="nph-shell-loading">
            <Loader2 className="spin" size={24} /> Loading your table…
          </div>
        ) : view === 'home' ? (
          <section className="nph-home" data-testid="ninja-pool-dashboard">
            <div className="nph-home-hero">
              <span>TABLE READY</span>
              <h2>Choose your game</h2>
              <p>
                Practice at your own pace, challenge the CPU, pass the table locally, or finish a
                reconnect-safe online rack with another member of your organization.
              </p>
              <div className="nph-home-stats">
                <span>
                  <b>{profileData.progression.matchesCompleted}</b> matches completed
                </span>
                <span>
                  <b>{profileData.progression.wins}</b> CPU wins
                </span>
                <span>
                  <b>{profileData.progression.localMatches}</b> hot-seat results
                </span>
              </div>
            </div>
            <div className="nph-mode-grid">
              <button type="button" onClick={() => navigate('practice')}>
                <Crosshair size={24} />
                <strong>Free Shoot</strong>
                <span>No turns—clear the rack and save your practice summary.</span>
              </button>
              <button type="button" onClick={() => navigate('bot')}>
                <Bot size={24} />
                <strong>Vs CPU</strong>
                <span>Play a complete 8-ball match against the house opponent.</span>
              </button>
              <button type="button" onClick={() => navigate('local')}>
                <Users size={24} />
                <strong>Local two-player</strong>
                <span>Pass-and-play 8-ball with saved results.</span>
              </button>
              <button type="button" onClick={() => navigate('online')}>
                <Wifi size={24} />
                <strong>Online rooms</strong>
                <span>Host or join a match that survives a dropped connection.</span>
              </button>
              <button type="button" onClick={() => navigate('profile')}>
                <Settings size={24} />
                <strong>Profile & rules</strong>
                <span>Choose table speed, feedback, and optional rule variations.</span>
              </button>
            </div>
            <div className="nph-online-disabled">
              <Wifi size={20} />
              <div>
                <strong>Match verification is active</strong>
                <p>
                  Online matches are verified, saved, and reconnectable so both players return to
                  the same confirmed table state.
                </p>
              </div>
            </div>
          </section>
        ) : view === 'practice' ? (
          <NinjaPoolHallPractice canWrite={canWrite} />
        ) : view === 'bot' ? (
          <NinjaPoolHallMatch
            mode="bot"
            profile={profileData.profile}
            onMatchPath={updateMatchPath}
            canWrite={canWrite}
          />
        ) : view === 'local' ? (
          <NinjaPoolHallMatch
            mode="local"
            profile={profileData.profile}
            onMatchPath={updateMatchPath}
            canWrite={canWrite}
          />
        ) : view === 'online' || view === 'host' || view === 'join' ? (
          <NinjaPoolHallOnline
            entry={view}
            roomId={roomId}
            profile={profileData.profile}
            onRoomPath={updateRoomPath}
            canWrite={canWrite}
          />
        ) : view === 'profile' ? (
          <NinjaPoolHallProfile
            value={profileData.profile}
            progression={profileData.progression}
            canWrite={canWrite}
            onSaved={(profile) =>
              setProfileData((current) => (current ? { ...current, profile } : current))
            }
          />
        ) : matchId ? (
          <NinjaPoolHallMatchDetail matchId={matchId} onBack={() => navigate('home')} />
        ) : (
          <button type="button" onClick={() => navigate('home')}>
            Return to hall
          </button>
        )}

        {view === 'home' && profileData && profileData.progression.matchesCompleted > 0 && (
          <button
            className="nph-hidden-detail-link"
            type="button"
            onClick={() => {
              void moduleShellApi.ninjaPoolHall.listMatches(1).then((response) => {
                if (response.matches[0]) openDetail(response.matches[0].id);
              });
            }}
          >
            <Trophy size={15} /> Open latest saved result
          </button>
        )}
      </div>
    </div>
  );
}

const shellCss = `
  .nph-shell{min-height:100vh;padding:24px;color:#f8fafc;background:radial-gradient(circle at 8% 0%,rgba(239,68,68,.18),transparent 28%),radial-gradient(circle at 92% 4%,rgba(127,29,29,.14),transparent 24%),linear-gradient(180deg,#09090d,#030305 72%)}.nph-shell-wrap{max-width:1360px;margin:0 auto;display:grid;gap:18px}.nph-shell-header{position:relative;overflow:hidden;border:1px solid rgba(248,113,113,.22);background:linear-gradient(120deg,rgba(24,24,31,.96),rgba(8,8,12,.94));box-shadow:0 24px 70px rgba(0,0,0,.32);border-radius:18px;padding:22px;display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:18px;align-items:center}.nph-shell-header:after{content:'';position:absolute;inset:auto -8% -48px 42%;height:90px;background:linear-gradient(90deg,transparent,rgba(239,68,68,.2),transparent);transform:skewX(-24deg);pointer-events:none}.nph-shell-mark{width:58px;height:58px;display:grid;place-items:center;border:1px solid rgba(248,113,113,.45);color:#f87171;background:rgba(127,29,29,.18);box-shadow:inset 0 0 22px rgba(239,68,68,.12),0 0 32px rgba(239,68,68,.1);transform:rotate(45deg)}.nph-shell-mark svg{transform:rotate(-45deg)}.nph-shell-copy span{color:#f87171;font:700 10px ui-monospace,monospace;letter-spacing:.2em}.nph-shell-copy h1{margin:5px 0 4px;font-size:clamp(26px,4vw,44px);line-height:1;text-transform:uppercase;letter-spacing:-.04em}.nph-shell-copy h1 b{color:#ef4444}.nph-shell-copy p{margin:0;color:#94a3b8;font-size:13px}.nph-shell-badges{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end;max-width:380px}.nph-shell-badges span{padding:7px 9px;border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.7);border-radius:999px;display:flex;gap:6px;align-items:center;color:#cbd5e1;font-size:10px;white-space:nowrap}.nph-nav{display:flex;gap:7px;flex-wrap:wrap;padding:8px;border:1px solid rgba(148,163,184,.14);background:rgba(9,9,13,.75);border-radius:12px;position:sticky;top:8px;z-index:20;backdrop-filter:blur(12px)}.nph-nav button{min-height:38px;padding:8px 11px;border:1px solid transparent;background:transparent;color:#94a3b8;border-radius:8px;display:flex;gap:6px;align-items:center;font-weight:700}.nph-nav button.active,.nph-nav button:hover{border-color:rgba(248,113,113,.3);background:rgba(127,29,29,.22);color:#fff}.nph-home{display:grid;gap:16px}.nph-home-hero,.nph-mode-grid button,.nph-online-disabled{border:1px solid rgba(248,113,113,.18);background:rgba(9,9,13,.88);border-radius:16px}.nph-home-hero{padding:26px}.nph-home-hero>span{color:#f87171;font:700 10px ui-monospace,monospace;letter-spacing:.18em}.nph-home-hero h2{margin:7px 0 5px;font-size:clamp(26px,4vw,42px);text-transform:uppercase}.nph-home-hero p{margin:0;color:#94a3b8;max-width:820px;line-height:1.6}.nph-home-stats{display:flex;gap:9px;flex-wrap:wrap;margin-top:18px}.nph-home-stats span{min-width:150px;padding:11px;border:1px solid rgba(148,163,184,.14);background:rgba(15,23,42,.6);border-radius:9px;color:#94a3b8;font-size:10px;text-transform:uppercase}.nph-home-stats b{display:block;color:#fff;font-size:22px}.nph-mode-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}.nph-mode-grid button{padding:18px;text-align:left;color:#f8fafc;display:grid;gap:8px;cursor:pointer}.nph-mode-grid button:hover{border-color:rgba(248,113,113,.5);transform:translateY(-1px)}.nph-mode-grid button svg{color:#f87171}.nph-mode-grid strong{text-transform:uppercase}.nph-mode-grid span{color:#94a3b8;font-size:11px;line-height:1.5}.nph-online-disabled{padding:14px;display:flex;gap:11px;color:#cbd5e1}.nph-online-disabled svg{color:#f87171;flex:none}.nph-online-disabled p{margin:4px 0 0;color:#94a3b8;font-size:11px;line-height:1.5}.nph-shell-loading,.nph-shell-error{padding:22px;border:1px solid rgba(248,113,113,.2);background:rgba(9,9,13,.8);border-radius:12px;display:flex;gap:9px;align-items:center}.nph-shell-error{color:#fecaca}.nph-shell-error button{margin-left:auto}.nph-hidden-detail-link{justify-self:start;padding:9px 11px;border:1px solid rgba(148,163,184,.2);background:rgba(15,23,42,.7);color:#e2e8f0;border-radius:8px;display:flex;gap:7px}.spin{animation:nph-shell-spin .8s linear infinite}@keyframes nph-shell-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.spin{animation:none}.nph-mode-grid button:hover{transform:none}}@media(max-width:1100px){.nph-mode-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:900px){.nph-mode-grid{grid-template-columns:1fr 1fr}}@media(max-width:760px){.nph-shell{padding:12px}.nph-shell-header{grid-template-columns:auto 1fr;padding:17px}.nph-shell-badges{grid-column:1/-1;justify-content:flex-start;max-width:none}.nph-shell-mark{width:48px;height:48px}.nph-nav{top:4px}.nph-mode-grid{grid-template-columns:1fr}.nph-home-stats{display:grid;grid-template-columns:1fr 1fr}.nph-home-stats span{min-width:0}}
  .nph-shell{background:radial-gradient(circle at 8% 0%,rgba(34,211,238,.18),transparent 28%),radial-gradient(circle at 92% 4%,rgba(2,132,199,.14),transparent 24%),linear-gradient(180deg,#07111f,#020617 72%)}
  .nph-shell-header{border-color:rgba(103,232,249,.24);background:linear-gradient(120deg,rgba(7,17,31,.97),rgba(2,6,23,.95))}
  .nph-shell-header:after{background:linear-gradient(90deg,transparent,rgba(34,211,238,.2),transparent)}
  .nph-shell-mark{border-color:rgba(103,232,249,.48);color:#67e8f9;background:rgba(2,132,199,.18);box-shadow:inset 0 0 22px rgba(34,211,238,.12),0 0 32px rgba(34,211,238,.1)}
  .nph-shell-copy span,.nph-home-hero>span{color:#67e8f9}.nph-shell-copy h1 b{color:#22d3ee}
  .nph-nav{background:rgba(7,17,31,.82)}.nph-nav button.active,.nph-nav button:hover{border-color:rgba(103,232,249,.36);background:rgba(2,132,199,.22)}
  .nph-home-hero,.nph-mode-grid button,.nph-online-disabled{border-color:rgba(103,232,249,.2);background:rgba(7,17,31,.9)}
  .nph-mode-grid button:hover{border-color:rgba(103,232,249,.56)}.nph-mode-grid button svg,.nph-online-disabled svg{color:#67e8f9}
  .nph-shell-loading{border-color:rgba(103,232,249,.22);background:rgba(7,17,31,.84)}
`;
