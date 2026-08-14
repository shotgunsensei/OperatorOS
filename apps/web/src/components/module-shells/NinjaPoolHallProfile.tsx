'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Save, ShieldCheck, SlidersHorizontal, Trophy } from 'lucide-react';
import { moduleShellApi, type NinjaPoolProfile, type NinjaPoolProfileResponse } from '@/lib/auth';
import { getVisualQuality, setVisualQuality, type NinjaPoolVisualQuality } from '@/lib/ninja-pool-hall/performance';

export default function NinjaPoolHallProfile({
  value,
  progression,
  onSaved,
}: {
  value: NinjaPoolProfile;
  progression: NinjaPoolProfileResponse['progression'];
  onSaved: (profile: NinjaPoolProfile) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visualQuality, setVisualQualityState] = useState<NinjaPoolVisualQuality>('balanced');

  useEffect(() => setDraft(value), [value]);
  useEffect(() => setVisualQualityState(getVisualQuality()), []);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await moduleShellApi.ninjaPoolHall.saveProfile({
        expectedVersion: draft.version,
        displayName: draft.displayName,
        preferences: draft.preferences,
      });
      setDraft(saved);
      onSaved(saved);
    } catch (cause: any) {
      setError(cause?.error || cause?.message || 'Unable to save your pool profile.');
    } finally {
      setSaving(false);
    }
  };

  const preference = <K extends keyof NinjaPoolProfile['preferences']>(key: K, next: NinjaPoolProfile['preferences'][K]) => {
    setDraft((current) => ({
      ...current,
      preferences: { ...current.preferences, [key]: next },
    }));
  };

  return (
    <section className="nphp" data-testid="ninja-pool-profile">
      <style>{css}</style>
      {error && <div className="nphp-error" role="alert"><AlertTriangle size={17} /> {error}</div>}
      <div className="nphp-grid">
        <article>
          <header><SlidersHorizontal size={19} /><div><span>PLAYER CONFIG</span><h2>Profile & table rules</h2></div></header>
          <label>Display name<input value={draft.displayName} maxLength={40} onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} /></label>
          <label className="toggle"><input type="checkbox" checked={draft.preferences.aimGuide} onChange={(event) => preference('aimGuide', event.target.checked)} /><span><b>Aim guide</b><small>Show the projected first-contact line.</small></span></label>
          <label>Table speed <b>{draft.preferences.tableSpeed.toFixed(1)}×</b><input type="range" min="0.6" max="1.4" step="0.1" value={draft.preferences.tableSpeed} onChange={(event) => preference('tableSpeed', Number(event.target.value))} /></label>
          <label>Visual performance<select value={visualQuality} onChange={(event) => { const next = event.target.value as NinjaPoolVisualQuality; setVisualQualityState(next); setVisualQuality(next); }}><option value="battery">Battery saver</option><option value="balanced">Balanced</option><option value="high">High motion detail</option></select><small>Saved on this device. Physics and rules remain identical at every quality.</small></label>
          <label className="toggle"><input type="checkbox" checked={draft.preferences.sound} onChange={(event) => preference('sound', event.target.checked)} /><span><b>Procedural sound</b><small>Local Web Audio cue, contact, pocket, and result feedback.</small></span></label>
          <label className="toggle"><input type="checkbox" checked={draft.preferences.vibration} onChange={(event) => preference('vibration', event.target.checked)} /><span><b>Haptic feedback</b><small>Use device vibration when the browser supports it.</small></span></label>
          <label className="toggle"><input type="checkbox" checked={draft.preferences.callShotOn8} onChange={(event) => preference('callShotOn8', event.target.checked)} /><span><b>Call pocket on the 8</b><small>Require a selected pocket for the final ball.</small></span></label>
          <label className="toggle"><input type="checkbox" checked={draft.preferences.threeFoulRule} onChange={(event) => preference('threeFoulRule', event.target.checked)} /><span><b>Three-foul rule</b><small>Three consecutive fouls lose the match.</small></span></label>
          <button type="button" onClick={() => void save()} disabled={saving || !draft.displayName.trim()}>
            {saving ? <Loader2 className="spin" size={17} /> : <Save size={17} />} {saving ? 'Saving…' : 'Save profile'}
          </button>
        </article>
        <aside>
          <header><Trophy size={19} /><div><span>LOCAL PROGRESSION</span><h2>Recorded results</h2></div></header>
          <div className="stats">
            <span><b>{progression.matchesCompleted}</b>completed</span>
            <span><b>{progression.wins}</b>CPU wins</span>
            <span><b>{progression.losses}</b>CPU losses</span>
            <span><b>{progression.localMatches}</b>hot-seat</span>
          </div>
          <div className="notice"><ShieldCheck size={18} /><p><b>Personal progress, no public leaderboard.</b> Your completed local and CPU matches appear here without turning friendly play into a competitive ranking.</p></div>
        </aside>
      </div>
    </section>
  );
}

const css = `
  .nphp{color:#f8fafc}.nphp-grid{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(280px,.7fr);gap:18px}.nphp article,.nphp aside{border:1px solid rgba(248,113,113,.2);background:rgba(9,9,13,.9);border-radius:18px;padding:20px;box-shadow:0 24px 70px rgba(0,0,0,.3)}.nphp header{display:flex;gap:10px;align-items:center;margin-bottom:18px}.nphp header>svg{color:#f87171}.nphp header span{color:#f87171;font:700 10px ui-monospace,monospace;letter-spacing:.16em}.nphp h2{margin:3px 0 0;text-transform:uppercase}.nphp article>label{display:grid;gap:7px;margin:13px 0;color:#cbd5e1;font-size:12px}.nphp article>label>small{color:#64748b}.nphp input[type=text],.nphp input:not([type]),.nphp select{padding:10px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#fff}.nphp input[type=range]{width:100%;accent-color:#ef4444}.nphp label.toggle{grid-template-columns:auto 1fr;align-items:start;padding:11px;border:1px solid rgba(148,163,184,.14);border-radius:9px;background:rgba(15,23,42,.5)}.nphp .toggle input{margin-top:3px;accent-color:#ef4444}.nphp .toggle b,.nphp .toggle small{display:block}.nphp .toggle small{margin-top:3px;color:#64748b}.nphp article>button{margin-top:10px;min-height:44px;padding:10px 15px;border:0;border-radius:9px;background:linear-gradient(135deg,#ef4444,#b91c1c);color:#fff;font-weight:800;display:flex;align-items:center;gap:7px}.nphp article>button:disabled{opacity:.5}.nphp .stats{display:grid;grid-template-columns:1fr 1fr;gap:9px}.nphp .stats span{padding:13px;border:1px solid rgba(148,163,184,.14);border-radius:9px;color:#94a3b8;font-size:11px;text-transform:uppercase}.nphp .stats b{display:block;color:#fff;font-size:24px}.nphp .notice{margin-top:14px;padding:12px;display:flex;gap:9px;border:1px solid rgba(34,197,94,.22);background:rgba(22,101,52,.1);border-radius:9px;color:#bbf7d0}.nphp .notice svg{flex:none}.nphp .notice p{margin:0;font-size:11px;line-height:1.5}.nphp-error{margin-bottom:12px;padding:12px;border:1px solid rgba(248,113,113,.4);background:rgba(127,29,29,.28);border-radius:10px;color:#fecaca;display:flex;gap:8px}.spin{animation:nphp-spin .8s linear infinite}@keyframes nphp-spin{to{transform:rotate(360deg)}}@media(max-width:820px){.nphp-grid{grid-template-columns:1fr}}@media(prefers-reduced-motion:reduce){.spin{animation:none}}
`;
