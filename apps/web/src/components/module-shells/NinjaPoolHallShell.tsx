'use client';

import React from 'react';
import { Crosshair, Gamepad2, ShieldCheck, WifiOff } from 'lucide-react';
import NinjaPoolHallPractice from './NinjaPoolHallPractice';

interface NinjaPoolHallShellProps {
  baseUrl?: string;
}

export default function NinjaPoolHallShell(_props: NinjaPoolHallShellProps) {
  return (
    <main className="nph-shell" data-testid="ninja-pool-hall-shell">
      <style>{shellCss}</style>
      <div className="nph-shell-wrap">
        <header className="nph-shell-header">
          <div className="nph-shell-mark"><Crosshair size={26} /></div>
          <div className="nph-shell-copy">
            <span>SHOTGUN NINJAS // LOCAL TABLE</span>
            <h1>Ninja <b>Pool Hall</b></h1>
            <p>Deterministic 8-ball physics, sharpened into a focused single-device practice rack.</p>
          </div>
          <div className="nph-shell-badges" aria-label="Runtime boundaries">
            <span><Gamepad2 size={14} /> Local gameplay</span>
            <span><WifiOff size={14} /> No live room</span>
            <span><ShieldCheck size={14} /> OperatorOS guarded</span>
          </div>
        </header>
        <NinjaPoolHallPractice />
      </div>
    </main>
  );
}

const shellCss = `
  .nph-shell { min-height:100vh; padding:24px; color:#f8fafc; background:
    radial-gradient(circle at 8% 0%,rgba(239,68,68,.18),transparent 28%),
    radial-gradient(circle at 92% 4%,rgba(127,29,29,.14),transparent 24%),
    linear-gradient(180deg,#09090d,#030305 72%); }
  .nph-shell-wrap { max-width:1360px; margin:0 auto; display:grid; gap:18px; }
  .nph-shell-header { position:relative; overflow:hidden; border:1px solid rgba(248,113,113,.22); background:linear-gradient(120deg,rgba(24,24,31,.96),rgba(8,8,12,.94)); box-shadow:0 24px 70px rgba(0,0,0,.32); border-radius:18px; padding:22px; display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:18px; align-items:center; }
  .nph-shell-header:after { content:''; position:absolute; inset:auto -8% -48px 42%; height:90px; background:linear-gradient(90deg,transparent,rgba(239,68,68,.2),transparent); transform:skewX(-24deg); pointer-events:none; }
  .nph-shell-mark { width:58px; height:58px; display:grid; place-items:center; border:1px solid rgba(248,113,113,.45); color:#f87171; background:rgba(127,29,29,.18); box-shadow:inset 0 0 22px rgba(239,68,68,.12),0 0 32px rgba(239,68,68,.1); transform:rotate(45deg); }
  .nph-shell-mark svg { transform:rotate(-45deg); }
  .nph-shell-copy span { color:#f87171; font:700 10px ui-monospace,monospace; letter-spacing:.2em; }
  .nph-shell-copy h1 { margin:5px 0 4px; font-size:clamp(26px,4vw,44px); line-height:1; text-transform:uppercase; letter-spacing:-.04em; }
  .nph-shell-copy h1 b { color:#ef4444; }
  .nph-shell-copy p { margin:0; color:#94a3b8; font-size:13px; }
  .nph-shell-badges { display:flex; gap:7px; flex-wrap:wrap; justify-content:flex-end; max-width:340px; }
  .nph-shell-badges span { padding:7px 9px; border:1px solid rgba(148,163,184,.16); background:rgba(15,23,42,.7); border-radius:999px; display:flex; gap:6px; align-items:center; color:#cbd5e1; font-size:10px; white-space:nowrap; }
  @media(max-width:760px) { .nph-shell { padding:12px; } .nph-shell-header { grid-template-columns:auto 1fr; padding:17px; } .nph-shell-badges { grid-column:1/-1; justify-content:flex-start; max-width:none; } .nph-shell-mark { width:48px; height:48px; } }
`;
