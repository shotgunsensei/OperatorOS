'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Activity, AlertTriangle, Archive, BookOpen, Building2, CheckCircle2,
  Clock3, FileUp, Filter, Inbox, PackageCheck, Plus, RefreshCw, Search,
  Settings, ShieldAlert, Tag, UsersRound, Wrench,
} from 'lucide-react';
import {
  moduleShellApi,
  type DirectoryContact,
  type DirectoryOrganization,
  type DirectorySite,
  type PulseDeskAssignee,
  type PulseDeskServiceConfiguration,
  type PulseDeskServiceDashboard,
  type PulseDeskServiceTicket,
  type PulseDeskServiceTicketDetail,
} from '@/lib/auth';

const PHI_WARNING = 'Operational information only. Do not enter patient names, MRNs, dates of birth, diagnoses, insurance details, treatment information, or clinical notes.';
export type PulseDeskServiceView = 'dashboard' | 'tickets' | 'operations' | 'knowledge' | 'admin';

function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const candidate = error as { message?: unknown; error?: unknown; code?: unknown };
    if (typeof candidate.error === 'string') return `${candidate.error}${candidate.code ? ` (${String(candidate.code)})` : ''}`;
    if (typeof candidate.message === 'string') return candidate.message;
  }
  return fallback;
}

let idempotencySequence = 0;
function idempotencyKey(prefix: string): string {
  idempotencySequence += 1;
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${idempotencySequence}`;
  return `pulsedesk:${prefix}:${id}`;
}

function formatDate(value: unknown): string {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : '—';
}

async function base64File(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 32_768));
  }
  return btoa(binary);
}

export default function PulseDeskServiceDeskWorkspace({ tenantKey, canManageModule, view, requestHref }: { tenantKey: string; canManageModule: boolean; view: PulseDeskServiceView; requestHref: (id: string) => string }) {
  const [dashboard, setDashboard] = useState<PulseDeskServiceDashboard | null>(null);
  const [configuration, setConfiguration] = useState<PulseDeskServiceConfiguration | null>(null);
  const [tickets, setTickets] = useState<PulseDeskServiceTicket[]>([]);
  const [ticketTotal, setTicketTotal] = useState(0);
  const [detail, setDetail] = useState<PulseDeskServiceTicketDetail | null>(null);
  const [assets, setAssets] = useState<Array<Record<string, any>>>([]);
  const [supplyRequests, setSupplyRequests] = useState<Array<Record<string, any>>>([]);
  const [facilityRequests, setFacilityRequests] = useState<Array<Record<string, any>>>([]);
  const [knowledge, setKnowledge] = useState<Array<Record<string, any>>>([]);
  const [savedViews, setSavedViews] = useState<Array<Record<string, any>>>([]);
  const [assignees, setAssignees] = useState<PulseDeskAssignee[]>([]);
  const [clients, setClients] = useState<DirectoryOrganization[]>([]);
  const [sites, setSites] = useState<DirectorySite[]>([]);
  const [contacts, setContacts] = useState<DirectoryContact[]>([]);
  const [vendors, setVendors] = useState<DirectoryOrganization[]>([]);
  const [preferences, setPreferences] = useState<Record<string, any> | null>(null);
  const [attachments, setAttachments] = useState<Array<Record<string, unknown>>>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [requestedAssetId, setRequestedAssetId] = useState('');
  const [assetIssueDeepLink, setAssetIssueDeepLink] = useState(false);
  const [filters, setFilters] = useState({ search: '', status: '', priority: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: '100', sort: 'updatedAt', direction: 'desc' });
    if (filters.search) params.set('search', filters.search);
    if (filters.status) params.set('status', filters.status);
    if (filters.priority) params.set('priority', filters.priority);
    return params.toString();
  }, [filters]);

  const loadTicket = useCallback(async (id: string) => {
    setBusy('ticket-detail'); setError('');
    try {
      const next = await moduleShellApi.pulsedesk.getServiceTicket(id);
      setDetail(next);
      const requesterFiles = await moduleShellApi.pulsedesk.listTicketAttachments(id, 'requester');
      const internalFiles = next.capabilities.canViewInternal
        ? await moduleShellApi.pulsedesk.listTicketAttachments(id, 'internal')
        : [];
      setAttachments([...requesterFiles.map(file => ({ ...file, visibility: 'requester' })), ...internalFiles.map(file => ({ ...file, visibility: 'internal' }))]);
    } catch (nextError) { setError(errorMessage(nextError, 'Could not load the selected ticket.')); }
    finally { setBusy(''); }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const tasks: Array<Promise<void>> = [];
      const apply = <T,>(request: Promise<T>, update: (value: T) => void) => request.then(update);
      if (view === 'dashboard') {
        tasks.push(apply(moduleShellApi.pulsedesk.getServiceDeskDashboard(), setDashboard));
        tasks.push(apply(moduleShellApi.pulsedesk.listServiceTickets(query), ticketData => {
          setTickets(ticketData.tickets); setTicketTotal(ticketData.pagination.total);
        }));
      }
      if (view === 'tickets' || view === 'operations') {
        tasks.push(apply(moduleShellApi.pulsedesk.listServiceTickets(query), ticketData => {
          setTickets(ticketData.tickets); setTicketTotal(ticketData.pagination.total);
          setSelected(current => new Set([...current].filter(id => ticketData.tickets.some(ticket => ticket.id === id))));
          if (detail && !ticketData.tickets.some(ticket => ticket.id === detail.ticket.id)) { setDetail(null); setAttachments([]); }
        }));
        tasks.push(apply(moduleShellApi.pulsedesk.getServiceConfiguration(), setConfiguration));
        tasks.push(apply(moduleShellApi.pulsedesk.listServiceAssets(), value => setAssets(value.assets)));
        tasks.push(apply(moduleShellApi.pulsedesk.listServiceClients(), value => setClients(value.organizations.filter(row => row.type !== 'vendor'))));
        tasks.push(apply(moduleShellApi.pulsedesk.listServiceFacilities(), value => setSites(value.sites)));
      }
      if (view === 'tickets') {
        tasks.push(apply(moduleShellApi.pulsedesk.listSavedViews(), value => setSavedViews(value.savedViews)));
        tasks.push(apply(moduleShellApi.pulsedesk.listAssignees().catch(() => ({ assignees: [], capabilities: { canManageWorkflow: false } })), value => setAssignees(value.assignees)));
        tasks.push(apply(moduleShellApi.pulsedesk.listServiceContacts(), value => setContacts(value.contacts)));
        tasks.push(apply(moduleShellApi.pulsedesk.listServiceClients('vendor'), value => setVendors(value.organizations)));
      }
      if (view === 'operations') {
        tasks.push(apply(moduleShellApi.pulsedesk.listSupplyRequests(), value => setSupplyRequests(value.supplyRequests)));
        tasks.push(apply(moduleShellApi.pulsedesk.listFacilityRequests(), value => setFacilityRequests(value.facilityRequests)));
      }
      if (view === 'knowledge') tasks.push(apply(moduleShellApi.pulsedesk.listKnowledge(), value => setKnowledge(value.articles)));
      if (view === 'admin') {
        tasks.push(apply(moduleShellApi.pulsedesk.getServiceConfiguration(), setConfiguration));
        tasks.push(apply(moduleShellApi.pulsedesk.getNotificationPreferences(), setPreferences));
      }
      await Promise.all(tasks);
    } catch (nextError) { setError(errorMessage(nextError, 'Could not load the PulseDesk service desk.')); }
    finally { setLoading(false); }
  }, [detail, query, view]);

  useEffect(() => { void loadAll(); }, [tenantKey, query]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const path = window.location.pathname;
    const ticketMatch = path.match(/\/(?:tickets|requests)\/([a-z0-9-]+)\/?$/);
    const assetIssueMatch = path.match(/\/assets\/([a-z0-9-]+)\/report-issue\/?$/);
    if (/\/(tickets|requests|submit)(\/|$)/.test(path) || assetIssueMatch) {
      setRequestedAssetId(assetIssueMatch?.[1] ?? '');
      setAssetIssueDeepLink(Boolean(assetIssueMatch));
      if (ticketMatch?.[1]) void loadTicket(ticketMatch[1]);
    }
  }, [loadTicket, view]);

  async function mutate(label: string, operation: () => Promise<unknown>, options: { detailId?: string; reset?: HTMLFormElement } = {}) {
    setBusy(label); setError(''); setNotice('');
    try {
      await operation();
      options.reset?.reset();
      setNotice(`${label} completed.`);
      await loadAll();
      if (options.detailId) await loadTicket(options.detailId);
    } catch (nextError) { setError(errorMessage(nextError, `${label} failed.`)); }
    finally { setBusy(''); }
  }

  async function createTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    await mutate('Ticket creation', () => moduleShellApi.pulsedesk.createServiceTicket({
      summary: data.get('summary'), description: data.get('description'), category: data.get('category'),
      priority: data.get('priority'), ticketTypeKey: data.get('ticketTypeKey'), locationLabel: data.get('locationLabel'),
      directoryOrganizationId: data.get('directoryOrganizationId') || null, directorySiteId: data.get('directorySiteId') || null,
      requesterContactId: data.get('requesterContactId') || null, departmentId: data.get('departmentId') || null,
      assetId: data.get('assetId') || null, queueId: data.get('queueId') || null, teamId: data.get('teamId') || null,
      slaPolicyId: data.get('slaPolicyId') || null,
      isPatientImpacting: data.get('isPatientImpacting') === 'on', phiAcknowledged: data.get('phiAcknowledged') === 'on',
    }), { reset: form });
  }

  async function updateTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!detail) return; const form = event.currentTarget; const data = new FormData(form);
    await mutate('Ticket update', () => moduleShellApi.pulsedesk.updateServiceTicket(detail.ticket.id, {
      expectedVersion: detail.ticket.version,
      summary: data.get('summary'), description: data.get('description'), priority: data.get('priority'),
      category: data.get('category'), ticketTypeKey: data.get('ticketTypeKey'), locationLabel: data.get('locationLabel'),
      phiAcknowledged: true,
    }), { detailId: detail.ticket.id });
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>, visibility: 'requester' | 'internal') {
    event.preventDefault(); if (!detail) return; const form = event.currentTarget; const data = new FormData(form); const body = String(data.get('body') ?? '');
    await mutate(visibility === 'internal' ? 'Internal note' : 'Requester reply', () => visibility === 'internal'
      ? moduleShellApi.pulsedesk.addTicketInternalNote(detail.ticket.id, body, idempotencyKey('note'))
      : moduleShellApi.pulsedesk.addTicketReply(detail.ticket.id, body, idempotencyKey('reply')), { detailId: detail.ticket.id, reset: form });
  }

  async function logTime(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!detail) return; const form = event.currentTarget; const data = new FormData(form);
    await mutate('Time entry', () => moduleShellApi.pulsedesk.addTicketTime(detail.ticket.id, { minutes: Number(data.get('minutes')), workType: String(data.get('workType')), description: String(data.get('description') ?? '') }, idempotencyKey('time')), { detailId: detail.ticket.id, reset: form });
  }

  async function assignTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!detail) return; const data = new FormData(event.currentTarget);
    await mutate('Ticket assignment', () => moduleShellApi.pulsedesk.assignServiceTicket(detail.ticket.id, { expectedVersion: detail.ticket.version, assignedToUserId: data.get('assignedToUserId') || null, queueId: data.get('queueId') || null, teamId: data.get('teamId') || null }), { detailId: detail.ticket.id });
  }

  async function transition(action: string) {
    if (!detail) return;
    await mutate(`Ticket ${action}`, () => moduleShellApi.pulsedesk.transitionServiceTicket(detail.ticket.id, action, detail.ticket.version), { detailId: detail.ticket.id });
  }

  async function uploadAttachment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!detail) return; const form = event.currentTarget; const data = new FormData(form); const file = data.get('file');
    if (!(file instanceof File) || !file.size) { setError('Choose a file to upload.'); return; }
    await mutate('Attachment upload', async () => moduleShellApi.pulsedesk.uploadTicketAttachment(detail.ticket.id, { originalName: file.name, declaredMimeType: file.type, contentBase64: await base64File(file), visibility: data.get('visibility') === 'internal' ? 'internal' : 'requester' }), { detailId: detail.ticket.id, reset: form });
  }

  async function createAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    await mutate('Asset creation', () => moduleShellApi.pulsedesk.createServiceAsset({
      assetTag: data.get('assetTag'), name: data.get('name'), equipmentType: data.get('equipmentType'), status: data.get('status'),
      directoryOrganizationId: data.get('directoryOrganizationId') || null, directorySiteId: data.get('directorySiteId') || null,
      departmentId: data.get('departmentId') || null,
    }), { reset: form });
  }

  async function createSupply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    await mutate('Supply request', () => moduleShellApi.pulsedesk.createSupplyRequest({ itemName: data.get('itemName'), quantity: Number(data.get('quantity')), urgency: data.get('urgency'), departmentId: data.get('departmentId') || null, ticketId: data.get('ticketId') || null }), { reset: form });
  }

  async function createFacility(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    await mutate('Facility request', () => moduleShellApi.pulsedesk.createFacilityRequest({ title: data.get('title'), requestType: data.get('requestType'), priority: data.get('priority'), locationLabel: data.get('locationLabel'), directorySiteId: data.get('directorySiteId') || null, departmentId: data.get('departmentId') || null, ticketId: data.get('ticketId') || null }), { reset: form });
  }

  async function createKnowledge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    await mutate('Knowledge article', () => moduleShellApi.pulsedesk.createKnowledge({ title: data.get('title'), body: data.get('body'), summary: data.get('summary'), visibility: data.get('visibility'), status: data.get('status') }), { reset: form });
  }

  async function createQueue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    await mutate('Queue creation', () => moduleShellApi.pulsedesk.createServiceQueue({ name: String(data.get('name')), description: String(data.get('description') ?? '') }), { reset: form });
  }

  async function createSla(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    await mutate('SLA policy creation', () => moduleShellApi.pulsedesk.createSlaPolicy({ name: data.get('name'), responseMinutes: Number(data.get('responseMinutes')), resolutionMinutes: Number(data.get('resolutionMinutes')), atRiskPercent: Number(data.get('atRiskPercent')), defaultPolicy: data.get('defaultPolicy') === 'on' }), { reset: form });
  }

  async function createSavedView(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    await mutate('Saved view', () => moduleShellApi.pulsedesk.createSavedView({ name: data.get('name'), filters: Object.fromEntries(Object.entries(filters).filter(([, value]) => value)), sort: { field: 'updatedAt', direction: 'desc' }, shared: data.get('shared') === 'on' }), { reset: form });
  }

  async function bulkAction(action: 'archive' | 'status', toStatus?: string) {
    const rows = tickets.filter(ticket => selected.has(ticket.id)).map(ticket => ({ id: ticket.id, expectedVersion: ticket.version }));
    if (!rows.length) { setError('Select at least one ticket.'); return; }
    await mutate(`Bulk ${action}`, () => moduleShellApi.pulsedesk.bulkServiceTickets({ action, tickets: rows, ...(toStatus ? { toStatus } : {}) }));
    setSelected(new Set());
  }

  if (loading) return <div className="pds-loading" data-testid="pulsedesk-service-desk-loading"><RefreshCw className="pds-spin" size={18} /> Loading this PulseDesk route…<style>{css}</style></div>;

  return (
    <section className="pds" data-testid="pulsedesk-service-desk-workspace">
      <style>{css}</style>
      <div className="pds-warning" data-testid="pulsedesk-service-desk-phi-warning"><ShieldAlert size={18} /><div><strong>No patient data / no unnecessary PHI.</strong><span>{PHI_WARNING}</span></div></div>
      <div className="pds-toolbar">
        <h2 className="pds-route-label">{view.replaceAll('_', ' ')}</h2>
        <button type="button" className="pds-secondary" onClick={() => void loadAll()} disabled={loading || Boolean(busy)}><RefreshCw size={14} /> Refresh</button>
      </div>
      {error && <div className="pds-error" role="alert" data-testid="pulsedesk-service-error"><AlertTriangle size={16} />{error}</div>}
      {notice && <div className="pds-success" role="status"><CheckCircle2 size={16} />{notice}</div>}

      {view === 'dashboard' && dashboard && <Dashboard dashboard={dashboard} tickets={tickets} requestHref={requestHref} />}

      {view === 'tickets' && <div className="pds-ticket-layout">
        <div className="pds-stack">
          <form className="pds-card pds-form" onSubmit={createTicket} data-testid="pulsedesk-service-ticket-create">
            <Heading icon={Plus} title="New operational ticket" subtitle="Ticket number, due targets, status history, and activity tracking are added automatically." />
            <input name="summary" minLength={5} maxLength={160} required aria-label="Operational request summary" placeholder="Short operational summary" />
            <textarea name="description" maxLength={10000} aria-label="Operational request context" placeholder="Operational context only (optional)" />
            <div className="pds-grid-3">
              <select name="ticketTypeKey" aria-label="Request type" defaultValue="service_request"><option value="service_request">Service request</option><option value="incident">Incident</option><option value="problem">Problem</option><option value="maintenance">Maintenance</option><option value="supply">Supply</option><option value="facility">Facility</option></select>
              <select name="category" aria-label="Request category" defaultValue="other">{(configuration?.defaults.categories ?? ['other']).map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select>
              <select name="priority" aria-label="Request priority" defaultValue="normal">{(configuration?.defaults.priorities ?? ['normal']).map(value => <option key={value} value={value}>{value}</option>)}</select>
            </div>
            <div className="pds-grid-3"><select name="directoryOrganizationId" aria-label="Service client" defaultValue=""><option value="">No service client</option>{clients.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select><select name="directorySiteId" aria-label="Facility" defaultValue=""><option value="">No facility</option>{sites.map(row => <option key={row.id} value={row.id}>{row.organization?.name ? `${row.organization.name} · ` : ''}{row.name}</option>)}</select><select name="requesterContactId" aria-label="Requester contact" defaultValue=""><option value="">No requester contact</option>{contacts.map(row => <option key={row.id} value={row.id}>{row.firstName} {row.lastName}</option>)}</select></div>
            {assetIssueDeepLink && <div className="pds-route-context" role="status">Reporting an issue for the equipment selected by this deep link. Confirm the equipment and enter only PHI-minimized operational details.</div>}
            <div className="pds-grid-3"><input name="locationLabel" maxLength={120} aria-label="Operational location" placeholder="Operational location" /><select name="departmentId" aria-label="Department" defaultValue=""><option value="">No department</option>{configuration?.departments.filter(row => row.active).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select><select name="assetId" aria-label="Operational equipment" value={requestedAssetId} onChange={event => setRequestedAssetId(event.target.value)}><option value="">No equipment</option>{assets.map(row => <option key={String(row.id)} value={String(row.id)}>{String(row.assetTag)} · {String(row.name)}</option>)}</select></div>
            <div className="pds-grid-3"><select name="queueId" aria-label="Service queue" defaultValue=""><option value="">Unqueued</option>{configuration?.queues.filter(row => row.active).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select><select name="teamId" aria-label="Assigned team" defaultValue=""><option value="">No team</option>{configuration?.teams.filter(row => row.active).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select><select name="slaPolicyId" aria-label="SLA policy" defaultValue=""><option value="">Default/no SLA</option>{configuration?.slaPolicies.filter(row => row.active).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
            <label className="pds-check"><input type="checkbox" name="isPatientImpacting" /> Patient-care operations impacted (no patient details)</label>
            <label className="pds-ack"><input type="checkbox" name="phiAcknowledged" required /> I confirm this contains operational information only and no patient data or unnecessary PHI.</label>
            <button disabled={Boolean(busy)}><Plus size={14} /> Create ticket</button>
          </form>

          <section className="pds-card">
            <Heading icon={Inbox} title={`Ticket queue (${ticketTotal})`} subtitle="Find, filter, sort, save views, and update operational work from one queue." />
            <div className="pds-filters"><Search size={15} /><input aria-label="Search requests" value={filters.search} onChange={event => setFilters(current => ({ ...current, search: event.target.value }))} placeholder="Search summary or location" /><select aria-label="Filter requests by status" value={filters.status} onChange={event => setFilters(current => ({ ...current, status: event.target.value }))}><option value="">All statuses</option>{configuration?.defaults.statuses.map(value => <option key={value}>{value}</option>)}</select><select aria-label="Filter requests by priority" value={filters.priority} onChange={event => setFilters(current => ({ ...current, priority: event.target.value }))}><option value="">All priorities</option>{configuration?.defaults.priorities.map(value => <option key={value}>{value}</option>)}</select></div>
            {canManageModule && <div className="pds-bulk"><button type="button" className="pds-secondary" onClick={() => void bulkAction('status', 'triage')}><Filter size={13} /> Move selected to triage</button><button type="button" className="pds-danger" onClick={() => void bulkAction('archive')}><Archive size={13} /> Archive selected</button></div>}
            <div className="pds-list">{tickets.length ? tickets.map(ticket => <article key={ticket.id} className={`pds-ticket${detail?.ticket.id === ticket.id ? ' selected' : ''}`}>
              {canManageModule && <input type="checkbox" checked={selected.has(ticket.id)} onChange={() => setSelected(current => { const next = new Set(current); next.has(ticket.id) ? next.delete(ticket.id) : next.add(ticket.id); return next; })} aria-label={`Select ${ticket.humanId}`} />}
              <button type="button" onClick={() => void loadTicket(ticket.id)}><span><strong>{ticket.humanId}</strong> {ticket.summary}</span><small>{ticket.status.replaceAll('_', ' ')} · {ticket.priority} · SLA {ticket.sla.state.replaceAll('_', ' ')}</small></button>
            </article>) : <Empty text="No tickets match the current filters." />}</div>
            <form className="pds-inline" onSubmit={createSavedView}><input name="name" required maxLength={100} aria-label="Saved view name" placeholder="Save current filters as…" /><label className="pds-check"><input type="checkbox" name="shared" disabled={!canManageModule} /> Shared</label><button type="submit">Save view</button></form>
            {savedViews.length > 0 && <div className="pds-chips">{savedViews.map(view => <span key={String(view.id)}>{String(view.name)}</span>)}</div>}
          </section>
        </div>
        <TicketDetail detail={detail} busy={busy} attachments={attachments} configuration={configuration} assignees={assignees} vendors={vendors} onUpdate={event => void updateTicket(event)} onReply={(event, visibility) => void sendMessage(event, visibility)} onTime={event => void logTime(event)} onAssign={event => void assignTicket(event)} onTransition={action => void transition(action)} onEvaluate={() => detail && void mutate('SLA evaluation', () => moduleShellApi.pulsedesk.evaluateServiceTicketSla(detail.ticket.id), { detailId: detail.ticket.id })} onUpload={event => void uploadAttachment(event)} onVendor={event => {
          event.preventDefault(); if (!detail) return; const form = event.currentTarget; const data = new FormData(form); void mutate('Vendor coordination', () => moduleShellApi.pulsedesk.addVendorEngagement(detail.ticket.id, { vendorOrganizationId: data.get('vendorOrganizationId'), status: data.get('status'), referenceCode: data.get('referenceCode') }), { detailId: detail.ticket.id, reset: form });
        }} />
      </div>}

      {view === 'operations' && <div className="pds-ops-grid">
        <OperationCard icon={Activity} title="Operational equipment" count={assets.length} form={<form className="pds-form" onSubmit={createAsset}><input name="assetTag" required aria-label="Asset tag" placeholder="Asset tag" /><input name="name" required aria-label="Equipment name" placeholder="Equipment name" /><input name="equipmentType" required aria-label="Equipment type" defaultValue="operational_equipment" /><select name="status" aria-label="Equipment status"><option>active</option><option>maintenance</option><option>out_of_service</option><option>retired</option></select><select name="directoryOrganizationId" aria-label="Equipment service client" defaultValue=""><option value="">No service client</option>{clients.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select><select name="directorySiteId" aria-label="Equipment facility" defaultValue=""><option value="">No facility</option>{sites.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select><select name="departmentId" aria-label="Equipment department" defaultValue=""><option value="">No department</option>{configuration?.departments.filter(row => row.active).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select><button type="submit"><Plus size={13} /> Add equipment</button></form>} rows={assets.map(row => ({ id: String(row.id), title: `${row.assetTag} · ${row.name}`, meta: `${row.equipmentType} · ${row.status}` }))} />
        <OperationCard icon={PackageCheck} title="Supply requests" count={supplyRequests.length} form={<form className="pds-form" onSubmit={createSupply}><input name="itemName" required aria-label="Supply item" placeholder="Supply item" /><input name="quantity" type="number" min={1} max={100000} defaultValue={1} aria-label="Supply quantity" /><select name="urgency" aria-label="Supply urgency"><option>normal</option><option>high</option><option>critical</option><option>low</option></select><select name="departmentId" aria-label="Supply department" defaultValue=""><option value="">No department</option>{configuration?.departments.filter(row => row.active).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select><select name="ticketId" aria-label="Linked supply request ticket" defaultValue=""><option value="">No linked ticket</option>{tickets.map(row => <option key={row.id} value={row.id}>{row.humanId} · {row.summary}</option>)}</select><button type="submit"><Plus size={13} /> Request supply</button></form>} rows={supplyRequests.map(row => ({ id: String(row.id), title: `${row.quantity} × ${row.itemName}`, meta: `${row.status} · ${row.urgency}` }))} />
        <OperationCard icon={Wrench} title="Facility requests" count={facilityRequests.length} form={<form className="pds-form" onSubmit={createFacility}><input name="title" required aria-label="Facility need" placeholder="Facility need" /><input name="requestType" required aria-label="Facility request type" defaultValue="maintenance" /><input name="locationLabel" aria-label="Facility request location" placeholder="Location" /><select name="priority" aria-label="Facility request priority"><option>normal</option><option>high</option><option>critical</option><option>low</option></select><select name="directorySiteId" aria-label="Facility site" defaultValue=""><option value="">No facility</option>{sites.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select><select name="departmentId" aria-label="Facility department" defaultValue=""><option value="">No department</option>{configuration?.departments.filter(row => row.active).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select><select name="ticketId" aria-label="Linked facility request ticket" defaultValue=""><option value="">No linked ticket</option>{tickets.map(row => <option key={row.id} value={row.id}>{row.humanId} · {row.summary}</option>)}</select><button type="submit"><Plus size={13} /> Create facility request</button></form>} rows={facilityRequests.map(row => ({ id: String(row.id), title: String(row.title), meta: `${row.requestType} · ${row.status}` }))} />
      </div>}

      {view === 'knowledge' && <div className="pds-two"><section className="pds-card"><Heading icon={BookOpen} title="Operational knowledge" subtitle="Published requester guidance and internal service procedures are plain text and PHI-minimized." />{knowledge.length ? knowledge.map(article => <article className="pds-row" key={String(article.id)}><strong>{String(article.title)}</strong><small>{String(article.status)} · {String(article.visibility)}</small><p>{String(article.summary ?? '')}</p></article>) : <Empty text="No visible knowledge articles." />}</section>{canManageModule && <form className="pds-card pds-form" onSubmit={createKnowledge}><Heading icon={Plus} title="Author knowledge" subtitle={PHI_WARNING} /><input name="title" required aria-label="Knowledge article title" placeholder="Article title" /><input name="summary" aria-label="Knowledge article summary" placeholder="Summary" /><textarea name="body" required aria-label="Operational procedure" placeholder="Operational procedure in plain text" /><select name="visibility" aria-label="Knowledge visibility"><option value="internal">Internal</option><option value="requester">Requester-visible</option></select><select name="status" aria-label="Knowledge status"><option value="draft">Draft</option><option value="published">Published</option></select><button type="submit">Save article</button></form>}</div>}

      {view === 'admin' && <div className="pds-two">
        <section className="pds-card"><Heading icon={Settings} title="Workflow configuration" subtitle="Manage queues, teams, lifecycle labels, SLA policies, and notification preferences." /><ConfigRows configuration={configuration} />
          {preferences && <label className="pds-toggle"><input type="checkbox" checked={preferences.inAppEnabled !== false} onChange={event => void mutate('Notification preference update', async () => setPreferences(await moduleShellApi.pulsedesk.saveNotificationPreferences({ expectedVersion: preferences.version, inAppEnabled: event.target.checked, emailEnabled: Boolean(preferences.emailEnabled), eventPreferences: preferences.eventPreferences ?? {} })))} /> In-app ticket notifications</label>}
        </section>
        {canManageModule ? <section className="pds-stack"><form className="pds-card pds-form" onSubmit={createQueue}><Heading icon={UsersRound} title="Add queue" subtitle="Route incoming operational work to the right team." /><input name="name" required aria-label="Queue name" placeholder="Queue name" /><textarea name="description" aria-label="Queue purpose" placeholder="Queue purpose" /><button type="submit">Add queue</button></form><form className="pds-card pds-form" onSubmit={createSla}><Heading icon={Clock3} title="Add SLA policy" subtitle="Set elapsed-time response and resolution targets for your teams." /><input name="name" required aria-label="SLA policy name" placeholder="Policy name" /><div className="pds-grid-3"><input name="responseMinutes" aria-label="Response minutes" type="number" min={1} defaultValue={60} /><input name="resolutionMinutes" aria-label="Resolution minutes" type="number" min={1} defaultValue={480} /><input name="atRiskPercent" aria-label="At risk percent" type="number" min={1} max={99} defaultValue={80} /></div><label className="pds-check"><input type="checkbox" name="defaultPolicy" /> Workspace default</label><button type="submit">Add policy</button></form></section> : <section className="pds-card"><Empty text="Ask a workspace manager for access to these settings." /></section>}
      </div>}
    </section>
  );
}

function Heading({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle: string }) { return <header className="pds-heading"><Icon size={18} /><div><h3>{title}</h3><p>{subtitle}</p></div></header>; }
function Empty({ text }: { text: string }) { return <div className="pds-empty">{text}</div>; }
function Dashboard({ dashboard, tickets, requestHref }: { dashboard: PulseDeskServiceDashboard; tickets: PulseDeskServiceTicket[]; requestHref: (id: string) => string }) {
  const metrics = [['Open tickets', dashboard.metrics.openTickets], ['At risk', dashboard.metrics.atRisk], ['Overdue', dashboard.metrics.overdue], ['Operational equipment', dashboard.metrics.operationalAssets], ['Pending supplies', dashboard.metrics.pendingSupplyRequests], ['Facility requests', dashboard.metrics.openFacilityRequests], ['Time logged', `${dashboard.metrics.timeMinutes} min`]];
  return <div className="pds-stack"><div className="pds-metrics">{metrics.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div><section className="pds-card"><Heading icon={Activity} title="Current operational work" subtitle={`Updated ${formatDate(dashboard.generatedAt)}.`} />{tickets.slice(0, 8).map(ticket => <a className="pds-row-button" key={ticket.id} href={requestHref(ticket.id)}><span><strong>{ticket.humanId}</strong> {ticket.summary}</span><small>{ticket.status} · {ticket.priority} · SLA {ticket.sla.state}</small></a>)}</section></div>;
}

function TicketDetail({ detail, busy, attachments, configuration, assignees, vendors, onUpdate, onReply, onTime, onAssign, onTransition, onEvaluate, onUpload, onVendor }: {
  detail: PulseDeskServiceTicketDetail | null; busy: string; attachments: Array<Record<string, unknown>>; configuration: PulseDeskServiceConfiguration | null; assignees: PulseDeskAssignee[]; vendors: DirectoryOrganization[];
  onUpdate: (event: FormEvent<HTMLFormElement>) => void; onReply: (event: FormEvent<HTMLFormElement>, visibility: 'requester' | 'internal') => void; onTime: (event: FormEvent<HTMLFormElement>) => void; onAssign: (event: FormEvent<HTMLFormElement>) => void; onTransition: (action: string) => void; onEvaluate: () => void; onUpload: (event: FormEvent<HTMLFormElement>) => void; onVendor: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!detail) return <aside className="pds-card pds-detail"><Empty text="Select a ticket to view its details, history, and next actions." /></aside>;
  const { ticket } = detail;
  return <aside className="pds-card pds-detail" data-testid="pulsedesk-ticket-workspace"><Heading icon={Inbox} title={`${ticket.humanId} · ${ticket.summary}`} subtitle={`${ticket.status.replaceAll('_', ' ')} · ${ticket.priority} · SLA ${ticket.sla.state.replaceAll('_', ' ')}`} /><p className="pds-description">{ticket.description || 'No additional operational description.'}</p><div className="pds-chips"><span>Created {formatDate(ticket.createdAt)}</span><span>Response due {formatDate(ticket.responseDueAt)}</span><span>Resolution due {formatDate(ticket.resolutionDueAt)}</span><span>Version {ticket.version}</span></div>
    {detail.capabilities.canViewInternal && <form key={`${ticket.id}-${ticket.version}`} className="pds-form" onSubmit={onUpdate}><h4>Edit operational ticket</h4><input name="summary" aria-label="Updated request summary" required minLength={5} maxLength={160} defaultValue={ticket.summary} /><textarea name="description" aria-label="Updated operational context" maxLength={10000} defaultValue={ticket.description} /><div className="pds-grid-3"><select name="priority" aria-label="Updated priority" defaultValue={ticket.priority}>{configuration?.defaults.priorities.map(value => <option key={value}>{value}</option>)}</select><select name="category" aria-label="Updated category" defaultValue={ticket.category}>{configuration?.defaults.categories.map(value => <option key={value}>{value}</option>)}</select><select name="ticketTypeKey" aria-label="Updated request type" defaultValue={ticket.ticketTypeKey}>{configuration?.defaults.types.map(value => <option key={value}>{value}</option>)}</select></div><input name="locationLabel" aria-label="Updated operational location" maxLength={120} defaultValue={ticket.locationLabel ?? ''} placeholder="Operational location" /><label className="pds-ack">{PHI_WARNING}</label><button disabled={Boolean(busy)}>Save ticket changes</button></form>}
    {detail.capabilities.canManage && <form className="pds-inline" onSubmit={onAssign}><select name="assignedToUserId" aria-label="Assigned operator" defaultValue={ticket.assignedToUserId ?? ''}><option value="">Unassigned</option>{assignees.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select><select name="queueId" aria-label="Assigned queue" defaultValue={ticket.queueId ?? ''}><option value="">No queue</option>{configuration?.queues.filter(row => row.active).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select><select name="teamId" aria-label="Assigned team" defaultValue={ticket.teamId ?? ''}><option value="">No team</option>{configuration?.teams.filter(row => row.active).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select><button disabled={Boolean(busy)}>Assign</button></form>}
    {detail.capabilities.canViewInternal && <div className="pds-actions"><button type="button" className="pds-secondary" onClick={onEvaluate}>Evaluate SLA</button>{ticket.status !== 'resolved' && ticket.status !== 'closed' && <button type="button" onClick={() => onTransition('resolve')}>Resolve</button>}{ticket.status === 'resolved' && <button type="button" onClick={() => onTransition('close')}>Close</button>}{(ticket.status === 'resolved' || ticket.status === 'closed') && <button type="button" onClick={() => onTransition('reopen')}>Reopen</button>}{detail.capabilities.canManage && !ticket.archivedAt && <button type="button" className="pds-danger" onClick={() => onTransition('archive')}>Archive</button>}</div>}
    <section><h4>Conversation and internal work</h4>{detail.messages.length ? detail.messages.map(message => <article key={message.id} className={`pds-message ${message.visibility}`}><strong>{message.visibility === 'internal' ? 'Internal note' : 'Requester-visible reply'}</strong><p>{message.body}</p><small>{formatDate(message.createdAt)}</small></article>) : <Empty text="No replies or internal notes yet." />}</section>
    <form className="pds-form" onSubmit={event => onReply(event, 'requester')}><textarea name="body" required aria-label="Requester-visible operational reply" placeholder="Requester-visible operational reply" /><label className="pds-ack">{PHI_WARNING}</label><button type="submit">Add requester-visible reply</button></form>
    {detail.capabilities.canViewInternal && <><form className="pds-form" onSubmit={event => onReply(event, 'internal')}><textarea name="body" required aria-label="Internal service-team note" placeholder="Internal service-team note" /><label className="pds-ack">Internal notes are never returned to requester/viewer roles. {PHI_WARNING}</label><button type="submit">Add internal note</button></form><form className="pds-inline" onSubmit={onTime}><input name="minutes" aria-label="Minutes worked" type="number" min={1} max={1440} required placeholder="Minutes" /><select name="workType" aria-label="Work type"><option>onsite</option><option>remote</option><option>vendor</option><option>administrative</option></select><input name="description" aria-label="Operational work summary" placeholder="Operational work summary" /><button type="submit">Log time</button></form></>}
    <section><h4>Activity timeline</h4>{detail.events.map(event => <article className="pds-timeline" key={event.id}><Tag size={13} /><span>{event.eventType.replaceAll('_', ' ')}</span><small>{formatDate(event.createdAt)}</small></article>)}</section>
    <section><h4>Attachments</h4><form className="pds-inline" onSubmit={onUpload}><input name="file" aria-label="Attachment file" type="file" required /><select name="visibility" aria-label="Attachment visibility"><option value="requester">Requester-visible</option>{detail.capabilities.canViewInternal && <option value="internal">Internal</option>}</select><button type="submit"><FileUp size={13} /> Upload</button></form>{attachments.length ? attachments.map(file => <div className="pds-row" key={String(file.id)}><strong>{String(file.original_name ?? file.originalName ?? 'Attachment')}</strong><small>{String(file.visibility)} · {String(file.scan_status ?? file.scanStatus ?? 'scan pending')}</small></div>) : <Empty text="No attachments." />}</section>
    {detail.capabilities.canViewInternal && <form className="pds-form" onSubmit={onVendor}><h4>Vendor coordination</h4><select name="vendorOrganizationId" aria-label="Vendor organization" required defaultValue=""><option value="" disabled>Select a shared Directory vendor</option>{vendors.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select><div className="pds-grid-3"><select name="status" aria-label="Vendor engagement status"><option>requested</option><option>acknowledged</option><option>scheduled</option><option>waiting</option><option>completed</option><option>cancelled</option></select><input name="referenceCode" aria-label="Vendor reference" placeholder="Vendor reference" /></div><button type="submit">Add vendor engagement</button></form>}
  </aside>;
}

function OperationCard({ icon, title, count, form, rows }: { icon: React.ElementType; title: string; count: number; form: React.ReactNode; rows: Array<{ id: string; title: string; meta: string }> }) { return <section className="pds-card"><Heading icon={icon} title={`${title} (${count})`} subtitle={PHI_WARNING} />{form}<div className="pds-list">{rows.length ? rows.slice(0, 20).map(row => <article className="pds-row" key={row.id}><strong>{row.title}</strong><small>{row.meta}</small></article>) : <Empty text={`No ${title.toLowerCase()} yet.`} />}</div></section>; }
function ConfigRows({ configuration }: { configuration: PulseDeskServiceConfiguration | null }) { if (!configuration) return <Empty text="Configuration unavailable." />; return <div className="pds-config"><div><strong>Queues</strong><span>{configuration.queues.map(row => row.name).join(', ') || 'None'}</span></div><div><strong>Teams</strong><span>{configuration.teams.map(row => row.name).join(', ') || 'None'}</span></div><div><strong>SLA policies</strong><span>{configuration.slaPolicies.map(row => `${row.name} (${row.responseMinutes}/${row.resolutionMinutes} min)`).join(', ') || 'None'}</span></div><div><strong>Lifecycle</strong><span>{configuration.defaults.statuses.join(' → ')}</span></div></div>; }

const css = `
.pds{display:grid;gap:14px;color:#102033}.pds *{box-sizing:border-box}.pds button,.pds input,.pds select,.pds textarea{font:inherit}.pds button{border:0;border-radius:7px;background:#0277a8;color:#fff;padding:9px 12px;font-weight:750;cursor:pointer;display:inline-flex;gap:6px;align-items:center;justify-content:center}.pds button:disabled{opacity:.55;cursor:not-allowed}.pds-secondary{background:#e8f3f8!important;color:#17445c!important}.pds-danger{background:#b42318!important}.pds-warning,.pds-error,.pds-success{display:flex;gap:10px;align-items:flex-start;border-radius:9px;padding:12px}.pds-warning{background:#fff7df;border:1px solid #f0c96d;color:#664700}.pds-warning div{display:grid;gap:3px}.pds-warning span{font-size:12px}.pds-error{background:#fff0ee;border:1px solid #f4a7a0;color:#8f1d14}.pds-success{background:#ebf9ef;border:1px solid #9ed8ad;color:#176b31}.pds-toolbar,.pds-tabs,.pds-actions,.pds-bulk,.pds-filters,.pds-inline,.pds-chips{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.pds-toolbar{justify-content:space-between}.pds-tabs button{background:#edf5f9;color:#245069;text-transform:capitalize}.pds-tabs button[aria-selected=true]{background:#075985;color:#fff}.pds-card{background:#fff;border:1px solid rgba(34,86,120,.16);border-radius:10px;padding:15px;box-shadow:0 8px 22px rgba(25,73,102,.05)}.pds-heading{display:flex;gap:10px;align-items:flex-start;margin-bottom:12px}.pds-heading h3{margin:0;font-size:16px}.pds-heading p{margin:3px 0 0;color:#5b7087;font-size:12px;line-height:1.45}.pds-stack{display:grid;gap:14px}.pds-form{display:grid;gap:9px}.pds input,.pds select,.pds textarea{border:1px solid #bed0da;border-radius:7px;padding:9px 10px;background:#fff;color:#102033;min-width:0}.pds textarea{min-height:72px;resize:vertical}.pds-grid-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.pds-check,.pds-ack,.pds-toggle{font-size:12px;color:#4c6479;display:flex;gap:7px;align-items:flex-start}.pds-check input,.pds-ack input,.pds-toggle input{width:auto}.pds-ack{background:#f9f3df;border-radius:6px;padding:8px;color:#6b5008}.pds-route-context{background:#e8f6fb;border:1px solid #8ec8df;border-radius:7px;color:#17445c;font-size:12px;line-height:1.45;padding:9px 10px}.pds-ticket-layout{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(360px,.8fr);gap:14px;align-items:start}.pds-list{display:grid;gap:7px;margin-top:10px}.pds-ticket{display:flex;align-items:center;gap:7px;border:1px solid #d4e0e6;border-radius:8px;padding:5px}.pds-ticket.selected{border-color:#0ea5e9;background:#f0faff}.pds-ticket>button{background:transparent;color:#17384c;display:grid;text-align:left;justify-content:stretch;flex:1}.pds-ticket small,.pds-row small,.pds-row-button small{color:#6a8092}.pds-filters input{flex:1}.pds-detail{position:sticky;top:12px;max-height:calc(100vh - 30px);overflow:auto;display:grid;gap:13px}.pds-detail h4{margin:10px 0 6px}.pds-description{white-space:pre-wrap;color:#39566a}.pds-chips span{font-size:11px;background:#edf5f8;border-radius:999px;padding:5px 8px;color:#31586e}.pds-message{border-left:3px solid #0ea5e9;background:#f3faff;padding:9px;border-radius:0 7px 7px 0;margin:6px 0}.pds-message.internal{border-color:#d97706;background:#fff8e8}.pds-message p{white-space:pre-wrap;margin:5px 0}.pds-message small{color:#6b7e8d}.pds-timeline{display:grid;grid-template-columns:auto 1fr auto;gap:7px;align-items:center;padding:6px 0;border-bottom:1px solid #edf1f3;font-size:12px}.pds-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.pds-metrics article{background:#fff;border:1px solid #d5e2e8;border-radius:9px;padding:13px;display:grid;gap:5px}.pds-metrics span{font-size:12px;color:#587084}.pds-metrics strong{font-size:22px}.pds-row-button{display:grid!important;width:100%;background:#f5f9fb!important;color:#17384c!important;text-align:left!important;justify-content:stretch!important;margin-top:6px}.pds-row{display:grid;gap:3px;border-bottom:1px solid #edf1f3;padding:8px 0}.pds-row p{margin:2px 0;color:#51697c}.pds-ops-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.pds-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:start}.pds-empty{padding:18px;text-align:center;color:#6d8192;background:#f6f9fa;border-radius:8px}.pds-config{display:grid;gap:8px}.pds-config div{display:grid;gap:3px;padding:8px;border-bottom:1px solid #edf1f3}.pds-config span{font-size:12px;color:#5a7285}.pds-loading{display:flex;gap:9px;align-items:center;padding:18px;color:#45677c}.pds-spin{animation:pds-spin 1s linear infinite}@keyframes pds-spin{to{transform:rotate(360deg)}}
@media(max-width:1100px){.pds-ticket-layout,.pds-ops-grid{grid-template-columns:1fr}.pds-detail{position:static;max-height:none}.pds-metrics{grid-template-columns:repeat(2,1fr)}}@media(max-width:700px){.pds-grid-3,.pds-two,.pds-metrics{grid-template-columns:1fr}.pds-toolbar{align-items:stretch}.pds-tabs{display:grid;grid-template-columns:repeat(2,1fr)}.pds-inline>*{width:100%}}
`;
