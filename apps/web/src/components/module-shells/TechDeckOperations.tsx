'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, Clock3, FileCheck2, GitBranch, Network, Plus, RefreshCw, ServerCog, ShieldCheck } from 'lucide-react';
import {
  directoryApi,
  moduleShellApi,
  type DirectoryOrganization,
  type TechDeckAsset,
  type TechDeckAssetHealth,
  type TechDeckAssetType,
  type TechDeckDocument,
  type TechDeckWorkspaceResponse,
} from '@/lib/auth';

export type TechDeckOperationsArea = 'inventory' | 'network' | 'lifecycle' | 'documentation' | 'runbooks' | 'evidence' | 'reports' | 'time';

interface Props { tenantKey: string; canWrite: boolean; canApprove: boolean; area: TechDeckOperationsArea }

const assetTypes: TechDeckAssetType[] = ['server', 'workstation', 'firewall', 'switch', 'access_point', 'vlan', 'subnet', 'ip_address', 'public_ip', 'application', 'domain', 'license', 'certificate', 'credential_reference', 'other'];
const healthOptions: TechDeckAssetHealth[] = ['unknown', 'healthy', 'warning', 'critical', 'offline'];
const blankItem = { name: '', type: 'server' as TechDeckAssetType, hostname: '', ipAddress: '', cidr: '', vlanNumber: '', directoryOrganizationId: '' };
const blankDocument = { title: '', pageType: 'documentation', content: '', summary: '', directoryOrganizationId: '' };
const blankEvidence = { title: '', evidenceType: 'observation', summary: '', configurationItemId: '' };
type RequestedRecord = { kind: 'configuration' | 'document' | 'evidence' | 'report'; id: string };

function routeRecord(): RequestedRecord | null {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname;
  const matchers: Array<[RequestedRecord['kind'], RegExp]> = [
    ['configuration', /\/(?:assets|inventory)\/([a-z0-9-]+)\/?$/],
    ['document', /\/(?:documents|documentation|runbooks|kb|knowledge-base)\/([a-z0-9-]+)\/?$/],
    ['evidence', /\/evidence\/(?!upload(?:\/|$))([a-z0-9-]+)\/?$/],
    ['report', /\/reports\/([a-z0-9-]+)\/?$/],
  ];
  for (const [kind, pattern] of matchers) {
    const match = path.match(pattern);
    if (match) return { kind, id: match[1] };
  }
  return null;
}

function message(error: unknown): string {
  if (error && typeof error === 'object') {
    if ('error' in error && typeof error.error === 'string') return error.error;
    if ('message' in error && typeof error.message === 'string') return error.message;
  }
  return 'The TechDeck operation could not be completed.';
}

export default function TechDeckOperations({ tenantKey, canWrite, canApprove, area }: Props) {
  const [data, setData] = useState<TechDeckWorkspaceResponse | null>(null);
  const [organizations, setOrganizations] = useState<DirectoryOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [item, setItem] = useState({ ...blankItem });
  const [relationship, setRelationship] = useState({ sourceAssetId: '', targetAssetId: '', relationshipType: 'depends_on' });
  const [document, setDocument] = useState({ ...blankDocument });
  const [evidence, setEvidence] = useState({ ...blankEvidence });
  const [report, setReport] = useState({ name: 'Managed infrastructure inventory', reportType: 'asset_inventory' });
  const [time, setTime] = useState({ minutes: '30', workedAt: new Date().toISOString().slice(0, 16), configurationItemId: '', notes: '', billable: false });
  const [requestedRecord, setRequestedRecord] = useState<RequestedRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [workspace, directory] = await Promise.all([
        moduleShellApi.techdeck.getWorkspace(),
        ['inventory', 'documentation', 'runbooks'].includes(area)
          ? directoryApi.organizations.list('techdeck')
          : Promise.resolve({ organizations: [] }),
      ]);
      setData(workspace); setOrganizations(directory.organizations);
    } catch (err) { setError(message(err)); }
    finally { setLoading(false); }
  }, [area]);

  useEffect(() => { void load(); }, [load, tenantKey]);
  useEffect(() => { setRequestedRecord(routeRecord()); }, [tenantKey]);

  const networkItems = useMemo(() => data?.configurationItems.filter(row => ['network', 'network_device', 'firewall', 'switch', 'access_point', 'vlan', 'subnet', 'ip_address', 'public_ip', 'dns_record', 'dhcp_scope'].includes(row.type)) ?? [], [data]);
  const runbooks = useMemo(() => data?.documents.filter(row => row.pageType === 'runbook') ?? [], [data]);
  const docs = useMemo(() => data?.documents.filter(row => row.pageType !== 'runbook') ?? [], [data]);
  const organizationName = (id: string | null) => organizations.find(row => row.id === id)?.name ?? (id ? 'Linked client' : 'Unassigned');
  const requestedRecordState = useMemo(() => {
    if (!requestedRecord || !data) return null;
    if (requestedRecord.kind === 'configuration') {
      const row = data.configurationItems.find(candidate => candidate.id === requestedRecord.id);
      return { kind: 'configuration item', found: Boolean(row), label: row?.name };
    }
    if (requestedRecord.kind === 'document') {
      const row = data.documents.find(candidate => candidate.id === requestedRecord.id);
      return { kind: 'document', found: Boolean(row), label: row?.title };
    }
    if (requestedRecord.kind === 'evidence') {
      const row = data.evidence.find(candidate => candidate.id === requestedRecord.id);
      return { kind: 'evidence record', found: Boolean(row), label: row?.title };
    }
    const row = data.reports.find(candidate => candidate.id === requestedRecord.id);
    return { kind: 'report snapshot', found: Boolean(row), label: row?.name };
  }, [data, requestedRecord]);

  async function action(key: string, work: () => Promise<unknown>, reset?: () => void) {
    setBusy(key); setError(null);
    try { await work(); reset?.(); await load(); }
    catch (err) { setError(message(err)); }
    finally { setBusy(null); }
  }

  function createItem(event: React.FormEvent) {
    event.preventDefault();
    void action('item-create', () => moduleShellApi.techdeck.createConfigurationItem({
      name: item.name, type: item.type, hostname: item.hostname || undefined, ipAddress: item.ipAddress || undefined,
      cidr: item.cidr || undefined, vlanNumber: item.vlanNumber ? Number(item.vlanNumber) : undefined,
      directoryOrganizationId: item.directoryOrganizationId || undefined,
    }), () => setItem({ ...blankItem }));
  }

  function createRelationship(event: React.FormEvent) {
    event.preventDefault();
    void action('relationship-create', () => moduleShellApi.techdeck.createRelationship(relationship), () => setRelationship({ sourceAssetId: '', targetAssetId: '', relationshipType: 'depends_on' }));
  }

  function createDocument(event: React.FormEvent) {
    event.preventDefault();
    void action('document-create', () => moduleShellApi.techdeck.createDocument({ ...document, directoryOrganizationId: document.directoryOrganizationId || undefined }), () => setDocument({ ...blankDocument }));
  }

  function createEvidence(event: React.FormEvent) {
    event.preventDefault();
    void action('evidence-create', () => moduleShellApi.techdeck.createEvidence({ ...evidence, configurationItemId: evidence.configurationItemId || undefined }), () => setEvidence({ ...blankEvidence }));
  }

  function createReport(event: React.FormEvent) {
    event.preventDefault();
    void action('report-create', () => moduleShellApi.techdeck.generateReport(report.name, report.reportType));
  }

  function createTime(event: React.FormEvent) {
    event.preventDefault();
    void action('time-create', () => moduleShellApi.techdeck.addTime({
      workedAt: new Date(time.workedAt).toISOString(), minutes: Number(time.minutes), billable: time.billable,
      configurationItemId: time.configurationItemId || undefined, notes: time.notes || undefined,
    }), () => setTime({ ...time, minutes: '30', configurationItemId: '', notes: '' }));
  }

  function transitionDocument(row: TechDeckDocument) {
    const transition = row.status === 'draft' ? 'review' : row.status === 'in_review' ? 'approve' : row.status === 'approved' ? 'publish' : null;
    if (!transition || ((transition === 'approve' || transition === 'publish') && !canApprove)) return;
    void action(`doc-${row.id}`, () => moduleShellApi.techdeck.transitionDocument(row.id, row.version, transition));
  }

  function setHealth(row: TechDeckAsset, health: TechDeckAssetHealth) {
    void action(`item-${row.id}`, () => moduleShellApi.techdeck.updateConfigurationItem(row.id, { expectedVersion: row.version, health, lastSeenAt: new Date().toISOString() }));
  }

  if (loading && !data) return <section id="techdeck-ops" className="techdeck-panel td-state" aria-busy="true"><RefreshCw size={18} className="td-spin" />Loading managed infrastructure workspace…<style>{css}</style></section>;

  return (
    <section id="techdeck-ops" className="techdeck-panel td-workspace" data-testid="techdeck-ops-workspace" tabIndex={-1}>
      <style>{css}</style>
      <header className="td-head">
        <div><div className="td-kicker">Managed infrastructure + knowledge</div><h2>Operations Workspace</h2><p>Manage inventory, networks and IP space, documentation, evidence, reports, and technician time from one console.</p></div>
        <button className="td-button td-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? 'td-spin' : ''} />Refresh</button>
      </header>
      {area === 'runbooks' && <div className="td-boundary"><ShieldCheck size={16} /><span><strong>Documentation-only runbooks.</strong> {data?.execution.reason ?? 'Remote execution is disabled.'}</span></div>}
      {requestedRecordState && <div className="td-route-context" data-testid="techdeck-route-record-context" data-found={requestedRecordState.found}>
        {requestedRecordState.found
          ? <><CheckCircle2 size={16} /><span>Deep-linked {requestedRecordState.kind}: <strong>{requestedRecordState.label}</strong></span></>
          : <><AlertTriangle size={16} /><span>The requested {requestedRecordState.kind} is not available in this organization.</span></>}
      </div>}
      {error && <div className="td-error" role="alert"><AlertTriangle size={16} />{error}</div>}

      {['inventory', 'network', 'lifecycle'].includes(area) && <div className="td-summary">
        <Summary label="Configuration items" value={data?.configurationItems.length ?? 0} Icon={ServerCog} />
        <Summary label="Network/IPAM" value={networkItems.length} Icon={Network} />
        <Summary label="Active alerts" value={data?.alerts.length ?? 0} Icon={AlertTriangle} warn={!!data?.alerts.length} />
        <Summary label="Lifecycle due" value={data?.lifecycleDue.length ?? 0} Icon={Clock3} warn={!!data?.lifecycleDue.length} />
      </div>}

      {area === 'inventory' && <Panel id="techdeck-inventory" title="Configuration inventory" icon={<ServerCog size={17} />}>
        {canWrite && <form className="td-form td-item-form" onSubmit={createItem} data-testid="techdeck-configuration-create-form">
          <input required aria-label="Configuration item name" placeholder="Name" value={item.name} onChange={event => setItem({ ...item, name: event.target.value })} />
          <select aria-label="Configuration item type" value={item.type} onChange={event => setItem({ ...item, type: event.target.value as TechDeckAssetType })}>{assetTypes.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select>
          <select aria-label="Configuration item client" value={item.directoryOrganizationId} onChange={event => setItem({ ...item, directoryOrganizationId: event.target.value })}><option value="">Unassigned client</option>{organizations.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
          <input aria-label="Configuration item hostname" placeholder="Hostname" value={item.hostname} onChange={event => setItem({ ...item, hostname: event.target.value })} />
          <input aria-label="Configuration item IP address" placeholder="IP address" value={item.ipAddress} onChange={event => setItem({ ...item, ipAddress: event.target.value })} />
          <input aria-label="Configuration item network CIDR" placeholder="CIDR (10.0.0.0/24)" value={item.cidr} onChange={event => setItem({ ...item, cidr: event.target.value })} />
          <input aria-label="Configuration item VLAN" inputMode="numeric" placeholder="VLAN" value={item.vlanNumber} onChange={event => setItem({ ...item, vlanNumber: event.target.value })} />
          <button className="td-button" disabled={busy === 'item-create'}><Plus size={14} />Add item</button>
        </form>}
        <div className="td-list">
          {data?.configurationItems.map(row => <article className="td-row" key={row.id} data-record-id={row.id} data-active={requestedRecord?.kind === 'configuration' && requestedRecord.id === row.id}>
            <div><strong>{row.name}</strong><small>{row.type.replaceAll('_', ' ')} · {organizationName(row.directoryOrganizationId)} · {row.hostname || row.ipAddress || row.cidr || row.serialNumber || 'details incomplete'} · v{row.version}</small></div>
            {canWrite ? <select aria-label={`Health for ${row.name}`} value={row.health} disabled={busy === `item-${row.id}`} onChange={event => setHealth(row, event.target.value as TechDeckAssetHealth)}>{healthOptions.map(value => <option key={value}>{value}</option>)}</select> : <Status value={row.health} />}
          </article>)}
          {!data?.configurationItems.length && <Empty text="No configuration items registered for this organization." />}
        </div>
      </Panel>}

      {area === 'network' && <Panel id="techdeck-network" title="Network and IPAM relationships" icon={<Network size={17} />}>
          {canWrite && data && data.configurationItems.length > 1 && <form className="td-form" onSubmit={createRelationship} data-testid="techdeck-relationship-create-form">
            <select required aria-label="Relationship source item" value={relationship.sourceAssetId} onChange={event => setRelationship({ ...relationship, sourceAssetId: event.target.value })}><option value="">Source item</option>{data.configurationItems.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
            <select required aria-label="Relationship target item" value={relationship.targetAssetId} onChange={event => setRelationship({ ...relationship, targetAssetId: event.target.value })}><option value="">Target item</option>{data.configurationItems.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
            <select aria-label="Relationship type" value={relationship.relationshipType} onChange={event => setRelationship({ ...relationship, relationshipType: event.target.value })}>{['depends_on', 'connects_to', 'hosts', 'runs', 'protects', 'routes_to'].map(value => <option key={value}>{value}</option>)}</select>
            <button className="td-button" disabled={busy === 'relationship-create'}><GitBranch size={14} />Link</button>
          </form>}
          <div className="td-list">{data?.relationships.map(row => <div className="td-row" key={row.id}><span>{data.configurationItems.find(item => item.id === row.sourceAssetId)?.name ?? 'Item'} <b>{row.relationshipType.replaceAll('_', ' ')}</b> {data.configurationItems.find(item => item.id === row.targetAssetId)?.name ?? 'Item'}</span></div>)}{!data?.relationships.length && <Empty text="No configuration relationships recorded." />}</div>
      </Panel>}

      {area === 'lifecycle' && <Panel id="techdeck-lifecycle" title="Lifecycle and posture" icon={<Clock3 size={17} />}>
          <div className="td-list">{data?.lifecycleDue.map(row => <div className="td-row" key={row.id}><div><strong>{row.name}</strong><small>Expiration {row.expirationDate ? new Date(row.expirationDate).toLocaleDateString() : '—'} · renewal {row.renewalDate ? new Date(row.renewalDate).toLocaleDateString() : '—'} · warranty {row.warrantyEndDate ? new Date(row.warrantyEndDate).toLocaleDateString() : '—'}</small></div><Status value={row.health} /></div>)}{!data?.lifecycleDue.length && <Empty text="No lifecycle deadlines fall within the next 30 days." />}</div>
      </Panel>}

      {(area === 'documentation' || area === 'runbooks') && <Panel id={area === 'runbooks' ? 'techdeck-runbooks' : 'techdeck-documentation'} title={area === 'runbooks' ? 'Runbooks' : 'Documentation'} icon={<FileCheck2 size={17} />}>
        {canWrite && <form className="td-form td-doc-form" onSubmit={createDocument} data-testid="techdeck-document-create-form">
          <input required aria-label="Document title" placeholder="Document title" value={document.title} onChange={event => setDocument({ ...document, title: event.target.value })} />
          <select aria-label="Document type" value={document.pageType} onChange={event => setDocument({ ...document, pageType: event.target.value })}>{['documentation', 'runbook', 'knowledge_base', 'procedure', 'network_diagram', 'configuration_standard'].map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select>
          <select aria-label="Document client" value={document.directoryOrganizationId} onChange={event => setDocument({ ...document, directoryOrganizationId: event.target.value })}><option value="">All clients</option>{organizations.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
          <input aria-label="Document summary" placeholder="Summary" value={document.summary} onChange={event => setDocument({ ...document, summary: event.target.value })} />
          <textarea required aria-label="Document procedure content" placeholder="Markdown or plain-text procedure. This content is never executed." value={document.content} onChange={event => setDocument({ ...document, content: event.target.value })} />
          <button className="td-button" disabled={busy === 'document-create'}><Plus size={14} />Save draft</button>
        </form>}
        <div className="td-doc-columns">
          {area === 'documentation' && <DocumentList title="Documentation" rows={docs} requestedDocumentId={requestedRecord?.kind === 'document' ? requestedRecord.id : null} canWrite={canWrite} canApprove={canApprove} busy={busy} onTransition={transitionDocument} />}
          {area === 'runbooks' && <DocumentList title="Runbooks (never executed)" rows={runbooks} requestedDocumentId={requestedRecord?.kind === 'document' ? requestedRecord.id : null} canWrite={canWrite} canApprove={canApprove} busy={busy} onTransition={transitionDocument} />}
        </div>
      </Panel>}

      {area === 'evidence' && <Panel id="techdeck-evidence" title="Evidence register" icon={<FileCheck2 size={17} />}>
          {canWrite && <form className="td-form" onSubmit={createEvidence} data-testid="techdeck-evidence-create-form"><input required aria-label="Evidence title" placeholder="Evidence title" value={evidence.title} onChange={event => setEvidence({ ...evidence, title: event.target.value })} /><select aria-label="Evidence type" value={evidence.evidenceType} onChange={event => setEvidence({ ...evidence, evidenceType: event.target.value })}>{['observation', 'configuration_snapshot', 'test_result', 'photo', 'document', 'other'].map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select><select aria-label="Evidence configuration item" value={evidence.configurationItemId} onChange={event => setEvidence({ ...evidence, configurationItemId: event.target.value })}><option value="">No configuration item</option>{data?.configurationItems.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select><input aria-label="Evidence summary" placeholder="Summary" value={evidence.summary} onChange={event => setEvidence({ ...evidence, summary: event.target.value })} /><button className="td-button" disabled={busy === 'evidence-create'}><Plus size={14} />Record</button></form>}
          <div className="td-list">{data?.evidence.map(row => <div className="td-row" key={row.id} data-record-id={row.id} data-active={requestedRecord?.kind === 'evidence' && requestedRecord.id === row.id}><div><strong>{row.title}</strong><small>{row.evidenceType.replaceAll('_', ' ')} · {new Date(row.createdAt).toLocaleString()}</small></div></div>)}{!data?.evidence.length && <Empty text="No evidence records captured." />}</div>
      </Panel>}

      {area === 'reports' && <Panel id="techdeck-reports" title="Snapshot reports" icon={<BarChart3 size={17} />}>
          {canWrite && <form className="td-form" onSubmit={createReport} data-testid="techdeck-report-create-form"><input required aria-label="Report name" value={report.name} onChange={event => setReport({ ...report, name: event.target.value })} /><select aria-label="Report type" value={report.reportType} onChange={event => setReport({ ...report, reportType: event.target.value })}>{['asset_inventory', 'network_inventory', 'lifecycle', 'ticket_summary', 'evidence_register', 'time_summary'].map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select><button className="td-button" disabled={busy === 'report-create'}>Generate</button></form>}
          <div className="td-list">{data?.reports.map(row => <div className="td-row" key={row.id} data-record-id={row.id} data-active={requestedRecord?.kind === 'report' && requestedRecord.id === row.id}><div><strong>{row.name}</strong><small>{row.reportType.replaceAll('_', ' ')} · checksum {row.sha256.slice(0, 12)}…</small></div></div>)}{!data?.reports.length && <Empty text="No immutable report snapshots generated." />}</div>
      </Panel>}

      {area === 'time' && <Panel id="techdeck-time" title="Technician time" icon={<Clock3 size={17} />}>
        {canWrite && <form className="td-form td-time-form" onSubmit={createTime} data-testid="techdeck-time-create-form"><input required aria-label="Work date and time" type="datetime-local" value={time.workedAt} onChange={event => setTime({ ...time, workedAt: event.target.value })} /><input required aria-label="Minutes worked" type="number" min="1" max="1440" value={time.minutes} onChange={event => setTime({ ...time, minutes: event.target.value })} /><select aria-label="Time entry configuration item" value={time.configurationItemId} onChange={event => setTime({ ...time, configurationItemId: event.target.value })}><option value="">General work</option>{data?.configurationItems.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select><input aria-label="Work notes" placeholder="Work notes" value={time.notes} onChange={event => setTime({ ...time, notes: event.target.value })} /><label className="td-check"><input type="checkbox" checked={time.billable} onChange={event => setTime({ ...time, billable: event.target.checked })} />Billable</label><button className="td-button" disabled={busy === 'time-create'}><Plus size={14} />Log time</button></form>}
        <div className="td-list">{data?.timeEntries.map(row => <div className="td-row" key={row.id}><div><strong>{row.minutes} minutes {row.billable ? '· billable' : ''}</strong><small>{new Date(row.workedAt).toLocaleString()} · {row.notes || 'No notes'}</small></div></div>)}{!data?.timeEntries.length && <Empty text="No technician time recorded." />}</div>
      </Panel>}
    </section>
  );
}

function Panel({ id, title, icon, children }: { id: string; title: string; icon: React.ReactNode; children: React.ReactNode }) { return <section id={id} className="td-panel" tabIndex={-1}><div className="td-section-title">{icon}<h3>{title}</h3></div>{children}</section>; }
function Summary({ label, value, Icon, warn = false }: { label: string; value: number; Icon: typeof ServerCog; warn?: boolean }) { return <div className={warn ? 'td-summary-card td-warn' : 'td-summary-card'}><Icon size={17} /><div><strong>{value}</strong><small>{label}</small></div></div>; }
function Status({ value }: { value: string }) { return <span className={`td-status td-status-${value}`}>{value.replaceAll('_', ' ')}</span>; }
function Empty({ text }: { text: string }) { return <div className="td-empty"><CheckCircle2 size={16} />{text}</div>; }
function DocumentList({ title, rows, requestedDocumentId, canWrite, canApprove, busy, onTransition }: { title: string; rows: TechDeckDocument[]; requestedDocumentId: string | null; canWrite: boolean; canApprove: boolean; busy: string | null; onTransition: (row: TechDeckDocument) => void }) {
  return <div className="td-stack"><h4>{title}</h4><div className="td-list">{rows.map(row => {
    const allowed = row.status === 'draft' ? canWrite : ['in_review', 'approved'].includes(row.status) ? canApprove : false;
    const label = row.status === 'draft' ? 'Submit review' : row.status === 'in_review' ? 'Approve' : row.status === 'approved' ? 'Publish' : null;
    return <article className="td-row td-doc" key={row.id} data-record-id={row.id} data-active={requestedDocumentId === row.id}><div><strong>{row.title}</strong><small>{row.pageType.replaceAll('_', ' ')} · v{row.version}</small><p>{row.summary || row.content.slice(0, 140)}</p></div><div className="td-actions"><Status value={row.status} />{allowed && label && <button className="td-button" disabled={busy === `doc-${row.id}`} onClick={() => onTransition(row)}>{label}</button>}</div></article>;
  })}{!rows.length && <Empty text={`No ${title.toLowerCase()} saved.`} />}</div></div>;
}

const css = `
.td-workspace{padding:18px;display:grid;gap:16px}.td-state{padding:20px;display:flex;gap:10px;align-items:center;color:#8fa3bd}.td-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.td-head h2{margin:3px 0 4px;font-size:21px}.td-head p{margin:0;color:#8fa3bd;font-size:13px;max-width:820px}.td-kicker{text-transform:uppercase;letter-spacing:.12em;color:#38bdf8;font-size:11px;font-weight:800}
.td-button{border:1px solid rgba(56,189,248,.5);background:rgba(14,165,233,.15);color:#e5eefc;border-radius:6px;padding:8px 11px;font-weight:750;display:inline-flex;gap:7px;align-items:center;justify-content:center;cursor:pointer}.td-button:disabled{opacity:.55;cursor:not-allowed}.td-secondary{background:#101826;border-color:rgba(148,163,184,.25)}.td-error,.td-boundary,.td-route-context{display:flex;gap:8px;align-items:center;border-radius:6px;padding:10px 12px;font-size:13px}.td-error{color:#fecaca;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.35)}.td-boundary{color:#bae6fd;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.2)}.td-route-context{color:#cbd5e1;background:#101826;border:1px solid rgba(148,163,184,.24)}.td-route-context[data-found=true]{color:#bae6fd;border-color:rgba(56,189,248,.45)}
.td-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.td-summary-card{display:flex;gap:10px;align-items:center;background:#080d16;border:1px solid rgba(148,163,184,.16);padding:12px;border-radius:7px;color:#38bdf8}.td-summary-card strong,.td-summary-card small{display:block}.td-summary-card strong{font-size:18px;color:#e5eefc}.td-summary-card small{font-size:11px;color:#8fa3bd}.td-warn{color:#f59e0b;border-color:rgba(245,158,11,.4)}
.td-panel{min-width:0;display:grid;align-content:start;gap:12px;background:#080d16;border:1px solid rgba(148,163,184,.16);border-radius:7px;padding:13px;scroll-margin-top:18px}.td-columns,.td-doc-columns{display:grid;grid-template-columns:1fr 1fr;gap:14px}.td-section-title{display:flex;gap:8px;align-items:center;color:#38bdf8}.td-section-title h3{font-size:15px;color:#e5eefc;margin:0}.td-stack{display:grid;gap:8px;align-content:start}.td-stack h4{margin:0;color:#cbd5e1;font-size:13px}
.td-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) auto;gap:7px}.td-item-form{grid-template-columns:repeat(4,minmax(0,1fr))}.td-doc-form{grid-template-columns:1fr 1fr 1fr}.td-doc-form textarea{grid-column:1/-2}.td-time-form{grid-template-columns:1fr .5fr 1fr 1fr auto auto}.td-form input,.td-form select,.td-form textarea,.td-row select{min-width:0;border:1px solid rgba(148,163,184,.25);background:#101826;color:#e5eefc;border-radius:5px;padding:8px;font:inherit}.td-form textarea{min-height:100px;resize:vertical;font-size:12px}.td-check{display:flex;min-height:24px;align-items:center;gap:5px;color:#cbd5e1;font-size:12px;white-space:nowrap}
.td-list{display:grid;gap:7px}.td-row{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px;border:1px solid rgba(148,163,184,.13);border-radius:6px;background:#0d1320;font-size:13px}.td-row[data-active=true]{border-color:#38bdf8;box-shadow:0 0 0 1px rgba(56,189,248,.5);background:rgba(14,165,233,.09)}.td-row strong,.td-row small{display:block}.td-row small{margin-top:3px;color:#8fa3bd;font-size:11px}.td-row p{margin:6px 0 0;color:#8fa3bd;font-size:12px;white-space:pre-wrap}.td-doc{align-items:flex-start}.td-actions{display:grid;gap:6px;justify-items:end;flex:none}.td-status{text-transform:capitalize;border:1px solid rgba(148,163,184,.25);border-radius:999px;padding:4px 8px;font-size:10px;color:#cbd5e1}.td-status-healthy,.td-status-approved,.td-status-published{color:#86efac;border-color:rgba(34,197,94,.4)}.td-status-warning,.td-status-draft,.td-status-in_review{color:#fcd34d;border-color:rgba(245,158,11,.4)}.td-status-critical,.td-status-offline{color:#fca5a5;border-color:rgba(239,68,68,.4)}.td-empty{display:flex;gap:8px;align-items:center;color:#8fa3bd;padding:12px;font-size:13px}.td-spin{animation:tdspin 1s linear infinite}@keyframes tdspin{to{transform:rotate(360deg)}}
@media(max-width:1000px){.td-item-form{grid-template-columns:repeat(2,1fr)}.td-time-form{grid-template-columns:repeat(2,1fr)}}@media(max-width:760px){.td-summary,.td-columns,.td-doc-columns,.td-form,.td-item-form,.td-doc-form,.td-time-form{grid-template-columns:1fr}.td-doc-form textarea{grid-column:auto}.td-head{display:grid}.td-row{align-items:flex-start;flex-direction:column}.td-actions{justify-items:start}}
`;
