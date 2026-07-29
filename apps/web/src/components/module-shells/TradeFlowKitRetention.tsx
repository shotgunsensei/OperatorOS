'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArchiveRestore, FileClock, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  moduleShellApi,
  type TradeFlowKitRetainedItem,
  type TradeFlowKitTrashResponse,
} from '@/lib/auth';

const empty: TradeFlowKitTrashResponse = { items: [], returned: 0, limitPerEntity: 100 };
const restoreOrder: TradeFlowKitRetainedItem['kind'][] = ['customer', 'job', 'task', 'quote', 'invoice'];

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'error' in error && typeof error.error === 'string') return error.error;
  if (error instanceof Error) return error.message;
  return 'The retained-record operation failed.';
}

function pluralKind(kind: TradeFlowKitRetainedItem['kind']): `${TradeFlowKitRetainedItem['kind']}s` {
  return `${kind}s` as `${TradeFlowKitRetainedItem['kind']}s`;
}

export default function TradeFlowKitRetention({ tenantKey, canManage }: { tenantKey: string; canManage: boolean }) {
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | TradeFlowKitRetainedItem['kind']>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await moduleShellApi.tradeflowkit.trash());
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, tenantKey]);
  useEffect(() => {
    if (typeof window !== 'undefined' && /\/trash\/?$/i.test(window.location.pathname)) {
      window.requestAnimationFrame(() => document.getElementById('tradeflowkit-retention')?.focus());
    }
  }, []);

  const visible = useMemo(
    () => filter === 'all' ? data.items : data.items.filter(item => item.kind === filter),
    [data.items, filter],
  );
  const counts = useMemo(
    () => Object.fromEntries(restoreOrder.map(kind => [kind, data.items.filter(item => item.kind === kind).length])),
    [data.items],
  );

  async function restore(item: TradeFlowKitRetainedItem) {
    setPendingId(item.id);
    setError(null);
    try {
      await moduleShellApi.tradeflowkit.restoreRetained(pluralKind(item.kind), item.id, item.version);
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setPendingId('');
    }
  }

  return (
    <section
      id="tradeflowkit-retention"
      className="tfk-panel tfk-retention"
      data-testid="tradeflowkit-retention"
      tabIndex={-1}
    >
      <style>{css}</style>
      <header className="tfk-retention-head">
        <div>
          <span><FileClock size={15} /> Controlled retention</span>
          <h2>Archived records and ordered recovery</h2>
          <p>Restore retained business history without permanent purge. Parent records must be active before dependent work can return.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || !!pendingId}>
          <RefreshCw size={15} /> Refresh
        </button>
      </header>

      <div className="tfk-retention-policy">
        <ShieldCheck size={20} />
        <div><strong>OperatorOS retention policy</strong><span>Archived rows remain tenant-scoped and auditable. This module exposes no permanent-delete or bulk-destructive action.</span></div>
      </div>

      <div className="tfk-retention-filters" aria-label="Archived record filters">
        <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All <span>{data.returned}</span></button>
        {restoreOrder.map(kind => (
          <button key={kind} type="button" className={filter === kind ? 'active' : ''} onClick={() => setFilter(kind)}>
            {kind[0].toUpperCase() + kind.slice(1)}s <span>{counts[kind] ?? 0}</span>
          </button>
        ))}
      </div>

      {error && <div className="tfk-retention-alert" role="alert" data-testid="tradeflowkit-retention-error"><AlertTriangle size={17} />{error}</div>}
      {loading ? (
        <div className="tfk-retention-state" aria-busy="true" data-testid="tradeflowkit-retention-loading">
          <Loader2 className="spin" size={19} /> Loading retained records…
        </div>
      ) : visible.length === 0 ? (
        <div className="tfk-retention-state" data-testid="tradeflowkit-retention-empty">
          <ArchiveRestore size={24} /><div><strong>No archived records in this view</strong><span>Archived customers, work, quotes, and unpaid invoices will appear here.</span></div>
        </div>
      ) : (
        <div className="tfk-retention-list" data-testid="tradeflowkit-retention-list">
          {visible.map(item => (
            <article key={`${item.kind}-${item.id}`} data-testid={`tradeflowkit-retained-${item.kind}-${item.id}`}>
              <div className="tfk-retention-kind">{item.kind}</div>
              <div className="tfk-retention-copy">
                <strong>{item.label}</strong>
                <span>{item.detail}{item.status ? ` · ${item.status.replaceAll('_', ' ')}` : ''}</span>
                <small>Archived {new Date(item.archivedAt).toLocaleString()} · version {item.version}</small>
                {item.restoreBlockedReason && <em><AlertTriangle size={13} />{item.restoreBlockedReason}</em>}
              </div>
              {canManage ? (
                <button
                  type="button"
                  className="restore"
                  disabled={!!pendingId || !!item.restoreBlockedReason}
                  title={item.restoreBlockedReason ?? `Restore ${item.label}`}
                  onClick={() => void restore(item)}
                >
                  {pendingId === item.id ? <Loader2 className="spin" size={15} /> : <ArchiveRestore size={15} />} Restore
                </button>
              ) : <span className="readonly">Read only</span>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

const css = `
  .tfk-retention { padding: 18px; display: grid; gap: 14px; }
  .tfk-retention-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .tfk-retention-head > div { max-width: 780px; }
  .tfk-retention-head span { display: flex; align-items: center; gap: 7px; color: #047857; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .07em; }
  .tfk-retention-head h2 { margin: 5px 0 4px; font-size: 22px; color: #10231d; }
  .tfk-retention-head p { margin: 0; color: #587067; line-height: 1.5; }
  .tfk-retention button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; border: 1px solid rgba(5,150,105,.26); border-radius: 7px; background: #fff; color: #065f46; padding: 9px 12px; font-weight: 750; cursor: pointer; }
  .tfk-retention button:disabled { cursor: not-allowed; opacity: .48; }
  .tfk-retention-policy { display: flex; gap: 11px; align-items: flex-start; border: 1px solid rgba(2,132,199,.18); border-radius: 8px; padding: 12px; background: #f0f9ff; color: #075985; }
  .tfk-retention-policy div { display: grid; gap: 2px; }
  .tfk-retention-policy span { font-size: 12px; line-height: 1.45; color: #386478; }
  .tfk-retention-filters { display: flex; gap: 7px; flex-wrap: wrap; }
  .tfk-retention-filters button { padding: 7px 10px; font-size: 12px; }
  .tfk-retention-filters button.active { background: #065f46; color: #fff; border-color: #065f46; }
  .tfk-retention-filters button span { min-width: 20px; border-radius: 999px; padding: 1px 5px; background: rgba(5,150,105,.1); }
  .tfk-retention-filters button.active span { background: rgba(255,255,255,.16); }
  .tfk-retention-alert { display: flex; align-items: center; gap: 8px; border: 1px solid rgba(220,38,38,.2); border-radius: 8px; background: #fff1f2; color: #b91c1c; padding: 11px; }
  .tfk-retention-state { min-height: 112px; display: flex; align-items: center; justify-content: center; gap: 10px; border: 1px dashed rgba(5,150,105,.24); border-radius: 8px; color: #587067; background: #fbfefc; text-align: left; }
  .tfk-retention-state div { display: grid; gap: 3px; }
  .tfk-retention-state span { font-size: 12px; }
  .tfk-retention-list { display: grid; gap: 8px; }
  .tfk-retention-list article { display: grid; grid-template-columns: 82px minmax(0,1fr) auto; gap: 12px; align-items: center; border: 1px solid rgba(22,101,52,.14); border-radius: 8px; padding: 11px; background: #fff; }
  .tfk-retention-kind { color: #047857; background: #ecfdf5; border-radius: 999px; padding: 5px 8px; font-size: 10px; font-weight: 900; text-align: center; text-transform: uppercase; letter-spacing: .06em; }
  .tfk-retention-copy { min-width: 0; display: grid; gap: 2px; }
  .tfk-retention-copy strong { color: #10231d; overflow-wrap: anywhere; }
  .tfk-retention-copy span, .tfk-retention-copy small { color: #587067; font-size: 12px; }
  .tfk-retention-copy em { display: flex; align-items: center; gap: 5px; margin-top: 4px; color: #b45309; font-size: 11px; font-style: normal; font-weight: 700; }
  .tfk-retention button.restore { background: #047857; color: #fff; }
  .tfk-retention .readonly { color: #789189; font-size: 11px; font-weight: 800; text-transform: uppercase; }
  .spin { animation: tfk-retention-spin 1s linear infinite; }
  @keyframes tfk-retention-spin { to { transform: rotate(360deg); } }
  @media (max-width: 700px) {
    .tfk-retention-list article { grid-template-columns: auto minmax(0,1fr); }
    .tfk-retention-list article > button, .tfk-retention-list article > .readonly { grid-column: 1 / -1; width: 100%; }
    .tfk-retention-kind { align-self: start; }
  }
`;
