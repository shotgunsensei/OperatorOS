'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileCode2, Plus, RefreshCw, ServerCog, ShieldCheck } from 'lucide-react';
import {
  moduleShellApi,
  type TechDeckAsset,
  type TechDeckAssetHealth,
  type TechDeckOpsResponse,
  type TechDeckRunbookPlatform,
  type TechDeckRunbookRisk,
} from '@/lib/auth';

interface Props {
  tenantKey: string;
  canWrite: boolean;
  canApprove: boolean;
}

const healthOptions: TechDeckAssetHealth[] = ['unknown', 'healthy', 'warning', 'critical', 'offline'];
type AssetDraft = {
  name: string;
  hostname: string;
  type: 'endpoint';
  health: TechDeckAssetHealth;
};

const blankAsset: AssetDraft = { name: '', hostname: '', type: 'endpoint', health: 'unknown' };
const blankRunbook = {
  name: '', platform: 'powershell' as TechDeckRunbookPlatform,
  purpose: '', scriptText: '', riskLevel: 'medium' as TechDeckRunbookRisk,
};

function message(error: unknown): string {
  if (error && typeof error === 'object') {
    if ('error' in error && typeof error.error === 'string') return error.error;
    if ('message' in error && typeof error.message === 'string') return error.message;
  }
  return 'The TechDeck operation could not be completed.';
}

export default function TechDeckOperations({ tenantKey, canWrite, canApprove }: Props) {
  const [data, setData] = useState<TechDeckOpsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [asset, setAsset] = useState<AssetDraft>({ ...blankAsset });
  const [runbook, setRunbook] = useState({ ...blankRunbook });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setData(await moduleShellApi.techdeck.getOps()); }
    catch (err) { setError(message(err)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load, tenantKey]);

  async function createAsset(event: React.FormEvent) {
    event.preventDefault();
    setBusy('asset-create'); setError(null);
    try {
      await moduleShellApi.techdeck.createAsset(asset);
      setAsset({ ...blankAsset });
      await load();
    } catch (err) { setError(message(err)); }
    finally { setBusy(null); }
  }

  async function setHealth(row: TechDeckAsset, health: TechDeckAssetHealth) {
    setBusy(row.id); setError(null);
    try {
      await moduleShellApi.techdeck.updateAsset(row.id, {
        expectedVersion: row.version,
        health,
        lastSeenAt: new Date().toISOString(),
      });
      await load();
    } catch (err) { setError(message(err)); }
    finally { setBusy(null); }
  }

  async function createRunbook(event: React.FormEvent) {
    event.preventDefault();
    setBusy('runbook-create'); setError(null);
    try {
      await moduleShellApi.techdeck.createRunbook(runbook);
      setRunbook({ ...blankRunbook });
      await load();
    } catch (err) { setError(message(err)); }
    finally { setBusy(null); }
  }

  async function transitionRunbook(id: string, version: number, action: 'approve' | 'retire') {
    setBusy(id); setError(null);
    try {
      if (action === 'approve') await moduleShellApi.techdeck.approveRunbook(id, version);
      else await moduleShellApi.techdeck.retireRunbook(id, version);
      await load();
    } catch (err) { setError(message(err)); }
    finally { setBusy(null); }
  }

  if (loading && !data) return (
    <section id="techdeck-ops" className="techdeck-panel td-ops-state" aria-busy="true">
      <RefreshCw size={18} className="td-spin" /> Loading asset and runbook posture…
      <style>{css}</style>
    </section>
  );

  return (
    <section id="techdeck-ops" className="techdeck-panel td-ops" data-testid="techdeck-ops-workspace" tabIndex={-1}>
      <style>{css}</style>
      <header className="td-ops-head">
        <div>
          <div className="td-kicker">Asset health + controlled automation</div>
          <h2>Operations Workspace</h2>
          <p>Track endpoint posture and review runbooks without executing commands on the OperatorOS server.</p>
        </div>
        <button className="td-button td-secondary" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'td-spin' : ''} /> Refresh
        </button>
      </header>

      {error && <div className="td-error" role="alert"><AlertTriangle size={16} />{error}</div>}

      <div className="td-summary" id="techdeck-alerts">
        <Summary label="Assets" value={data?.assets.length ?? 0} icon={<ServerCog size={17} />} />
        <Summary label="Active alerts" value={data?.alerts.length ?? 0} icon={<AlertTriangle size={17} />} warn={!!data?.alerts.length} />
        <Summary label="Approved runbooks" value={data?.runbooks.filter((r) => r.status === 'approved').length ?? 0} icon={<ShieldCheck size={17} />} />
      </div>

      {!!data?.alerts.length && (
        <div className="td-alerts" data-testid="techdeck-derived-alerts">
          {data.alerts.map((alert) => <div key={alert.id} className={`td-alert td-${alert.severity}`}>
            <AlertTriangle size={15} /><span>{alert.message}</span>
          </div>)}
        </div>
      )}

      <div className="td-columns">
        <div id="techdeck-assets" className="td-stack">
          <div className="td-section-title"><ServerCog size={17} /><h3>Asset posture</h3></div>
          {canWrite && (
            <form className="td-form" onSubmit={createAsset} data-testid="techdeck-asset-create-form">
              <input required placeholder="Asset name" value={asset.name} onChange={(e) => setAsset({ ...asset, name: e.target.value })} />
              <input placeholder="Hostname" value={asset.hostname} onChange={(e) => setAsset({ ...asset, hostname: e.target.value })} />
              <select value={asset.health} onChange={(e) => setAsset({ ...asset, health: e.target.value as TechDeckAssetHealth })}>
                {healthOptions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <button className="td-button" disabled={busy === 'asset-create'}><Plus size={14} />Add asset</button>
            </form>
          )}
          <div className="td-list">
            {data?.assets.map((row) => (
              <article className="td-row" key={row.id}>
                <div><strong>{row.name}</strong><small>{row.hostname || row.type} · v{row.version}</small></div>
                {canWrite ? (
                  <select aria-label={`Health for ${row.name}`} value={row.health} disabled={busy === row.id}
                    onChange={(e) => void setHealth(row, e.target.value as TechDeckAssetHealth)}>
                    {healthOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                ) : <Status value={row.health} />}
              </article>
            ))}
            {!data?.assets.length && <Empty text="No assets registered for this tenant." />}
          </div>
        </div>

        <div id="techdeck-scripts" className="td-stack">
          <div className="td-section-title"><FileCode2 size={17} /><h3>Approval-only runbooks</h3></div>
          <div className="td-boundary"><ShieldCheck size={15} />Execution disabled. Scripts require a future signed endpoint-agent boundary.</div>
          {canWrite && (
            <form className="td-form td-runbook-form" onSubmit={createRunbook} data-testid="techdeck-runbook-create-form">
              <input required placeholder="Runbook name" value={runbook.name} onChange={(e) => setRunbook({ ...runbook, name: e.target.value })} />
              <input required placeholder="Purpose and maintenance context" value={runbook.purpose} onChange={(e) => setRunbook({ ...runbook, purpose: e.target.value })} />
              <textarea required placeholder="PowerShell, Bash, network, or generic procedure" value={runbook.scriptText} onChange={(e) => setRunbook({ ...runbook, scriptText: e.target.value })} />
              <div className="td-form-row">
                <select value={runbook.platform} onChange={(e) => setRunbook({ ...runbook, platform: e.target.value as TechDeckRunbookPlatform })}>
                  {['powershell', 'bash', 'network', 'generic'].map((value) => <option key={value}>{value}</option>)}
                </select>
                <select value={runbook.riskLevel} onChange={(e) => setRunbook({ ...runbook, riskLevel: e.target.value as TechDeckRunbookRisk })}>
                  {['low', 'medium', 'high'].map((value) => <option key={value}>{value} risk</option>)}
                </select>
                <button className="td-button" disabled={busy === 'runbook-create'}><Plus size={14} />Save draft</button>
              </div>
            </form>
          )}
          <div className="td-list">
            {data?.runbooks.map((row) => <article className="td-row td-runbook" key={row.id}>
              <div><strong>{row.name}</strong><small>{row.platform} · {row.riskLevel} risk · v{row.version}</small><p>{row.purpose}</p></div>
              <div className="td-row-actions">
                <Status value={row.status} />
                {canApprove && row.status === 'draft' && <button className="td-button" disabled={busy === row.id} onClick={() => void transitionRunbook(row.id, row.version, 'approve')}>Approve</button>}
                {canApprove && row.status === 'approved' && <button className="td-button td-secondary" disabled={busy === row.id} onClick={() => void transitionRunbook(row.id, row.version, 'retire')}>Retire</button>}
              </div>
            </article>)}
            {!data?.runbooks.length && <Empty text="No runbooks saved for this tenant." />}
          </div>
        </div>
      </div>
    </section>
  );
}

function Summary({ label, value, icon, warn = false }: { label: string; value: number; icon: React.ReactNode; warn?: boolean }) {
  return <div className={warn ? 'td-summary-card td-summary-warn' : 'td-summary-card'}>{icon}<div><strong>{value}</strong><small>{label}</small></div></div>;
}
function Status({ value }: { value: string }) { return <span className={`td-status td-status-${value}`}>{value.replaceAll('_', ' ')}</span>; }
function Empty({ text }: { text: string }) { return <div className="td-empty"><CheckCircle2 size={16} />{text}</div>; }

const css = `
.td-ops{padding:18px;display:grid;gap:16px}.td-ops-state{padding:20px;display:flex;gap:10px;align-items:center;color:#8fa3bd}
.td-ops-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.td-ops-head h2{margin:3px 0 4px;font-size:21px}.td-ops-head p{margin:0;color:#8fa3bd;font-size:13px}.td-kicker{text-transform:uppercase;letter-spacing:.12em;color:#38bdf8;font-size:11px;font-weight:800}
.td-button{border:1px solid rgba(56,189,248,.5);background:rgba(14,165,233,.15);color:#e5eefc;border-radius:6px;padding:8px 11px;font-weight:750;display:inline-flex;gap:7px;align-items:center;justify-content:center;cursor:pointer}.td-button:disabled{opacity:.55;cursor:not-allowed}.td-secondary{background:#101826;border-color:rgba(148,163,184,.25)}
.td-error,.td-boundary{display:flex;gap:8px;align-items:center;border-radius:6px;padding:10px 12px;font-size:13px}.td-error{color:#fecaca;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.35)}.td-boundary{color:#bae6fd;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.2)}
.td-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.td-summary-card{display:flex;gap:10px;align-items:center;background:#080d16;border:1px solid rgba(148,163,184,.16);padding:12px;border-radius:7px;color:#38bdf8}.td-summary-card strong,.td-summary-card small{display:block}.td-summary-card strong{font-size:18px;color:#e5eefc}.td-summary-card small{font-size:11px;color:#8fa3bd}.td-summary-warn{color:#f59e0b;border-color:rgba(245,158,11,.4)}
.td-alerts{display:grid;gap:7px}.td-alert{display:flex;gap:8px;align-items:center;padding:9px 11px;border-radius:6px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);font-size:13px}.td-critical,.td-offline{background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.3)}
.td-columns{display:grid;grid-template-columns:1fr 1fr;gap:14px}.td-stack{min-width:0;display:grid;align-content:start;gap:10px;background:#080d16;border:1px solid rgba(148,163,184,.16);border-radius:7px;padding:13px}.td-section-title{display:flex;gap:8px;align-items:center;color:#38bdf8}.td-section-title h3{font-size:15px;color:#e5eefc;margin:0}
.td-form{display:grid;grid-template-columns:1.3fr 1fr .8fr auto;gap:7px}.td-runbook-form{grid-template-columns:1fr}.td-form-row{display:grid;grid-template-columns:1fr 1fr auto;gap:7px}.td-form input,.td-form select,.td-form textarea,.td-row select{min-width:0;border:1px solid rgba(148,163,184,.25);background:#101826;color:#e5eefc;border-radius:5px;padding:8px;font:inherit}.td-form textarea{min-height:95px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px}
.td-list{display:grid;gap:7px}.td-row{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px;border:1px solid rgba(148,163,184,.13);border-radius:6px;background:#0d1320}.td-row strong,.td-row small{display:block}.td-row small{margin-top:3px;color:#8fa3bd;font-size:11px}.td-row p{margin:6px 0 0;color:#8fa3bd;font-size:12px}.td-runbook{align-items:flex-start}.td-row-actions{display:grid;gap:6px;justify-items:end}.td-status{text-transform:capitalize;border:1px solid rgba(148,163,184,.25);border-radius:999px;padding:4px 8px;font-size:10px;color:#cbd5e1}.td-status-healthy,.td-status-approved{color:#86efac;border-color:rgba(34,197,94,.4)}.td-status-warning,.td-status-draft{color:#fcd34d;border-color:rgba(245,158,11,.4)}.td-status-critical,.td-status-offline{color:#fca5a5;border-color:rgba(239,68,68,.4)}.td-empty{display:flex;gap:8px;align-items:center;color:#8fa3bd;padding:12px;font-size:13px}.td-spin{animation:tdspin 1s linear infinite}@keyframes tdspin{to{transform:rotate(360deg)}}
@media(max-width:900px){.td-columns{grid-template-columns:1fr}}@media(max-width:650px){.td-summary{grid-template-columns:1fr}.td-ops-head{display:grid}.td-form,.td-form-row{grid-template-columns:1fr}.td-row{align-items:flex-start;flex-direction:column}.td-row-actions{justify-items:start}}
`;
