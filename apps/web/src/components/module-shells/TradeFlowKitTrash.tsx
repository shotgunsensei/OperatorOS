'use client';

import React, { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ArchiveRestore, BriefcaseBusiness, Loader2, Receipt, RefreshCw, Trash2, Users,
  type LucideIcon,
} from 'lucide-react';
import { moduleShellApi, type TradeFlowKitTrashResponse } from '@/lib/auth';

type RestoreKind = 'customers' | 'jobs' | 'invoices';
type TrashRow = TradeFlowKitTrashResponse[RestoreKind][number];

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'error' in error && typeof error.error === 'string') return error.error;
  if (error instanceof Error && error.message) return error.message;
  return 'Archived records are unavailable. Retry or verify your TradeFlowKit access.';
}

const money = (cents: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}).format(cents / 100);

export default function TradeFlowKitTrash({
  tenantKey, canManage,
}: { tenantKey: string; canManage: boolean }) {
  const [data, setData] = useState<TradeFlowKitTrashResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await moduleShellApi.tradeflowkit.trash()); setSelected(new Set()); }
    catch (requestError) { setData(null); setError(errorMessage(requestError)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [tenantKey, load]);

  async function restore(kind: RestoreKind, row: TrashRow) {
    if (!canManage || restoring) return;
    setRestoring(`${kind}:${row.id}`); setError('');
    try {
      if (kind === 'customers') await moduleShellApi.tradeflowkit.restoreCustomer(row.id, row.version);
      if (kind === 'jobs') await moduleShellApi.tradeflowkit.restoreJob(row.id, row.version);
      if (kind === 'invoices') await moduleShellApi.tradeflowkit.restoreInvoice(row.id, row.version);
      await load();
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setRestoring(''); }
  }

  function toggle(kind: RestoreKind, id: string) {
    const key = `${kind}:${id}`;
    setSelected(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else if ([...next].filter(value => value.startsWith(`${kind}:`)).length < 25) next.add(key);
      return next;
    });
  }

  async function restoreSelected(kind: 'jobs' | 'invoices', rows: TrashRow[]) {
    if (!canManage || restoring) return;
    const records = rows
      .filter(row => selected.has(`${kind}:${row.id}`))
      .map(row => ({ id: row.id, expectedVersion: row.version }));
    if (records.length === 0 || !window.confirm(`Restore ${records.length} archived ${kind}? The batch is all-or-nothing.`)) return;
    setRestoring(`bulk:${kind}`); setError('');
    try {
      const key = `${kind}-bulk-restore:${crypto.randomUUID()}`;
      if (kind === 'jobs') await moduleShellApi.tradeflowkit.bulkRestoreJobs(records, key);
      else await moduleShellApi.tradeflowkit.bulkRestoreInvoices(records, key);
      await load();
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setRestoring(''); }
  }

  const total = data ? data.customers.length + data.jobs.length + data.invoices.length : 0;
  return (
    <section className="tfk-trash" id="tradeflowkit-trash" tabIndex={-1} data-testid="tradeflowkit-trash">
      <style>{css}</style>
      <header>
        <div><span>Retention workspace</span><h2>Archived records</h2><p>Restore retained business records safely. Permanent purge remains disabled.</p></div>
        <button type="button" onClick={() => void load()} disabled={loading || !!restoring}><RefreshCw size={14} /> Refresh</button>
      </header>
      {error && <div className="tfk-trash-error" role="alert" data-testid="tradeflowkit-trash-error">{error}</div>}
      {loading ? (
        <div className="tfk-trash-state" aria-busy="true"><Loader2 className="spin" size={18} /> Loading archived tenant records…</div>
      ) : total === 0 ? (
        <div className="tfk-trash-state" data-testid="tradeflowkit-trash-empty"><Trash2 size={19} /> No archived customers, jobs, or invoices.</div>
      ) : data ? (
        <div className="tfk-trash-groups" data-testid="tradeflowkit-trash-groups">
          <TrashGroup title="Customers" kind="customers" Icon={Users} rows={data.customers} hasMore={data.hasMore.customers} canManage={canManage} restoring={restoring} selected={selected} onToggle={toggle} onRestore={restore} onRestoreSelected={restoreSelected} render={row => {
            const customer = row as TradeFlowKitTrashResponse['customers'][number];
            return <><strong>{customer.name}</strong><small>{customer.email || customer.phone || 'Customer record'} · archived {new Date(customer.deletedAt).toLocaleDateString()}</small></>;
          }} />
          <TrashGroup title="Jobs" kind="jobs" Icon={BriefcaseBusiness} rows={data.jobs} hasMore={data.hasMore.jobs} canManage={canManage} restoring={restoring} selected={selected} onToggle={toggle} onRestore={restore} onRestoreSelected={restoreSelected} render={row => {
            const job = row as TradeFlowKitTrashResponse['jobs'][number];
            return <><strong>{job.number ? `Job #${job.number} · ` : ''}{job.title}</strong><small>{job.status.replaceAll('_', ' ')} · archived {new Date(job.deletedAt).toLocaleDateString()}</small></>;
          }} />
          <TrashGroup title="Invoices" kind="invoices" Icon={Receipt} rows={data.invoices} hasMore={data.hasMore.invoices} canManage={canManage} restoring={restoring} selected={selected} onToggle={toggle} onRestore={restore} onRestoreSelected={restoreSelected} render={row => {
            const invoice = row as TradeFlowKitTrashResponse['invoices'][number];
            return <><strong>{invoice.number ? `Invoice #${invoice.number}` : `Invoice ${invoice.id.slice(0, 8)}`}</strong><small>{invoice.status} · {money(invoice.totalCents)} · archived {new Date(invoice.deletedAt).toLocaleDateString()}</small></>;
          }} />
        </div>
      ) : null}
    </section>
  );
}

function TrashGroup({
  title, kind, Icon, rows, hasMore, canManage, restoring, selected, onToggle, onRestore, onRestoreSelected, render,
}: {
  title: string; kind: RestoreKind; Icon: LucideIcon; rows: TrashRow[]; hasMore: boolean;
  canManage: boolean; restoring: string; onRestore: (kind: RestoreKind, row: TrashRow) => Promise<void>;
  selected: Set<string>; onToggle: (kind: RestoreKind, id: string) => void;
  onRestoreSelected: (kind: 'jobs' | 'invoices', rows: TrashRow[]) => Promise<void>;
  render: (row: TrashRow) => ReactNode;
}) {
  const selectedCount = rows.filter(row => selected.has(`${kind}:${row.id}`)).length;
  return (
    <section aria-labelledby={`tradeflowkit-trash-${kind}`}>
      <h3 id={`tradeflowkit-trash-${kind}`}><Icon size={15} /> {title} <span>{rows.length}{hasMore ? '+' : ''}</span></h3>
      {canManage && kind !== 'customers' && rows.length > 0 && <div className="tfk-trash-bulk" data-testid={`tradeflowkit-${kind}-bulk-restore`}>
        <small>{selectedCount} selected · max 25</small>
        <button type="button" disabled={!!restoring || selectedCount === 0} onClick={() => void onRestoreSelected(kind, rows)}>
          {restoring === `bulk:${kind}` ? <Loader2 className="spin" size={13} /> : <ArchiveRestore size={13} />} Restore selected
        </button>
      </div>}
      {rows.length === 0 ? <p className="empty">No archived {kind}.</p> : rows.map(row => (
        <article key={row.id} data-testid={`tradeflowkit-trash-${kind}-${row.id}`}>
          {canManage && kind !== 'customers' && <input type="checkbox" aria-label={`Select archived ${kind.slice(0, -1)} ${row.id}`} checked={selected.has(`${kind}:${row.id}`)} disabled={!!restoring || (!selected.has(`${kind}:${row.id}`) && selectedCount >= 25)} onChange={() => onToggle(kind, row.id)} />}
          <div>{render(row)}</div>
          {canManage ? (
            <button type="button" disabled={!!restoring} onClick={() => void onRestore(kind, row)}>
              {restoring === `${kind}:${row.id}` ? <Loader2 className="spin" size={14} /> : <ArchiveRestore size={14} />} Restore
            </button>
          ) : <span className="read-only">Read only</span>}
        </article>
      ))}
      {hasMore && <p className="bounded">Showing the 50 most recently archived records.</p>}
    </section>
  );
}

const css = `
  .tfk-trash{border:1px solid rgba(22,101,52,.16);border-radius:8px;background:#fff;padding:18px;color:#10231d;display:grid;gap:14px}
  .tfk-trash header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.tfk-trash header span{color:#059669;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}.tfk-trash h2{margin:3px 0;font-size:20px}.tfk-trash header p{margin:0;color:#587067;font-size:13px}.tfk-trash button{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid rgba(5,150,105,.3);border-radius:7px;padding:8px 10px;background:#eef8f2;color:#166534;font:inherit;font-size:12px;font-weight:800;cursor:pointer}.tfk-trash button:disabled{opacity:.55;cursor:not-allowed}
  .tfk-trash-error,.tfk-trash-state{border:1px solid rgba(22,101,52,.14);border-radius:7px;padding:11px;background:#f8fcfa;color:#587067;display:flex;align-items:center;gap:8px;font-size:13px}.tfk-trash-error{border-color:rgba(220,38,38,.3);background:#fef2f2;color:#991b1b}
  .tfk-trash-groups{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.tfk-trash-groups>section{min-width:0;border:1px solid rgba(22,101,52,.14);border-radius:8px;overflow:hidden;align-self:start}.tfk-trash h3{margin:0;padding:10px;display:flex;align-items:center;gap:7px;background:#eef8f2;color:#166534;font-size:13px}.tfk-trash h3 span{margin-left:auto;border-radius:999px;background:#fff;padding:2px 7px;font-size:11px}.tfk-trash article{padding:10px;display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:1px solid rgba(22,101,52,.1)}.tfk-trash article>div{min-width:0;display:grid;gap:3px}.tfk-trash article strong,.tfk-trash article small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tfk-trash article strong{font-size:12px}.tfk-trash article small,.tfk-trash .read-only,.tfk-trash .bounded{color:#587067;font-size:10px}.tfk-trash .empty,.tfk-trash .bounded{margin:0;padding:12px;color:#587067;font-size:11px}.tfk-trash .spin{animation:tfk-trash-spin .9s linear infinite}@keyframes tfk-trash-spin{to{transform:rotate(360deg)}}
  .tfk-trash-bulk{padding:8px 10px;border-top:1px solid rgba(22,101,52,.1);background:#f0f9ff;display:flex;align-items:center;justify-content:space-between;gap:7px}.tfk-trash-bulk small{color:#526b76;font-size:10px}.tfk-trash-bulk button{padding:6px 8px;background:#0369a1;color:#fff;border-color:#0369a1}.tfk-trash article>input{width:auto;margin:0;accent-color:#059669}
  @media(max-width:900px){.tfk-trash-groups{grid-template-columns:1fr}}@media(max-width:620px){.tfk-trash article{align-items:flex-start;flex-direction:column}.tfk-trash article button{width:100%}}
`;
