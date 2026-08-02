'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Loader2, Mail, MessageSquare, Plus, Search, Trash2, UserRound } from 'lucide-react';
import { moduleShellApi } from '@/lib/auth';
import TradeFlowKitLeadOperations from './TradeFlowKitLeadOperations';

type LeadStatus = 'new' | 'contacted' | 'qualified' | 'follow_up' | 'converted' | 'lost';
type LeadUrgency = 'normal' | 'urgent' | 'emergency';

interface TradeFlowKitLead {
  id: string;
  status: LeadStatus;
  source: 'manual';
  name: string;
  phone: string | null;
  email: string | null;
  serviceType: string | null;
  description: string | null;
  urgency: LeadUrgency;
  estimatedValueCents: number | null;
  nextFollowUpAt: string | null;
  lastContactedAt: string | null;
  consentToSms: boolean;
  createdAt: string;
  updatedAt: string;
  customerId?: string | null;
  jobId?: string | null;
}

const STATUS_OPTIONS: Array<{ value: LeadStatus; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'follow_up', label: 'Follow up' },
  { value: 'converted', label: 'Converted' },
  { value: 'lost', label: 'Lost' },
];

const initialForm = {
  name: '',
  phone: '',
  email: '',
  serviceType: '',
  description: '',
  urgency: 'normal' as LeadUrgency,
  estimatedValue: '',
  consentToSms: false,
};

function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'error' in error && typeof error.error === 'string') {
    return error.error;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function money(cents: number | null): string {
  if (cents === null) return 'Value not set';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default function TradeFlowKitLeadCenter({ tenantKey, canManage }: { tenantKey: string; canManage: boolean }) {
  const [leads, setLeads] = useState<TradeFlowKitLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [messagingId, setMessagingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all');
  const deepLeadId = typeof window === 'undefined' ? '' : window.location.pathname.match(/\/leads\/([a-z0-9-]+)$/i)?.[1] || '';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    moduleShellApi.tradeflowkit.list()
      .then((response: any) => {
        if (!cancelled) setLeads(Array.isArray(response?.leads) ? response.leads : []);
      })
      .catch((requestError) => {
        if (!cancelled) setError(errorMessage(requestError, 'Could not load tenant leads.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tenantKey]);

  const visibleLeads = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (statusFilter !== 'all' && lead.status !== statusFilter) return false;
      if (!needle) return true;
      return [lead.name, lead.phone, lead.email, lead.serviceType]
        .some((value) => value?.toLowerCase().includes(needle));
    });
  }, [leads, search, statusFilter]);

  const metrics = useMemo(() => ({
    open: leads.filter((lead) => !['lost', 'converted'].includes(lead.status)).length,
    new: leads.filter((lead) => lead.status === 'new').length,
    qualified: leads.filter((lead) => lead.status === 'qualified').length,
    pipelineCents: leads
      .filter((lead) => !['lost', 'converted'].includes(lead.status))
      .reduce((total, lead) => total + (lead.estimatedValueCents ?? 0), 0),
  }), [leads]);

  async function createLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || submitting || !form.name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const estimatedValueCents = form.estimatedValue.trim()
        ? Math.round(Number(form.estimatedValue) * 100)
        : null;
      if (estimatedValueCents !== null && (!Number.isSafeInteger(estimatedValueCents) || estimatedValueCents < 0)) {
        setError('Estimated value must be zero or greater.');
        return;
      }
      const created = await moduleShellApi.tradeflowkit.create({
        name: form.name,
        phone: form.phone,
        email: form.email,
        serviceType: form.serviceType,
        description: form.description,
        urgency: form.urgency,
        estimatedValueCents,
        consentToSms: form.consentToSms,
      }) as TradeFlowKitLead;
      setLeads((current) => [created, ...current]);
      setForm(initialForm);
    } catch (requestError) {
      setError(errorMessage(requestError, 'Could not create the lead.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(lead: TradeFlowKitLead, status: LeadStatus) {
    if (!canManage || lead.status === status || updatingId) return;
    setUpdatingId(lead.id);
    setError(null);
    try {
      const updated = await moduleShellApi.tradeflowkit.update(lead.id, { status }) as TradeFlowKitLead;
      setLeads((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (requestError) {
      setError(errorMessage(requestError, 'Could not update the lead status.'));
    } finally {
      setUpdatingId(null);
    }
  }

  async function deleteLead(id: string) {
    if (!canManage || updatingId) return;
    setUpdatingId(id);
    setError(null);
    try {
      await moduleShellApi.tradeflowkit.delete(id);
      setLeads((current) => current.filter((lead) => lead.id !== id));
      setPendingDeleteId(null);
    } catch (requestError) {
      setError(errorMessage(requestError, 'Could not remove the lead.'));
    } finally {
      setUpdatingId(null);
    }
  }

  async function convertLead(lead: TradeFlowKitLead) {
    if (!canManage || updatingId || lead.status === 'converted' || lead.status === 'lost') return;
    setUpdatingId(lead.id); setError(null);
    try {
      const result = await moduleShellApi.tradeflowkit.convertLead(lead.id) as { lead: TradeFlowKitLead };
      setLeads(current => current.map(item => item.id === lead.id ? result.lead : item));
    } catch (requestError) {
      setError(errorMessage(requestError, 'Could not convert the lead into a customer and job.'));
    } finally { setUpdatingId(null); }
  }

  async function messageLead(lead: TradeFlowKitLead, channel: 'email' | 'sms') {
    if (!canManage || messagingId || (channel === 'email' ? !lead.email : !lead.phone || !lead.consentToSms)) return;
    setMessagingId(`${channel}:${lead.id}`); setError(null); setNotice(null);
    try {
      const key = `lead-${channel}-${lead.id}-${crypto.randomUUID()}`;
      const result = await moduleShellApi.tradeflowkit.messageLead(lead.id, channel, key);
      setNotice(`${channel === 'email' ? 'Email' : 'SMS'} ${result.duplicate ? 'was already' : 'is'} queued for ${lead.name}. Provider delivery is tracked by OperatorOS.`);
    } catch (requestError) {
      setError(errorMessage(requestError, `Could not queue the ${channel}.`));
    } finally { setMessagingId(null); }
  }

  return (
    <section id="tradeflowkit-leads" className="tfk-panel tfk-lead-center" data-testid="tradeflowkit-lead-center">
      <style>{leadCenterCss}</style>
      <div className="tfk-lead-heading">
        <div>
          <div className="tfk-lead-eyebrow">Active sales workflow</div>
          <h2>Lead Conversion Center</h2>
          <p>
            Capture, qualify, and convert tenant leads into shared-directory customers and numbered jobs. Provider delivery uses the shared notification outbox.
          </p>
        </div>
        <div className="tfk-lead-metrics" aria-label="Lead pipeline summary">
          <Metric label="Open" value={String(metrics.open)} />
          <Metric label="New" value={String(metrics.new)} />
          <Metric label="Qualified" value={String(metrics.qualified)} />
          <Metric label="Pipeline" value={money(metrics.pipelineCents)} />
        </div>
      </div>

      {error && (
        <div className="tfk-lead-error" role="alert" data-testid="tradeflowkit-lead-error">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss lead error">Dismiss</button>
        </div>
      )}
      {notice && <div className="tfk-lead-notice" role="status" data-testid="tradeflowkit-lead-message-status">{notice}</div>}

      <TradeFlowKitLeadOperations tenantKey={tenantKey} canManage={canManage} leads={leads} />

      {canManage ? <form className="tfk-lead-form" onSubmit={createLead} data-testid="tradeflowkit-lead-form">
        <div className="tfk-lead-form-title">
          <Plus size={17} aria-hidden="true" />
          <strong>Add a manual lead</strong>
          <span>Ownership and access are assigned automatically.</span>
        </div>
        <label>
          <span>Name *</span>
          <input
            required
            maxLength={120}
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Customer or contact"
            data-testid="tradeflowkit-lead-name"
          />
        </label>
        <label>
          <span>Phone</span>
          <input
            maxLength={40}
            value={form.phone}
            onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
            placeholder="(555) 555-0123"
            inputMode="tel"
          />
        </label>
        <label>
          <span>Email</span>
          <input
            maxLength={254}
            type="email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            placeholder="contact@example.com"
          />
        </label>
        <label>
          <span>Service</span>
          <input
            maxLength={160}
            value={form.serviceType}
            onChange={(event) => setForm((current) => ({ ...current, serviceType: event.target.value }))}
            placeholder="Panel upgrade, HVAC repair…"
          />
        </label>
        <label>
          <span>Urgency</span>
          <select
            value={form.urgency}
            onChange={(event) => setForm((current) => ({ ...current, urgency: event.target.value as LeadUrgency }))}
          >
            <option value="normal">Normal</option>
            <option value="urgent">Urgent</option>
            <option value="emergency">Emergency</option>
          </select>
        </label>
        <label>
          <span>Estimated value</span>
          <input
            min="0"
            max="10000000"
            step="0.01"
            type="number"
            inputMode="decimal"
            value={form.estimatedValue}
            onChange={(event) => setForm((current) => ({ ...current, estimatedValue: event.target.value }))}
            placeholder="0.00"
          />
        </label>
        <label className="tfk-lead-consent">
          <input
            type="checkbox"
            checked={form.consentToSms}
            onChange={(event) => setForm((current) => ({ ...current, consentToSms: event.target.checked }))}
          />
          <span>Customer explicitly consented to SMS; opt-out wording is enforced.</span>
        </label>
        <label className="tfk-lead-form-wide">
          <span>Notes</span>
          <textarea
            maxLength={4000}
            rows={2}
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            placeholder="Scope, timing, and the next useful detail."
          />
        </label>
        <div className="tfk-lead-form-action">
          <button type="submit" disabled={submitting || !form.name.trim()} data-testid="tradeflowkit-lead-create">
            {submitting ? <Loader2 className="tfk-spin" size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
            {submitting ? 'Saving…' : 'Add lead'}
          </button>
        </div>
      </form> : <div className="tfk-lead-read-only" data-testid="tradeflowkit-lead-read-only">Viewer access is read only. Lead and message actions require operator access.</div>}

      <div className="tfk-lead-toolbar">
        <label className="tfk-lead-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search leads</span>
          <input
            value={search}
            maxLength={100}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, contact, or service"
            data-testid="tradeflowkit-lead-search"
          />
        </label>
        <label>
          <span className="sr-only">Filter by status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as LeadStatus | 'all')}>
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="tfk-lead-state" aria-busy="true" data-testid="tradeflowkit-lead-loading">
          <Loader2 className="tfk-spin" size={19} aria-hidden="true" />
          Loading leads…
        </div>
      ) : visibleLeads.length === 0 ? (
        <div className="tfk-lead-state" data-testid="tradeflowkit-lead-empty">
          <UserRound size={20} aria-hidden="true" />
          <div>
            <strong>{leads.length === 0 ? 'No leads yet' : 'No leads match this view'}</strong>
            <span>{leads.length === 0 ? 'Add the first manual lead above.' : 'Clear the search or choose another status.'}</span>
          </div>
        </div>
      ) : (
        <div className="tfk-lead-list" data-testid="tradeflowkit-lead-list">
          {visibleLeads.map((lead) => (
            <article className={`tfk-lead-row${lead.id === deepLeadId ? ' selected' : ''}`} key={lead.id} data-testid={`tradeflowkit-lead-${lead.id}`}>
              <div className="tfk-lead-identity">
                <div className={`tfk-lead-urgency tfk-lead-urgency-${lead.urgency}`}>{lead.urgency}</div>
                <h3>{lead.name}</h3>
                <p>{lead.serviceType || 'Service not specified'}</p>
              </div>
              <div className="tfk-lead-contact">
                <span>{lead.phone || 'No phone'}</span>
                <span>{lead.email || 'No email'}</span>
                {canManage && <div className="tfk-lead-message-actions">
                  <button
                    type="button"
                    disabled={!lead.email || !!messagingId}
                    onClick={() => void messageLead(lead, 'email')}
                    aria-label={`Queue email to ${lead.name}`}
                  >{messagingId === `email:${lead.id}` ? <Loader2 className="tfk-spin" size={13} /> : <Mail size={13} />} Email</button>
                  <button
                    type="button"
                    disabled={!lead.phone || !lead.consentToSms || !!messagingId}
                    onClick={() => void messageLead(lead, 'sms')}
                    title={!lead.consentToSms ? 'SMS consent is required' : undefined}
                    aria-label={`Queue SMS to ${lead.name}`}
                  >{messagingId === `sms:${lead.id}` ? <Loader2 className="tfk-spin" size={13} /> : <MessageSquare size={13} />} SMS</button>
                </div>}
              </div>
              <div className="tfk-lead-value">
                <strong>{money(lead.estimatedValueCents)}</strong>
                <span>Added {new Date(lead.createdAt).toLocaleDateString()}</span>
              </div>
              <label className="tfk-lead-status">
                <span className="sr-only">Status for {lead.name}</span>
                <select
                  value={lead.status}
                  disabled={!canManage || updatingId === lead.id || lead.status === 'converted'}
                  onChange={(event) => updateStatus(lead, event.target.value as LeadStatus)}
                  data-testid={`tradeflowkit-lead-status-${lead.id}`}
                >
                  {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value} disabled={option.value === 'converted'}>{option.label}</option>)}
                </select>
              </label>
              <div className="tfk-lead-delete">
                {lead.status === 'converted' && lead.jobId ? (
                  <a className="tfk-converted-link" href={`/jobs/${lead.jobId}`}>Job <ArrowRight size={14} /></a>
                ) : !canManage ? (
                  <span className="tfk-lead-read-only-label">Read only</span>
                ) : pendingDeleteId === lead.id ? (
                  <>
                    <button type="button" className="tfk-danger" disabled={updatingId === lead.id} onClick={() => deleteLead(lead.id)}>
                      Confirm
                    </button>
                    <button type="button" onClick={() => setPendingDeleteId(null)}>Cancel</button>
                  </>
                ) : (
                  <><button type="button" className="tfk-convert" disabled={updatingId === lead.id || lead.status === 'lost'} onClick={() => void convertLead(lead)}><ArrowRight size={14} /> Convert</button><button type="button" aria-label={`Remove ${lead.name}`} onClick={() => setPendingDeleteId(lead.id)}><Trash2 size={15} aria-hidden="true" /></button></>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const leadCenterCss = `
  .tfk-lead-center { padding: 18px; display: grid; gap: 16px; }
  .tfk-lead-heading { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr) auto; align-items: start; }
  .tfk-lead-heading h2 { margin: 4px 0 0; font-size: 20px; }
  .tfk-lead-heading p { margin: 6px 0 0; max-width: 720px; color: #587067; font-size: 13px; line-height: 1.5; }
  .tfk-lead-eyebrow { color: #059669; font-size: 11px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
  .tfk-lead-metrics { display: grid; grid-template-columns: repeat(4, minmax(82px, auto)); gap: 8px; }
  .tfk-lead-metrics > div { border: 1px solid rgba(22,101,52,.16); border-radius: 7px; padding: 9px 11px; background: #f6fbf8; display: grid; gap: 2px; }
  .tfk-lead-metrics span { color: #789189; font-size: 10px; text-transform: uppercase; font-weight: 800; }
  .tfk-lead-metrics strong { color: #10231d; font-size: 14px; }
  .tfk-lead-error { border: 1px solid rgba(220,38,38,.35); background: rgba(254,242,242,.9); color: #991b1b; border-radius: 7px; padding: 10px 12px; display: flex; gap: 9px; align-items: center; font-size: 13px; }
  .tfk-lead-error span { flex: 1; }
  .tfk-lead-error button { border: 0; background: transparent; color: #991b1b; font-weight: 800; cursor: pointer; }
  .tfk-lead-notice, .tfk-lead-read-only { border: 1px solid rgba(5,150,105,.25); background: #f0fdf4; color: #166534; border-radius: 7px; padding: 10px 12px; font-size: 12px; }
  .tfk-lead-form { border: 1px solid rgba(5,150,105,.24); background: #eef8f2; border-radius: 8px; padding: 14px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 11px; }
  .tfk-lead-form-title { grid-column: 1 / -1; display: flex; gap: 8px; align-items: center; color: #10231d; }
  .tfk-lead-form-title span { color: #587067; font-size: 12px; margin-left: auto; }
  .tfk-lead-form label, .tfk-lead-toolbar label { display: grid; gap: 5px; min-width: 0; }
  .tfk-lead-form label > span { color: #587067; font-size: 11px; font-weight: 800; }
  .tfk-lead-form input, .tfk-lead-form select, .tfk-lead-form textarea, .tfk-lead-toolbar input, .tfk-lead-toolbar select, .tfk-lead-status select { width: 100%; box-sizing: border-box; border: 1px solid rgba(22,101,52,.2); background: #fff; color: #10231d; border-radius: 6px; padding: 9px 10px; font: inherit; font-size: 13px; }
  .tfk-lead-form input:focus, .tfk-lead-form select:focus, .tfk-lead-form textarea:focus, .tfk-lead-toolbar input:focus, .tfk-lead-toolbar select:focus, .tfk-lead-status select:focus { outline: 2px solid rgba(5,150,105,.28); border-color: #059669; }
  .tfk-lead-form textarea { resize: vertical; }
  .tfk-lead-form .tfk-lead-consent { grid-column: span 1; display: flex; flex-direction: row; align-items: center; gap: 8px; }
  .tfk-lead-form .tfk-lead-consent input { width: 16px; height: 16px; flex: 0 0 auto; }
  .tfk-lead-form-wide { grid-column: span 2; }
  .tfk-lead-form-action { display: flex; align-items: end; }
  .tfk-lead-form-action button { width: 100%; min-height: 38px; border: 0; border-radius: 6px; background: #059669; color: white; display: inline-flex; align-items: center; justify-content: center; gap: 7px; font-weight: 800; cursor: pointer; }
  .tfk-lead-form-action button:disabled { opacity: .55; cursor: not-allowed; }
  .tfk-lead-toolbar { display: grid; grid-template-columns: minmax(240px, 1fr) minmax(150px, auto); gap: 10px; }
  .tfk-lead-search { position: relative; }
  .tfk-lead-search > svg { position: absolute; top: 10px; left: 10px; color: #789189; z-index: 1; }
  .tfk-lead-search input { padding-left: 34px; }
  .tfk-lead-list { display: grid; gap: 8px; }
  .tfk-lead-row { border: 1px solid rgba(22,101,52,.14); border-radius: 7px; background: #fff; padding: 11px; display: grid; grid-template-columns: minmax(150px, 1.2fr) minmax(150px, 1fr) minmax(115px, .65fr) 130px auto; gap: 12px; align-items: center; }
  .tfk-lead-row.selected { border-color: #059669; background: #f0fdf4; box-shadow: inset 3px 0 #059669; }
  .tfk-lead-identity { min-width: 0; }
  .tfk-lead-identity h3 { margin: 3px 0 0; font-size: 14px; overflow-wrap: anywhere; }
  .tfk-lead-identity p, .tfk-lead-contact span, .tfk-lead-value span { margin: 3px 0 0; color: #587067; font-size: 11px; overflow-wrap: anywhere; }
  .tfk-lead-contact, .tfk-lead-value { display: grid; gap: 2px; min-width: 0; }
  .tfk-lead-message-actions { display: flex; gap: 5px; margin-top: 5px; flex-wrap: wrap; }
  .tfk-lead-message-actions button { border: 1px solid rgba(5,150,105,.25); border-radius: 5px; padding: 5px 7px; background: #f0fdf4; color: #047857; display: inline-flex; gap: 4px; align-items: center; font: inherit; font-size: 10px; font-weight: 800; cursor: pointer; }
  .tfk-lead-message-actions button:disabled { opacity: .45; cursor: not-allowed; }
  .tfk-lead-value strong { font-size: 13px; }
  .tfk-lead-urgency { display: inline-block; width: fit-content; font-size: 9px; font-weight: 900; text-transform: uppercase; border-radius: 999px; padding: 2px 6px; background: #e8f5ed; color: #047857; }
  .tfk-lead-urgency-urgent { color: #a16207; background: #fef3c7; }
  .tfk-lead-urgency-emergency { color: #b91c1c; background: #fee2e2; }
  .tfk-lead-delete { display: flex; gap: 5px; justify-content: flex-end; }
  .tfk-lead-delete button { border: 1px solid rgba(22,101,52,.16); background: white; color: #587067; border-radius: 5px; padding: 7px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
  .tfk-lead-delete .tfk-danger { color: #b91c1c; border-color: rgba(220,38,38,.3); font-weight: 800; }
  .tfk-lead-delete .tfk-convert { color:#047857; border-color:rgba(5,150,105,.28); font-weight:800; gap:4px; white-space:nowrap; }
  .tfk-lead-delete .tfk-converted-link { display:inline-flex; align-items:center; gap:4px; color:#047857; font-size:12px; font-weight:800; text-decoration:none; padding:6px; }
  .tfk-lead-read-only-label { color: #789189; font-size: 11px; font-weight: 800; }
  .tfk-lead-state { border: 1px dashed rgba(22,101,52,.24); border-radius: 7px; min-height: 90px; display: flex; align-items: center; justify-content: center; gap: 10px; color: #587067; font-size: 13px; text-align: left; }
  .tfk-lead-state > div { display: grid; gap: 3px; }
  .tfk-lead-state strong { color: #10231d; }
  .tfk-lead-state span { display: block; }
  .tfk-spin { animation: tfk-spin 1s linear infinite; }
  @keyframes tfk-spin { to { transform: rotate(360deg); } }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
  @media (max-width: 960px) {
    .tfk-lead-heading { grid-template-columns: 1fr; }
    .tfk-lead-metrics { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .tfk-lead-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .tfk-lead-delete { grid-column: 2; grid-row: 1; }
  }
  @media (max-width: 700px) {
    .tfk-lead-form { grid-template-columns: 1fr; }
    .tfk-lead-form-wide { grid-column: auto; }
    .tfk-lead-form-title { align-items: flex-start; flex-wrap: wrap; }
    .tfk-lead-form-title span { width: 100%; margin-left: 25px; }
    .tfk-lead-toolbar { grid-template-columns: 1fr; }
    .tfk-lead-row { grid-template-columns: minmax(0, 1fr) auto; }
    .tfk-lead-contact { grid-column: 1 / -1; }
    .tfk-lead-value { grid-column: 1; }
    .tfk-lead-status { grid-column: 1; }
    .tfk-lead-delete { grid-column: 2; grid-row: 1 / span 3; align-self: center; flex-direction: column; }
  }
  @media (max-width: 480px) {
    .tfk-lead-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
`;

