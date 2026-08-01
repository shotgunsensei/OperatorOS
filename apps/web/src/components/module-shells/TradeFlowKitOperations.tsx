'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Archive, Bookmark, CheckCircle2, Circle, Clock3, Download, ListChecks, Loader2, Pencil, Plus, RefreshCw, Save, Search, Settings2, Share2, Trash2, Wrench, X } from 'lucide-react';
import {
  moduleShellApi,
  type TradeFlowKitJob,
  type TradeFlowKitOperationsResponse,
  type TradeFlowKitSavedView,
  type TradeFlowKitSettings,
  type TradeFlowKitTask,
} from '@/lib/auth';

const empty: TradeFlowKitOperationsResponse = {
  jobs: [], tasks: [], payments: [], settings: null,
  metrics: { leads: 0, jobs: 0, tasks: 0, completed_tasks: 0, invoiced_cents: '0', collected_cents: '0', outstanding_cents: '0' },
  pagination: { limit: 50, offset: 0, returned: 0 },
};
const money = (value: string | number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value) / 100);

function message(error: unknown): string {
  if (error && typeof error === 'object' && 'error' in error && typeof error.error === 'string') return error.error;
  if (error instanceof Error) return error.message;
  return 'TradeFlowKit operation failed.';
}

export default function TradeFlowKitOperations({ tenantKey, canManage }: { tenantKey: string; canManage: boolean }) {
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskPriority, setTaskPriority] = useState('normal');
  const [settings, setSettings] = useState<TradeFlowKitSettings | null>(null);
  const [savedViews, setSavedViews] = useState<TradeFlowKitSavedView[]>([]);
  const [viewName, setViewName] = useState('');
  const [shareView, setShareView] = useState(false);
  const [viewPending, setViewPending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null); setConflict(false);
    try {
      const next = await moduleShellApi.tradeflowkit.operations({ search: search || undefined, status: status || undefined });
      setData(next);
      const nestedJobId = typeof window === 'undefined' ? '' : window.location.pathname.match(/\/jobs\/([a-z0-9-]+)$/i)?.[1] || '';
      const nestedTaskId = typeof window === 'undefined' ? '' : window.location.pathname.match(/\/tasks\/([a-z0-9-]+)$/i)?.[1] || '';
      const taskJobId = next.tasks.find(task => task.id === nestedTaskId)?.jobId || '';
      setSelectedJobId(current => {
        const candidate = nestedJobId || taskJobId || current;
        return next.jobs.some(job => job.id === candidate) ? candidate : next.jobs[0]?.id || '';
      });
      if (canManage) {
        try { setSettings(await moduleShellApi.tradeflowkit.settings()); } catch { setSettings(next.settings); }
      } else setSettings(next.settings);
    } catch (requestError) { setError(message(requestError)); }
    finally { setLoading(false); }
  }, [canManage, search, status]);

  useEffect(() => { void load(); }, [load, tenantKey]);

  const loadSavedViews = useCallback(async () => {
    try {
      const response = await moduleShellApi.tradeflowkit.savedViews('jobs');
      setSavedViews(response.savedViews);
    } catch (requestError) {
      setError(message(requestError));
    }
  }, []);

  useEffect(() => { void loadSavedViews(); }, [loadSavedViews, tenantKey]);

  const selectedJob = data.jobs.find(job => job.id === selectedJobId) ?? null;
  const tasks = useMemo(() => data.tasks.filter(task => task.jobId === selectedJobId), [data.tasks, selectedJobId]);
  const deepTaskId = typeof window === 'undefined' ? '' : window.location.pathname.match(/\/tasks\/([a-z0-9-]+)$/i)?.[1] || '';

  async function run(operation: () => Promise<unknown>) {
    setPending(true); setError(null); setConflict(false);
    try { await operation(); await load(); }
    catch (requestError: any) {
      if (requestError?.status === 409) setConflict(true);
      setError(message(requestError));
    } finally { setPending(false); }
  }

  function addTask(event: FormEvent) {
    event.preventDefault();
    if (!selectedJob || !taskTitle.trim()) return;
    void run(async () => {
      await moduleShellApi.tradeflowkit.createTask(selectedJob.id, { title: taskTitle, priority: taskPriority, sortOrder: tasks.length });
      setTaskTitle('');
    });
  }

  function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    void run(async () => {
      const updated = await moduleShellApi.tradeflowkit.updateSettings({
        expectedVersion: settings.version,
        jobPrefix: settings.jobPrefix, quotePrefix: settings.quotePrefix, invoicePrefix: settings.invoicePrefix,
        defaultTaxRateBps: settings.defaultTaxRateBps,
        defaultHourlyRateCents: settings.defaultHourlyRateCents,
        paymentTermsDays: settings.paymentTermsDays, currency: settings.currency, timezone: settings.timezone,
      });
      setSettings(updated);
    });
  }

  async function saveCurrentView(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!viewName.trim()) return;
    setViewPending(true); setError(null);
    try {
      await moduleShellApi.tradeflowkit.createSavedView({
        resource: 'jobs',
        name: viewName,
        filters: Object.fromEntries(Object.entries({ search, status }).filter(([, value]) => value)),
        sort: { field: 'updatedAt', direction: 'desc' },
        isShared: canManage && shareView,
      });
      setViewName(''); setShareView(false);
      await loadSavedViews();
    } catch (requestError) { setError(message(requestError)); }
    finally { setViewPending(false); }
  }

  function applySavedView(view: TradeFlowKitSavedView) {
    setSearch(view.filters.search ?? '');
    setStatus(view.filters.status ?? '');
  }

  async function deleteSavedView(view: TradeFlowKitSavedView) {
    if (!view.owned || !window.confirm(`Delete saved view “${view.name}”?`)) return;
    setViewPending(true); setError(null);
    try {
      await moduleShellApi.tradeflowkit.deleteSavedView(view.id);
      await loadSavedViews();
    } catch (requestError) { setError(message(requestError)); }
    finally { setViewPending(false); }
  }

  return (
    <section id="tradeflowkit-operations" className="tfk-panel tfk-ops" data-testid="tradeflowkit-operations" tabIndex={-1}>
      <style>{css}</style>
      <header className="tfk-ops-head">
        <div><span>Persisted field operations</span><h2>Jobs, tasks, assignments, and cash position</h2><p>Every count comes from tenant-scoped records; reloads and restarts preserve this workspace.</p></div>
        <div className="tfk-ops-actions"><a href="/api/modules/tradeflowkit/exports/customers.csv">Customers CSV</a><a href="/api/modules/tradeflowkit/exports/invoices.csv">Invoices CSV</a><a href="/api/modules/tradeflowkit/exports/payments.csv">Payments CSV</a><button type="button" onClick={() => void load()} disabled={loading || pending}><RefreshCw size={15} /> Refresh</button></div>
      </header>

      <div className="tfk-ops-metrics" aria-label="Operational analytics">
        <Metric label="Open leads" value={String(data.metrics.leads)} />
        <Metric label="Jobs" value={String(data.metrics.jobs)} />
        <Metric label="Tasks complete" value={`${data.metrics.completed_tasks}/${data.metrics.tasks}`} />
        <Metric label="Invoiced" value={money(data.metrics.invoiced_cents)} />
        <Metric label="Collected" value={money(data.metrics.collected_cents)} />
        <Metric label="Outstanding" value={money(data.metrics.outstanding_cents)} />
      </div>

      <section className="tfk-accounting-exports" data-testid="tradeflowkit-accounting-exports" aria-labelledby="tradeflowkit-accounting-exports-title">
        <div><Download size={18} /><div><strong id="tradeflowkit-accounting-exports-title">Accounting handoff · format v1</strong><span>Tenant-scoped active customers, invoice lines, and successful payment-ledger entries. Review account and tax mappings in your accounting sandbox before import.</span></div></div>
        <nav aria-label="Accounting exports">
          <a data-testid="tradeflowkit-export-quickbooks-iif" href="/api/modules/tradeflowkit/exports/quickbooks.iif">QuickBooks IIF</a>
          <a href="/api/modules/tradeflowkit/exports/quickbooks/invoices.csv">QuickBooks invoice CSV</a>
          <a href="/api/modules/tradeflowkit/exports/xero/customers.csv">Xero customers</a>
          <a href="/api/modules/tradeflowkit/exports/xero/invoices.csv">Xero invoices</a>
          <a href="/api/modules/tradeflowkit/exports/xero/payments.csv">Xero payments</a>
        </nav>
      </section>

      {error && <div className={`tfk-ops-alert ${conflict ? 'conflict' : ''}`} role="alert" data-testid={conflict ? 'tradeflowkit-conflict-state' : 'tradeflowkit-operations-error'}><AlertTriangle size={17} /><span>{error}</span>{conflict && <button type="button" onClick={() => void load()}>Reload current version</button>}</div>}

      <div className="tfk-ops-toolbar">
        <label><Search size={15} /><span className="sr-only">Search jobs</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search jobs" maxLength={100} /></label>
        <select aria-label="Filter job status" value={status} onChange={event => setStatus(event.target.value)}>
          <option value="">All job statuses</option><option value="lead">Lead</option><option value="quoted">Quoted</option><option value="scheduled">Scheduled</option><option value="in_progress">In progress</option><option value="done">Done</option><option value="invoiced">Invoiced</option><option value="paid">Paid</option><option value="canceled">Canceled</option>
        </select>
      </div>

      <div className="tfk-saved-views" data-testid="tradeflowkit-saved-views">
        <form onSubmit={saveCurrentView}>
          <Bookmark size={15} />
          <label><span className="sr-only">Saved view name</span><input aria-label="Saved view name" value={viewName} onChange={event => setViewName(event.target.value)} placeholder="Save these job filters as…" minLength={1} maxLength={120} required /></label>
          {canManage && <label className="tfk-share-view"><input type="checkbox" checked={shareView} onChange={event => setShareView(event.target.checked)} /> <Share2 size={13} /> Share with tenant</label>}
          <button disabled={viewPending || !viewName.trim()}><Save size={14} /> Save view</button>
        </form>
        {savedViews.length === 0
          ? <span className="tfk-saved-empty">No saved job views yet.</span>
          : <div className="tfk-saved-chips" aria-label="Saved job views">{savedViews.map(view => <div key={view.id} data-testid={`tradeflowkit-saved-view-${view.id}`}><button type="button" className="tfk-saved-apply" onClick={() => applySavedView(view)} disabled={viewPending}>{view.isShared && <Share2 size={12} />}{view.name}</button>{view.owned && <button type="button" className="tfk-saved-delete" aria-label={`Delete saved view ${view.name}`} onClick={() => void deleteSavedView(view)} disabled={viewPending}><Trash2 size={12} /></button>}</div>)}</div>}
      </div>

      {loading ? <div className="tfk-ops-state" aria-busy="true" data-testid="tradeflowkit-operations-loading"><Loader2 className="spin" size={18} /> Loading operations…</div>
        : data.jobs.length === 0 ? <div className="tfk-ops-state" data-testid="tradeflowkit-operations-empty"><Wrench size={20} /><div><strong>No jobs in this view</strong><span>Convert a lead or create a customer job in the revenue workflow.</span></div></div>
          : <div className="tfk-ops-layout">
            <aside aria-label="Jobs">
              {data.jobs.map(job => <JobButton key={job.id} job={job} active={job.id === selectedJobId} onClick={() => setSelectedJobId(job.id)} settings={settings} />)}
            </aside>
            <div className="tfk-task-board">
              {selectedJob && <>
                <JobEditor job={selectedJob} settings={settings} pending={pending} canManage={canManage} activeTaskCount={tasks.length} run={run} />
                {canManage && <form onSubmit={addTask} className="tfk-task-form"><input aria-label="New task title" required value={taskTitle} onChange={event => setTaskTitle(event.target.value)} placeholder="Add a job task" maxLength={200} /><select aria-label="Task priority" value={taskPriority} onChange={event => setTaskPriority(event.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select><button disabled={pending || !taskTitle.trim()}><Plus size={15} /> Add task</button></form>}
                {tasks.length === 0 ? <div className="tfk-task-empty"><ListChecks size={18} /> No tasks yet. Add the first work step above.</div> : <div className="tfk-task-list">{tasks.map(task => <TaskRow key={task.id} task={task} selected={task.id === deepTaskId} pending={pending} canManage={canManage} run={run} />)}</div>}
              </>}
            </div>
          </div>}

      {canManage && settings && <form id="tradeflowkit-operating-settings" className="tfk-settings" onSubmit={saveSettings} data-testid="tradeflowkit-operating-settings"><div><Settings2 size={18} /><div><strong>Operating defaults</strong><span>Number prefixes, tax, labor rate, terms, currency, and timezone.</span></div></div><label>Job prefix<input value={settings.jobPrefix} onChange={event => setSettings({ ...settings, jobPrefix: event.target.value.toUpperCase() })} maxLength={12} /></label><label>Quote prefix<input value={settings.quotePrefix} onChange={event => setSettings({ ...settings, quotePrefix: event.target.value.toUpperCase() })} maxLength={12} /></label><label>Invoice prefix<input value={settings.invoicePrefix} onChange={event => setSettings({ ...settings, invoicePrefix: event.target.value.toUpperCase() })} maxLength={12} /></label><label>Default tax %<input type="number" min="0" max="100" step="0.01" value={settings.defaultTaxRateBps / 100} onChange={event => setSettings({ ...settings, defaultTaxRateBps: Math.round(Number(event.target.value) * 100) })} /></label><label>Payment terms days<input type="number" min="0" max="365" value={settings.paymentTermsDays} onChange={event => setSettings({ ...settings, paymentTermsDays: Number(event.target.value) })} /></label><label>Timezone<input value={settings.timezone} onChange={event => setSettings({ ...settings, timezone: event.target.value })} maxLength={80} /></label><button disabled={pending}>Save defaults · v{settings.version}</button></form>}
    </section>
  );
}

function formatJobNumber(job: TradeFlowKitJob, settings: TradeFlowKitSettings | null) {
  return job.number ? `${settings?.jobPrefix ?? 'JOB'}-${String(job.number).padStart(5, '0')}` : 'Unnumbered job';
}

function Metric({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }

function JobButton({ job, active, onClick, settings }: { job: TradeFlowKitJob; active: boolean; onClick: () => void; settings: TradeFlowKitSettings | null }) {
  return <button type="button" className={active ? 'active' : ''} onClick={onClick}><span>{formatJobNumber(job, settings)}</span><strong>{job.title}</strong><small>{job.status.replaceAll('_', ' ')} · {job.priority}</small></button>;
}

function JobEditor({ job, settings, pending, canManage, activeTaskCount, run }: {
  job: TradeFlowKitJob; settings: TradeFlowKitSettings | null; pending: boolean; canManage: boolean;
  activeTaskCount: number; run: (operation: () => Promise<unknown>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(job.title);
  const [description, setDescription] = useState(job.description ?? '');
  const [status, setStatus] = useState(job.status);
  const [priority, setPriority] = useState(job.priority);

  useEffect(() => {
    setTitle(job.title);
    setDescription(job.description ?? '');
    setStatus(job.status);
    setPriority(job.priority);
  }, [job]);

  if (editing) {
    return <form className="tfk-record-editor" data-testid={`tradeflowkit-job-editor-${job.id}`} onSubmit={event => {
      event.preventDefault();
      void run(async () => {
        await moduleShellApi.tradeflowkit.updateJob(job.id, { expectedVersion: job.version, title, description, status, priority });
        setEditing(false);
      });
    }}>
      <div className="tfk-editor-grid">
        <label>Job title<input required minLength={2} maxLength={200} value={title} onChange={event => setTitle(event.target.value)} /></label>
        <label>Status<select value={status} onChange={event => setStatus(event.target.value)}><option value="lead">Lead</option><option value="quoted">Quoted</option><option value="scheduled">Scheduled</option><option value="in_progress">In progress</option><option value="done">Done</option><option value="invoiced">Invoiced</option><option value="paid">Paid</option><option value="canceled">Canceled</option></select></label>
        <label>Priority<select value={priority} onChange={event => setPriority(event.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
      </div>
      <label>Description<textarea maxLength={4000} rows={3} value={description} onChange={event => setDescription(event.target.value)} /></label>
      <div className="tfk-record-actions"><button type="button" className="secondary" disabled={pending} onClick={() => setEditing(false)}><X size={14} /> Cancel</button><button disabled={pending || title.trim().length < 2}><Save size={14} /> Save job · v{job.version}</button></div>
    </form>;
  }

  return <div className="tfk-task-title" data-testid={`tradeflowkit-job-${job.id}`}><div><span>{formatJobNumber(job, settings)}</span><h3>{job.title}</h3><p>{job.status.replaceAll('_', ' ')} · {job.priority} priority · v{job.version}</p>{job.description && <p className="tfk-record-description">{job.description}</p>}</div><div className="tfk-record-actions"><a href={`/jobs/${job.id}`}>Record deep link</a>{canManage && <button type="button" className="edit" disabled={pending} onClick={() => setEditing(true)}><Pencil size={14} /> Edit</button>}{canManage && <button type="button" className="danger" disabled={pending} onClick={() => {
    if (window.confirm(`Archive this job? ${activeTaskCount ? 'Archive its active tasks first.' : 'It will leave the active workspace.'}`)) void run(() => moduleShellApi.tradeflowkit.archiveJob(job.id, job.version));
  }}><Archive size={14} /> Archive</button>}</div></div>;
}

function TaskRow({ task, selected, pending, canManage, run }: {
  task: TradeFlowKitTask; selected: boolean; pending: boolean; canManage: boolean;
  run: (operation: () => Promise<unknown>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [status, setStatus] = useState<TradeFlowKitTask['status']>(task.status);
  const [priority, setPriority] = useState<TradeFlowKitTask['priority']>(task.priority);
  const [dueAt, setDueAt] = useState(task.dueAt ? task.dueAt.slice(0, 10) : '');

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description ?? '');
    setStatus(task.status);
    setPriority(task.priority);
    setDueAt(task.dueAt ? task.dueAt.slice(0, 10) : '');
  }, [task]);

  const Icon = task.status === 'completed' ? CheckCircle2 : task.status === 'in_progress' ? Clock3 : Circle;
  if (editing) {
    return <form className={`tfk-record-editor ${selected ? 'selected' : ''}`} data-testid={`tradeflowkit-task-editor-${task.id}`} onSubmit={event => {
      event.preventDefault();
      void run(async () => {
        await moduleShellApi.tradeflowkit.updateTask(task.id, { expectedVersion: task.version, title, description, status, priority, dueAt: dueAt || undefined });
        setEditing(false);
      });
    }}>
      <div className="tfk-editor-grid task">
        <label>Task title<input required minLength={2} maxLength={200} value={title} onChange={event => setTitle(event.target.value)} /></label>
        <label>Status<select value={status} onChange={event => setStatus(event.target.value as TradeFlowKitTask['status'])}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="completed">Completed</option><option value="canceled">Canceled</option></select></label>
        <label>Priority<select value={priority} onChange={event => setPriority(event.target.value as TradeFlowKitTask['priority'])}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
        <label>Due date<input type="date" value={dueAt} onChange={event => setDueAt(event.target.value)} /></label>
      </div>
      <label>Description<textarea maxLength={4000} rows={2} value={description} onChange={event => setDescription(event.target.value)} /></label>
      <div className="tfk-record-actions"><button type="button" className="secondary" disabled={pending} onClick={() => setEditing(false)}><X size={14} /> Cancel</button><button disabled={pending || title.trim().length < 2}><Save size={14} /> Save task · v{task.version}</button></div>
    </form>;
  }

  return <article className={`tfk-task tfk-task-${task.status} ${selected ? 'selected' : ''}`} id={`tradeflowkit-task-${task.id}`} data-testid={`tradeflowkit-task-${task.id}`}><Icon size={18} /><div><strong>{task.title}</strong><span>{task.priority} priority{task.dueAt ? ` · due ${new Date(task.dueAt).toLocaleDateString()}` : ''} · v{task.version}</span>{task.description && <span>{task.description}</span>}</div><div className="tfk-record-actions"><a href={`/tasks/${task.id}`}>Deep link</a>{canManage && <button type="button" className="edit" disabled={pending} onClick={() => setEditing(true)}><Pencil size={13} /> Edit</button>}{canManage && <button type="button" className="danger" disabled={pending} onClick={() => {
    if (window.confirm('Archive this task? It will leave the active job board.')) void run(() => moduleShellApi.tradeflowkit.archiveTask(task.id, task.version));
  }}><Archive size={13} /> Archive</button>}</div></article>;
}

const css = `
  .tfk-ops { margin-top:18px; padding:18px; display:grid; gap:15px; }
  .tfk-ops-head { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; }
  .tfk-ops-head span { color:#059669; font-size:11px; font-weight:900; letter-spacing:.08em; text-transform:uppercase; }
  .tfk-ops-head h2 { margin:4px 0; font-size:20px; color:#10231d; }
  .tfk-ops-head p { margin:0; color:#587067; font-size:13px; }
  .tfk-ops-head button,.tfk-task-form button,.tfk-settings button { border:0; border-radius:7px; background:#047857; color:white; padding:9px 12px; font-weight:800; display:inline-flex; align-items:center; justify-content:center; gap:6px; cursor:pointer; }
  .tfk-ops-actions { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }.tfk-ops-actions a { border:1px solid rgba(5,150,105,.25); border-radius:7px; color:#047857; padding:8px 9px; font-size:11px; font-weight:800; text-decoration:none; background:white; }
  .tfk-ops-metrics { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:8px; }
  .tfk-ops-metrics div { border:1px solid rgba(22,101,52,.14); background:#f4fbf7; border-radius:8px; padding:10px; display:grid; gap:3px; }
  .tfk-ops-metrics span { color:#6d847c; font-size:10px; font-weight:800; text-transform:uppercase; }
  .tfk-ops-metrics strong { color:#10231d; font-size:15px; }
  .tfk-accounting-exports { border:1px solid rgba(3,105,161,.18); background:#f0f9ff; border-radius:8px; padding:11px; display:grid; gap:10px; }
  .tfk-accounting-exports>div { display:flex; gap:8px; align-items:flex-start; color:#0369a1; }.tfk-accounting-exports>div div { display:grid; gap:2px; }.tfk-accounting-exports>div span { color:#526b76; font-size:11px; line-height:1.45; }
  .tfk-accounting-exports nav { display:flex; flex-wrap:wrap; gap:6px; }.tfk-accounting-exports a { border:1px solid rgba(3,105,161,.23); border-radius:7px; background:white; color:#0369a1; padding:7px 9px; font-size:11px; font-weight:800; text-decoration:none; }
  .tfk-ops-alert { padding:10px 12px; border:1px solid rgba(220,38,38,.25); background:#fff1f2; color:#991b1b; border-radius:7px; display:flex; align-items:center; gap:8px; }
  .tfk-ops-alert span { flex:1; }.tfk-ops-alert button { border:1px solid currentColor; background:white; color:inherit; border-radius:5px; padding:6px 8px; }
  .tfk-ops-alert.conflict { background:#fff7ed; color:#9a3412; }
  .tfk-ops-toolbar { display:grid; grid-template-columns:minmax(220px,1fr) 180px; gap:8px; }
  .tfk-ops-toolbar label { position:relative; }.tfk-ops-toolbar svg { position:absolute; left:10px; top:10px; color:#789189; }
  .tfk-ops input,.tfk-ops select { box-sizing:border-box; width:100%; border:1px solid rgba(22,101,52,.2); border-radius:7px; padding:9px 10px; background:white; color:#10231d; font:inherit; font-size:13px; }
  .tfk-ops-toolbar input { padding-left:33px; }
  .tfk-saved-views { border:1px solid rgba(22,101,52,.14); background:#f8fcfa; border-radius:8px; padding:9px; display:grid; gap:8px; }
  .tfk-saved-views form { display:grid; grid-template-columns:auto minmax(180px,1fr) auto auto; gap:8px; align-items:center; color:#047857; }
  .tfk-saved-views form > label { position:static; }.tfk-saved-views form input { padding:8px 9px; }
  .tfk-saved-views form button { border:0; border-radius:7px; background:#047857; color:white; padding:8px 10px; font-weight:800; display:inline-flex; align-items:center; justify-content:center; gap:5px; cursor:pointer; }
  .tfk-saved-views .tfk-share-view { color:#425e55; font-size:11px; font-weight:800; display:flex; align-items:center; gap:5px; white-space:nowrap; }.tfk-saved-views .tfk-share-view input { width:auto; }
  .tfk-saved-chips { display:flex; gap:6px; flex-wrap:wrap; }.tfk-saved-chips > div { display:inline-flex; border:1px solid rgba(5,150,105,.22); border-radius:999px; overflow:hidden; background:white; }
  .tfk-saved-chips button { border:0; background:transparent; color:#047857; padding:6px 9px; font-size:11px; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:4px; }.tfk-saved-chips .tfk-saved-delete { color:#b91c1c; padding-left:6px; border-left:1px solid rgba(5,150,105,.14); }
  .tfk-saved-empty { color:#6d847c; font-size:11px; }
  .tfk-ops-layout { display:grid; grid-template-columns:minmax(210px,280px) minmax(0,1fr); gap:12px; min-height:280px; }
  .tfk-ops-layout aside { display:grid; align-content:start; gap:6px; max-height:520px; overflow:auto; }
  .tfk-ops-layout aside button { text-align:left; border:1px solid rgba(22,101,52,.14); border-radius:7px; background:white; padding:10px; display:grid; gap:3px; cursor:pointer; color:#10231d; }
  .tfk-ops-layout aside button.active { border-color:#059669; background:#ecfdf5; box-shadow:inset 3px 0 #059669; }
  .tfk-ops-layout aside span,.tfk-task-title span { color:#047857; font-size:10px; font-weight:900; text-transform:uppercase; }
  .tfk-ops-layout aside small { color:#6d847c; text-transform:capitalize; }
  .tfk-task-board { border:1px solid rgba(22,101,52,.14); border-radius:9px; padding:14px; background:#fbfefc; }
  .tfk-task-title { display:flex; justify-content:space-between; gap:12px; align-items:start; }.tfk-task-title h3 { margin:3px 0; }.tfk-task-title p { margin:0; color:#587067; font-size:12px; text-transform:capitalize; }.tfk-task-title .tfk-record-description { margin-top:6px; max-width:620px; text-transform:none; }.tfk-task-title a { font-size:12px; color:#0369a1; }
  .tfk-task-form { display:grid; grid-template-columns:minmax(0,1fr) 130px auto; gap:8px; margin-top:13px; }
  .tfk-task-list { display:grid; gap:7px; margin-top:12px; }.tfk-task { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:9px; align-items:center; background:white; border:1px solid rgba(22,101,52,.13); border-radius:7px; padding:10px; }.tfk-task.selected,.tfk-record-editor.selected { border-color:#059669; box-shadow:inset 3px 0 #059669; background:#f0fdf4; }.tfk-task > div { display:grid; gap:2px; }.tfk-task span { color:#6d847c; font-size:11px; }.tfk-task-completed strong { text-decoration:line-through; color:#6d847c; }.tfk-task-completed > svg { color:#059669; }
  .tfk-record-actions { display:flex; gap:6px; align-items:center; justify-content:flex-end; flex-wrap:wrap; }.tfk-record-actions a { color:#0369a1; font-size:11px; font-weight:800; }.tfk-record-actions button { border:0; border-radius:6px; padding:7px 9px; background:#047857; color:white; font-weight:800; display:inline-flex; gap:5px; align-items:center; cursor:pointer; }.tfk-record-actions button.edit { background:#b7791f; }.tfk-record-actions button.danger { background:#dc2626; }.tfk-record-actions button.secondary { background:#64748b; }
  .tfk-record-editor { border:1px solid rgba(22,101,52,.18); border-radius:8px; background:white; padding:11px; display:grid; gap:9px; }.tfk-record-editor label { color:#587067; font-size:11px; font-weight:700; display:grid; gap:4px; }.tfk-record-editor textarea { box-sizing:border-box; width:100%; border:1px solid rgba(22,101,52,.2); border-radius:7px; padding:9px 10px; background:white; color:#10231d; font:inherit; font-size:13px; resize:vertical; }.tfk-editor-grid { display:grid; grid-template-columns:minmax(200px,2fr) minmax(130px,1fr) minmax(120px,1fr); gap:8px; }.tfk-editor-grid.task { grid-template-columns:minmax(180px,2fr) repeat(3,minmax(115px,1fr)); }
  .tfk-task-empty,.tfk-ops-state { min-height:90px; display:flex; align-items:center; justify-content:center; gap:9px; color:#587067; border:1px dashed rgba(22,101,52,.2); border-radius:7px; margin-top:12px; }.tfk-ops-state div { display:grid; gap:3px; }.tfk-ops-state span { font-size:12px; }
  .tfk-settings { border-top:1px solid rgba(22,101,52,.14); padding-top:15px; display:grid; grid-template-columns:1.4fr repeat(3,minmax(100px,1fr)); gap:9px; align-items:end; }.tfk-settings > div { display:flex; gap:8px; align-items:start; }.tfk-settings > div div { display:grid; }.tfk-settings > div span,.tfk-settings label { color:#587067; font-size:11px; }.tfk-settings label { display:grid; gap:4px; }.tfk-settings button { grid-column:4; }
  .spin { animation:tfk-ops-spin 1s linear infinite; } @keyframes tfk-ops-spin { to { transform:rotate(360deg); } }
  .sr-only { position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0; }
  @media(max-width:960px){.tfk-ops-metrics{grid-template-columns:repeat(3,1fr)}.tfk-settings{grid-template-columns:repeat(2,1fr)}.tfk-settings>div{grid-column:1/-1}.tfk-settings button{grid-column:auto}}
  @media(max-width:700px){.tfk-ops-head{display:grid}.tfk-ops-toolbar,.tfk-ops-layout{grid-template-columns:1fr}.tfk-saved-views form{grid-template-columns:auto minmax(0,1fr)}.tfk-saved-views form button{grid-column:1/-1}.tfk-ops-layout aside{display:flex;overflow:auto}.tfk-ops-layout aside button{min-width:190px}.tfk-task-title{display:grid}.tfk-task-form,.tfk-editor-grid,.tfk-editor-grid.task{grid-template-columns:1fr}.tfk-task{grid-template-columns:auto minmax(0,1fr)}.tfk-task>.tfk-record-actions{grid-column:1/-1}.tfk-settings{grid-template-columns:1fr}.tfk-ops-metrics{grid-template-columns:repeat(2,1fr)}}
`;
