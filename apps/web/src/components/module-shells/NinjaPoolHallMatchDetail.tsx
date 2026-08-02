'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Loader2, ShieldCheck, Trophy } from 'lucide-react';
import { moduleShellApi, type NinjaPoolMatch } from '@/lib/auth';

export default function NinjaPoolHallMatchDetail({ matchId, onBack }: { matchId: string; onBack: () => void }) {
  const [match, setMatch] = useState<NinjaPoolMatch | null>(null);
  const [events, setEvents] = useState<Array<Record<string, any>>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void moduleShellApi.ninjaPoolHall.getMatch(matchId).then((response) => {
      if (!active) return;
      setMatch(response.match);
      setEvents(response.events);
    }).catch((cause: any) => {
      if (active) setError(cause?.error || cause?.message || 'Unable to load this match.');
    });
    return () => { active = false; };
  }, [matchId]);

  return (
    <section className="nphd" data-testid="ninja-pool-match-detail">
      <style>{css}</style>
      <button className="back" type="button" onClick={onBack}><ArrowLeft size={16} /> Match history</button>
      {error ? <div className="error" role="alert"><AlertTriangle size={18} /> {error}</div> : !match ? <div className="loading"><Loader2 className="spin" size={22} /> Loading saved result…</div> : (
        <div className="grid">
          <article className="summary">
            <header><Trophy size={22} /><div><span>SAVED RESULT</span><h2>{match.mode === 'bot' ? 'Vs CPU' : `Vs ${match.opponentName}`}</h2></div></header>
            <dl>
              <div><dt>Status</dt><dd>{match.status}</dd></div>
              <div><dt>Result</dt><dd>{match.result?.replace('_', ' ') ?? 'No result'}</dd></div>
              <div><dt>Shots</dt><dd>{match.shotCount}</dd></div>
              <div><dt>Winner</dt><dd>{match.winnerSeat === null ? '—' : match.logicalState.players[match.winnerSeat].name}</dd></div>
            </dl>
            {match.finishReason && <p>{match.finishReason}</p>}
            <div className="trust"><ShieldCheck size={18} /><span>Rules, turns, and results are saved with this match. Local play contributes to your personal progress only.</span></div>
          </article>
          <aside>
            <h3>Rule trail</h3>
            {events.length === 0 ? <p>No shot events were recorded.</p> : events.map((event) => (
              <div className="event" key={String(event.id)}>
                <span>#{String(event.sequenceNumber)} · {String(event.eventKind)}</span>
                <b>{event.outcome?.gameOver?.reason || (event.outcome?.foul ? 'Foul' : event.outcome?.turnContinues ? 'Turn continues' : 'Turn changed')}</b>
                <small>{new Date(String(event.createdAt)).toLocaleString()}</small>
              </div>
            ))}
          </aside>
        </div>
      )}
    </section>
  );
}

const css = `
  .nphd{color:#f8fafc}.nphd .back{margin-bottom:12px;padding:8px 11px;border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.65);border-radius:8px;color:#e2e8f0;display:flex;gap:7px;align-items:center}.nphd .grid{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:18px}.nphd .summary,.nphd aside{border:1px solid rgba(248,113,113,.2);background:rgba(9,9,13,.9);border-radius:18px;padding:20px}.nphd header{display:flex;gap:10px;align-items:center}.nphd header svg{color:#f87171}.nphd header span{color:#f87171;font:700 10px ui-monospace,monospace;letter-spacing:.16em}.nphd h2{margin:4px 0 0;text-transform:uppercase}.nphd dl{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:20px 0}.nphd dl div{padding:12px;border:1px solid rgba(148,163,184,.14);border-radius:9px}.nphd dt{color:#64748b;font-size:9px;text-transform:uppercase}.nphd dd{margin:5px 0 0;text-transform:uppercase;font-weight:800}.nphd .summary>p{color:#cbd5e1}.nphd .trust{padding:12px;display:flex;gap:8px;border:1px solid rgba(34,197,94,.22);background:rgba(22,101,52,.1);border-radius:9px;color:#bbf7d0;font-size:11px;line-height:1.5}.nphd aside h3{margin-top:0;text-transform:uppercase}.nphd aside>p{color:#94a3b8}.nphd .event{padding:11px 0;border-bottom:1px solid rgba(148,163,184,.12)}.nphd .event span,.nphd .event b,.nphd .event small{display:block}.nphd .event span{color:#f87171;font:10px ui-monospace,monospace}.nphd .event b{margin-top:5px}.nphd .event small{margin-top:4px;color:#64748b}.nphd .error,.nphd .loading{padding:18px;border:1px solid rgba(248,113,113,.25);border-radius:12px;display:flex;gap:8px}.spin{animation:nphd-spin .8s linear infinite}@keyframes nphd-spin{to{transform:rotate(360deg)}}@media(max-width:820px){.nphd .grid{grid-template-columns:1fr}.nphd dl{grid-template-columns:1fr 1fr}}@media(prefers-reduced-motion:reduce){.spin{animation:none}}
`;
