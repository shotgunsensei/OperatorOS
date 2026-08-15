'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Archive,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileCheck2,
  FileClock,
  FileText,
  Fingerprint,
  FolderLock,
  LayoutDashboard,
  LayoutTemplate,
  MessageSquareText,
  PackageOpen,
  Plus,
  Settings,
  ShieldCheck,
  Upload,
  UserRound,
  Users,
} from 'lucide-react';
import {
  moduleShellApi,
  type SnapProofCase,
  type SnapProofEvidence,
  type SnapProofReport,
} from '@/lib/auth';
import { cardStyle, fontSize, radius, semantic, space } from '@/lib/design-tokens';
import { EmptyState, LoadingState } from '@/components/ExperiencePrimitives';
import { ShellLiveBadge } from './ShellChrome';
import SnapProofFieldWorkspace, { type SnapProofFieldTab } from './SnapProofFieldWorkspace';

type Tab = 'dashboard' | 'customers' | 'jobs' | 'capture' | 'work' | 'costs' | 'templates' | 'team' | 'activity' | 'cases' | 'evidence' | 'review' | 'findings' | 'reports' | 'custody' | 'retention' | 'branding' | 'settings';
const tabs: Array<{ id: Tab; label: string; Icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'customers', label: 'Customers', Icon: UserRound },
  { id: 'jobs', label: 'Jobs', Icon: BriefcaseBusiness },
  { id: 'capture', label: 'Capture', Icon: Upload },
  { id: 'work', label: 'Findings & notes', Icon: MessageSquareText },
  { id: 'costs', label: 'Parts & labor', Icon: PackageOpen },
  { id: 'templates', label: 'Templates', Icon: LayoutTemplate },
  { id: 'reports', label: 'Reports', Icon: FileText },
  { id: 'review', label: 'Review', Icon: ClipboardCheck },
  { id: 'team', label: 'Team', Icon: Users },
  { id: 'activity', label: 'Activity', Icon: Activity },
  { id: 'cases', label: 'Proof cases', Icon: FolderLock },
  { id: 'evidence', label: 'Integrity', Icon: FileCheck2 },
  { id: 'findings', label: 'Evidence findings', Icon: ShieldCheck },
  { id: 'custody', label: 'Custody', Icon: Fingerprint },
  { id: 'retention', label: 'Retention', Icon: Archive },
  { id: 'branding', label: 'Branding', Icon: Settings },
  { id: 'settings', label: 'Privacy', Icon: Settings },
];
const fieldTabs = new Set<Tab>(['customers', 'jobs', 'capture', 'work', 'costs', 'templates', 'team', 'activity', 'branding']);

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: `1px solid ${semantic.border}`,
  background: semantic.bg,
  color: semantic.text,
  borderRadius: radius.sm,
  padding: '10px 12px',
  font: 'inherit',
  boxSizing: 'border-box',
};
const buttonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: radius.sm,
  background: '#b91c1c',
  color: '#ffffff',
  fontWeight: 750,
  padding: '10px 15px',
  cursor: 'pointer',
};
const subtleButton: React.CSSProperties = {
  ...buttonStyle,
  background: semantic.bgPanel,
  border: `1px solid ${semantic.border}`,
  color: semantic.textMuted,
};
const dangerButton: React.CSSProperties = {
  ...subtleButton,
  borderColor: `${semantic.accentDanger}66`,
  color: semantic.accentDanger,
};

function errorText(error: any) {
  return error?.error || error?.message || "We couldn't process that in SnapProof. Please try again.";
}

const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] || '');
    reader.readAsDataURL(file);
  });
}

export default function SnapProofWorkspace() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<Record<string, any>>({});
  const [cases, setCases] = useState<SnapProofCase[]>([]);
  const [evidence, setEvidence] = useState<SnapProofEvidence[]>([]);
  const [reports, setReports] = useState<SnapProofReport[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const selectedCaseIdRef = useRef<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [custody, setCustody] = useState<Array<Record<string, any>>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseCase = useCallback((caseId: string | null) => {
    selectedCaseIdRef.current = caseId;
    setSelectedCaseId(caseId);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dash, caseRows, evidenceRows, reportRows] = await Promise.all([
        moduleShellApi.snapproofos.dashboard(),
        moduleShellApi.snapproofos.listCases('limit=100'),
        moduleShellApi.snapproofos.listEvidence('limit=100'),
        moduleShellApi.snapproofos.listReports('limit=100'),
      ]);
      setDashboard(dash);
      setCases(caseRows.items);
      setEvidence(evidenceRows.items);
      setReports(reportRows.items);
      const current = selectedCaseIdRef.current;
      chooseCase(current && caseRows.items.some(item => item.id === current)
        ? current
        : caseRows.items[0]?.id ?? null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [chooseCase]);

  const loadDetail = useCallback(async (caseId: string | null) => {
    if (!caseId) {
      setDetail(null);
      setCustody([]);
      return;
    }
    try {
      const [caseDetail, chain] = await Promise.all([
        moduleShellApi.snapproofos.getCase(caseId),
        moduleShellApi.snapproofos.custody(caseId),
      ]);
      setDetail(caseDetail);
      setCustody(chain.events);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadDetail(selectedCaseId); }, [selectedCaseId, loadDetail]);
  useEffect(() => {
    const sync = () => {
      const segments = window.location.pathname.split('/').filter(Boolean);
      const routeAlias: Record<string, Tab> = {
        findings: 'work',
        files: 'capture',
        profile: 'branding',
        billing: 'branding',
        exports: 'reports',
      };
      const matched = [...segments].reverse().find(segment => tabs.some(item => item.id === segment) || routeAlias[segment]);
      const candidate = matched ? (routeAlias[matched] || matched) as Tab : undefined;
      if (candidate) setTab(candidate);
      const casesIndex = segments.lastIndexOf('cases');
      if (casesIndex >= 0 && segments[casesIndex + 1]) {
        chooseCase(decodeURIComponent(segments[casesIndex + 1]));
      }
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [chooseCase]);

  const navigate = (next: Tab) => {
    setTab(next);
    const hostRouted = window.location.hostname === 'snapproofos.operatoros.net';
    window.history.pushState({}, '', hostRouted ? `/${next}` : `/modules/snapproofos/${next}`);
  };

  const selectCase = (caseId: string, next: Tab = 'cases') => {
    chooseCase(caseId);
    setTab(next);
    const hostRouted = window.location.hostname === 'snapproofos.operatoros.net';
    const resourcePath = next === 'cases' ? `/cases/${caseId}` : `/${next}`;
    window.history.pushState({}, '', hostRouted ? resourcePath : `/modules/snapproofos${resourcePath}`);
  };

  async function mutate(task: () => Promise<unknown>) {
    setSaving(true);
    setError(null);
    try {
      await task();
      await load();
      await loadDetail(selectedCaseIdRef.current);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const selectedCase = detail?.case as SnapProofCase | undefined;
  return (
    <main
      id="snapproofos-workspace"
      data-testid="snapproofos-workspace"
      data-evidence="persisted-field-proof-and-private-evidence"
      data-private-evidence-contract="persisted-private-evidence-only"
      data-phase="32"
      tabIndex={-1}
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at 85% 0%,#3a1115 0,transparent 34%),#111317',
        color: semantic.text,
        colorScheme: 'dark',
        padding: `0 ${space.xxl}px ${space.xxl}px`,
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: space.lg, alignItems: 'flex-end', flexWrap: 'wrap', padding: `${space.xl}px 0` }}>
        <div>
          <div style={{ color: '#f87171', fontSize: fontSize.xs, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase' }}>Field proof · reports · customer trust</div>
          <h1 style={{ margin: '6px 0', fontSize: 30 }}>SnapProofOS</h1>
          <p style={{ margin: 0, color: '#a6a9b0', maxWidth: 820 }}>Run customer field jobs from mobile capture through findings, costs, approval, branded PDF/DOCX delivery, and revocable proof sharing.</p>
        </div>
        <ShellLiveBadge />
      </header>

      <nav aria-label="SnapProofOS workspace" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: space.lg }}>
        {tabs.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => navigate(id)} aria-current={tab === id ? 'page' : undefined} style={{ ...subtleButton, display: 'inline-flex', gap: 7, alignItems: 'center', whiteSpace: 'nowrap', borderColor: tab === id ? '#dc2626' : '#393d45', color: tab === id ? '#fecaca' : '#a6a9b0', background: tab === id ? '#3a1115' : '#202329' }}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </nav>

      {error && <div role="alert" style={{ ...cardStyle, background: '#1f0a12', borderColor: '#be123c', color: '#fda4af', marginBottom: space.lg }}>{error}</div>}
      {loading ? <div style={{ ...cardStyle, background: '#0f172a', color: '#94a3b8' }}>Loading your evidence workspace…</div> : (
        <>
          {tab === 'dashboard' && <Dashboard counts={dashboard.counts || {}} cases={cases} onOpen={selectCase} navigate={navigate} />}
          {fieldTabs.has(tab) && <SnapProofFieldWorkspace tab={tab as SnapProofFieldTab} selectedJobId={selectedCaseId} onSelectJob={chooseCase} />}
          {tab === 'cases' && <CasesPanel cases={cases} detail={detail} selectedCaseId={selectedCaseId} saving={saving} onSelect={selectCase} mutate={mutate} />}
          {tab === 'evidence' && <EvidencePanel cases={cases} evidence={evidence} selectedCaseId={selectedCaseId} saving={saving} onSelectCase={chooseCase} mutate={mutate} />}
          {tab === 'review' && <ReviewPanel caseDetail={detail} evidence={evidence} reports={reports} saving={saving} mutate={mutate} />}
          {tab === 'findings' && <FindingsPanel cases={cases} detail={detail} selectedCaseId={selectedCaseId} saving={saving} onSelectCase={chooseCase} mutate={mutate} />}
          {tab === 'reports' && <ReportsPanel cases={cases} reports={reports} selectedCaseId={selectedCaseId} saving={saving} onSelectCase={chooseCase} mutate={mutate} />}
          {tab === 'custody' && <CustodyPanel cases={cases} selectedCaseId={selectedCaseId} events={custody} onSelectCase={chooseCase} />}
          {tab === 'retention' && <RetentionPanel cases={cases} selectedCase={selectedCase} onSelectCase={chooseCase} saving={saving} mutate={mutate} />}
          {tab === 'settings' && <SettingsPanel />}
        </>
      )}
    </main>
  );
}

function Panel({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return <section id={id} tabIndex={-1}><h2 style={{ marginBottom: 4 }}>{title}</h2><p style={{ color: '#94a3b8', marginTop: 0 }}>{description}</p>{children}</section>;
}

function Dashboard({ counts, cases, onOpen, navigate }: { counts: Record<string, number>; cases: SnapProofCase[]; onOpen: (id: string) => void; navigate: (tab: Tab) => void }) {
  return <Panel id="snapproofos-dashboard" title="Field operations command dashboard" description="See customers, active and overdue jobs, captured proof, approval state, financial totals, and recent activity.">
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: space.md }}>
      {[
        ['Cases', counts.cases ?? 0],
        ['Customers', counts.customers ?? 0],
        ['Active jobs', counts.activeJobs ?? 0],
        ['Overdue jobs', counts.overdueJobs ?? 0],
        ['Evidence', counts.evidence ?? 0],
        ['Awaiting review', counts.evidenceInReview ?? 0],
        ['Open findings', counts.openFindings ?? 0],
        ['Approved reports', counts.approvedReports ?? 0],
        [
          'Documented value',
          money(Number(counts.partsRevenueCents ?? 0) + Number(counts.laborRevenueCents ?? 0)),
        ],
        ['Activity (7 days)', counts.recentActivity ?? 0],
      ].map(([label, value]) => <div key={String(label)} style={{ ...cardStyle, background: '#0f172a', borderColor: '#1e3a4f' }}><div style={{ color: '#94a3b8', fontSize: 12 }}>{label}</div><div style={{ fontSize: 28, fontWeight: 800, marginTop: 5 }}>{String(value)}</div></div>)}
    </div>
    <div style={{ ...cardStyle, background: '#0f172a', marginTop: space.lg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}><h3 style={{ margin: 0 }}>Recently updated cases</h3><button style={buttonStyle} onClick={() => navigate('cases')}><Plus size={15} /> New case</button></div>
      {cases.length ? cases.slice(0, 6).map(item => <button key={item.id} onClick={() => onOpen(item.id)} style={{ width: '100%', textAlign: 'left', padding: '12px 0', border: 0, borderTop: '1px solid #1e293b', background: 'transparent', color: '#e2e8f0', cursor: 'pointer' }}><strong>{item.reference} · {item.title}</strong><span style={{ float: 'right', color: '#5eead4' }}>{item.status.replaceAll('_', ' ')}</span></button>) : <Empty text="No evidence cases yet. Create your first case to begin collecting proof." />}
    </div>
  </Panel>;
}

function CasesPanel({ cases, detail, selectedCaseId, saving, onSelect, mutate }: { cases: SnapProofCase[]; detail: any; selectedCaseId: string | null; saving: boolean; onSelect: (id: string) => void; mutate: (task: () => Promise<unknown>) => Promise<void> }) {
  const [reference, setReference] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void mutate(async () => {
      const created = await moduleShellApi.snapproofos.createCase({ reference, title, description: description || null, caseType: 'proof_of_work', sourceContext: { captureChannel: 'operatoros_web' } });
      setReference(''); setTitle(''); setDescription(''); onSelect(created.id);
    });
  };
  const selected = detail?.case as SnapProofCase | undefined;
  return <Panel id="snapproofos-cases" title="Evidence cases" description="Group related evidence, notes, findings, review decisions, and reports under a single case reference.">
    <Form onSubmit={submit}><Field label="Case reference" value={reference} onChange={setReference} required /><Field label="Title" value={title} onChange={setTitle} required /><Field label="Description" value={description} onChange={setDescription} /><Submit saving={saving} label="Create evidence case" /></Form>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))', gap: space.lg }}>
      <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>{cases.length ? cases.map(item => <button key={item.id} onClick={() => onSelect(item.id)} style={{ ...subtleButton, textAlign: 'left', borderColor: selectedCaseId === item.id ? '#14b8a6' : '#334155' }}><strong>{item.reference}</strong><div style={{ color: '#94a3b8', marginTop: 4 }}>{item.title}</div><small style={{ color: '#5eead4' }}>{item.status.replaceAll('_', ' ')}</small></button>) : <Empty text="No cases yet." />}</div>
      {selected ? <div style={{ ...cardStyle, background: '#0f172a' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><small style={{ color: '#5eead4' }}>{selected.reference}</small><h3 style={{ margin: '4px 0' }}>{selected.title}</h3></div><Status value={selected.status} /></div>
        <p style={{ color: '#94a3b8' }}>{selected.description || 'No description recorded.'}</p>
        <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12 }}><Fact label="Evidence" value={String(detail.evidence?.length || 0)} /><Fact label="Findings" value={String(detail.findings?.length || 0)} /><Fact label="Comments" value={String(detail.comments?.length || 0)} /><Fact label="Version" value={String(selected.version)} /></dl>
        {['draft', 'collecting', 'rejected'].includes(selected.status) && <button disabled={saving} style={{ ...buttonStyle, marginTop: 14 }} onClick={() => void mutate(() => moduleShellApi.snapproofos.submitCase(selected.id))}><ClipboardCheck size={15} /> Submit case for review</button>}
      </div> : <Empty text="Select a case to review its evidence and activity." />}
    </div>
  </Panel>;
}

function EvidencePanel({ cases, evidence, selectedCaseId, saving, onSelectCase, mutate }: { cases: SnapProofCase[]; evidence: SnapProofEvidence[]; selectedCaseId: string | null; saving: boolean; onSelectCase: (id: string) => void; mutate: (task: () => Promise<unknown>) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sourceType, setSourceType] = useState('field_capture');
  const [evidenceType, setEvidenceType] = useState('note');
  const [file, setFile] = useState<File | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedCaseId) return;
    void mutate(async () => {
      const contentBase64 = file ? await fileBase64(file) : null;
      await moduleShellApi.snapproofos.createEvidence(selectedCaseId, {
        title, description: description || null, sourceType, evidenceType,
        capturedAt: new Date().toISOString(),
        sourceReference: 'OperatorOS web capture',
        captureContext: { captureChannel: 'operatoros_web' },
        originalName: file?.name ?? null,
        declaredMimeType: file?.type ?? null,
        contentBase64,
      });
      setTitle(''); setDescription(''); setFile(null);
    });
  };
  const download = (item: SnapProofEvidence) => void mutate(async () => {
    downloadBlob(await moduleShellApi.snapproofos.downloadEvidence(item.id), `snapproof-${item.id}`);
  });
  return <Panel id="snapproofos-evidence" title="Secure evidence capture" description="Uploads remain private, signature checked, scanned, hashed, and available only to authorized users.">
    <Form onSubmit={submit}>
      <Select label="Case" value={selectedCaseId || ''} onChange={onSelectCase} required options={cases.map(item => [item.id, `${item.reference} · ${item.title}`])} />
      <Select label="Evidence type" value={evidenceType} onChange={value => { setEvidenceType(value); if (value === 'note') setFile(null); }} required options={[['note', 'Evidence note'], ['photo', 'Photo'], ['document', 'Document'], ['screenshot', 'Screenshot'], ['log', 'Log file']]} />
      <Field label="Title" value={title} onChange={setTitle} required />
      <Field label="Source type" value={sourceType} onChange={setSourceType} required />
      <Field label="Description / note" value={description} onChange={setDescription} multiline={evidenceType === 'note'} required={evidenceType === 'note'} />
      {evidenceType !== 'note' && <label style={labelStyle}>Private file<input aria-label="Private file" type="file" required onChange={event => setFile(event.target.files?.[0] || null)} accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.json,.txt,.csv" style={{ ...inputStyle, marginTop: 5 }} /></label>}
      <Submit saving={saving} label={evidenceType === 'note' ? 'Add evidence note' : 'Upload evidence'} Icon={Upload} />
    </Form>
    <CardGrid>{evidence.length ? evidence.map(item => <article key={item.id} style={{ ...cardStyle, background: '#0f172a', borderLeft: `3px solid ${item.status === 'verified' ? '#14b8a6' : '#0ea5e9'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><h3 style={{ marginTop: 0 }}>{item.title}</h3><Status value={item.status} /></div>
      <p style={{ color: '#94a3b8' }}>{item.caseReference || item.caseTitle} · {item.evidenceType} · {new Date(item.capturedAt).toLocaleString()}</p>
      {item.attachmentSha256 && <code style={{ color: '#67e8f9', fontSize: 11, wordBreak: 'break-all' }}>SHA-256 {item.attachmentSha256}</code>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {['captured', 'rejected'].includes(item.status) && <button style={buttonStyle} onClick={() => void mutate(() => moduleShellApi.snapproofos.submitEvidence(item.id))}>Submit for review</button>}
        {item.attachmentId && <><button style={subtleButton} onClick={() => download(item)}><Download size={14} /> Download</button><button style={subtleButton} onClick={() => void mutate(() => moduleShellApi.snapproofos.verifyIntegrity(item.id))}><ShieldCheck size={14} /> Verify hash</button></>}
      </div>
    </article>) : <Empty text="No evidence has been captured." />}</CardGrid>
  </Panel>;
}

function ReviewPanel({ caseDetail, evidence, reports, saving, mutate }: { caseDetail: any; evidence: SnapProofEvidence[]; reports: SnapProofReport[]; saving: boolean; mutate: (task: () => Promise<unknown>) => Promise<void> }) {
  const pendingEvidence = evidence.filter(item => item.status === 'in_review');
  const pendingReports = reports.filter(item => item.status === 'in_review');
  const currentCase = caseDetail?.case as SnapProofCase | undefined;
  return <Panel id="snapproofos-review" title="Reviewer queue" description="Organization administrators approve or reject on the server; opening this UI never grants review authority.">
    <h3>Evidence awaiting decision</h3>
    <CardGrid>{pendingEvidence.length ? pendingEvidence.map(item => <article key={item.id} style={{ ...cardStyle, background: '#0f172a' }}><h4>{item.title}</h4><p style={{ color: '#94a3b8' }}>{item.caseReference} · {item.evidenceType}</p><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button disabled={saving} style={buttonStyle} onClick={() => void mutate(() => moduleShellApi.snapproofos.decideEvidence(item.id, { expectedVersion: item.version, decision: 'approve' }))}><CheckCircle2 size={14} /> Verify</button><button disabled={saving} style={dangerButton} onClick={() => void mutate(() => moduleShellApi.snapproofos.decideEvidence(item.id, { expectedVersion: item.version, decision: 'reject', reason: 'Reviewer rejected evidence' }))}>Reject</button></div></article>) : <Empty text="No evidence is awaiting review." />}</CardGrid>
    <h3 style={{ marginTop: space.xl }}>Case decision</h3>
    {currentCase?.status === 'in_review' ? <div style={{ ...cardStyle, background: '#0f172a' }}><strong>{currentCase.reference} · {currentCase.title}</strong><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}><button style={buttonStyle} onClick={() => void mutate(() => moduleShellApi.snapproofos.decideCase(currentCase.id, { expectedVersion: currentCase.version, decision: 'approve' }))}>Approve case</button><button style={dangerButton} onClick={() => void mutate(() => moduleShellApi.snapproofos.decideCase(currentCase.id, { expectedVersion: currentCase.version, decision: 'reject', reason: 'Reviewer requested changes' }))}>Reject case</button></div></div> : <Empty text="Select a submitted case from Cases to review it. Approval remains blocked until all evidence is verified." />}
    <h3 style={{ marginTop: space.xl }}>Reports awaiting decision</h3>
    <CardGrid>{pendingReports.length ? pendingReports.map(item => <article key={item.id} style={{ ...cardStyle, background: '#0f172a' }}><h4>{item.title}</h4><code style={{ color: '#67e8f9', fontSize: 11, wordBreak: 'break-all' }}>{item.contentHash}</code><div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button style={buttonStyle} onClick={() => void mutate(() => moduleShellApi.snapproofos.decideReport(item.id, { expectedVersion: item.version, decision: 'approve' }))}>Approve report</button><button style={dangerButton} onClick={() => void mutate(() => moduleShellApi.snapproofos.decideReport(item.id, { expectedVersion: item.version, decision: 'reject', reason: 'Reviewer requested changes' }))}>Reject</button></div></article>) : <Empty text="No reports are awaiting review." />}</CardGrid>
  </Panel>;
}

function FindingsPanel({ cases, detail, selectedCaseId, saving, onSelectCase, mutate }: { cases: SnapProofCase[]; detail: any; selectedCaseId: string | null; saving: boolean; onSelectCase: (id: string) => void; mutate: (task: () => Promise<unknown>) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [comment, setComment] = useState('');
  const createFinding = (event: FormEvent) => { event.preventDefault(); if (!selectedCaseId) return; void mutate(async () => { await moduleShellApi.snapproofos.createFinding(selectedCaseId, { title, description, severity }); setTitle(''); setDescription(''); }); };
  const addComment = (event: FormEvent) => { event.preventDefault(); if (!selectedCaseId) return; void mutate(async () => { await moduleShellApi.snapproofos.createComment(selectedCaseId, { body: comment, commentType: 'internal' }); setComment(''); }); };
  return <Panel id="snapproofos-findings" title="Findings and internal review notes" description="Findings are editable workflow records; comments are append-only and custody-linked.">
    <Select label="Active case" value={selectedCaseId || ''} onChange={onSelectCase} required options={cases.map(item => [item.id, `${item.reference} · ${item.title}`])} />
    <div style={{ height: 12 }} />
    <Form onSubmit={createFinding}><Field label="Finding title" value={title} onChange={setTitle} required /><Field label="Description" value={description} onChange={setDescription} required multiline /><Select label="Severity" value={severity} onChange={setSeverity} required options={['info', 'low', 'medium', 'high', 'critical'].map(value => [value, value])} /><Submit saving={saving} label="Record finding" /></Form>
    <Form onSubmit={addComment}><Field label="Append-only internal note" value={comment} onChange={setComment} required multiline /><Submit saving={saving} label="Add internal note" /></Form>
    <h3>Findings</h3><CardGrid>{detail?.findings?.length ? detail.findings.map((item: any) => <article key={item.id} style={{ ...cardStyle, background: '#0f172a' }}><strong>{item.title}</strong><Status value={item.severity} /><p style={{ color: '#94a3b8' }}>{item.description}</p></article>) : <Empty text="No findings recorded for this case." />}</CardGrid>
    <h3>Append-only comments</h3><div style={{ display: 'grid', gap: 8 }}>{detail?.comments?.length ? detail.comments.map((item: any) => <div key={item.id} style={{ ...cardStyle, background: '#0f172a' }}><small style={{ color: '#5eead4' }}>{item.commentType} · {new Date(item.createdAt).toLocaleString()}</small><p style={{ marginBottom: 0 }}>{item.body}</p></div>) : <Empty text="No internal notes recorded." />}</div>
  </Panel>;
}

function ReportsPanel({ cases, reports, selectedCaseId, saving, onSelectCase, mutate }: { cases: SnapProofCase[]; reports: SnapProofReport[]; selectedCaseId: string | null; saving: boolean; onSelectCase: (id: string) => void; mutate: (task: () => Promise<unknown>) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const create = (event: FormEvent) => { event.preventDefault(); if (!selectedCaseId) return; void mutate(async () => { await moduleShellApi.snapproofos.createReport(selectedCaseId, title); setTitle(''); }); };
  const download = (item: SnapProofReport, format: 'json' | 'csv') => void mutate(async () => downloadBlob(await moduleShellApi.snapproofos.downloadReport(item.id, format), `snapproof-${item.id}.${format}`));
  return <Panel id="snapproofos-reports" title="Reports and defensible exports" description="Reports snapshot real case evidence and findings. Only approved reports can generate hashed exports with custody-head provenance.">
    <Form onSubmit={create}><Select label="Case" value={selectedCaseId || ''} onChange={onSelectCase} required options={cases.map(item => [item.id, `${item.reference} · ${item.title}`])} /><Field label="Report title" value={title} onChange={setTitle} required /><Submit saving={saving} label="Create report snapshot" /></Form>
    <CardGrid>{reports.length ? reports.map(item => <article key={item.id} style={{ ...cardStyle, background: '#0f172a' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><h3 style={{ marginTop: 0 }}>{item.title}</h3><Status value={item.status} /></div><p style={{ color: '#94a3b8' }}>{item.caseReference || item.caseTitle}</p><code style={{ color: '#67e8f9', fontSize: 11, wordBreak: 'break-all' }}>Content {item.contentHash}</code><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>{['draft', 'rejected'].includes(item.status) && <button style={buttonStyle} onClick={() => void mutate(() => moduleShellApi.snapproofos.submitReport(item.id))}>Submit report</button>}{item.status === 'approved' && <><button style={subtleButton} onClick={() => download(item, 'json')}><Download size={14} /> JSON</button><button style={subtleButton} onClick={() => download(item, 'csv')}><Download size={14} /> CSV</button></>}</div></article>) : <Empty text="No report snapshots exist." />}</CardGrid>
  </Panel>;
}

function CustodyPanel({ cases, selectedCaseId, events, onSelectCase }: { cases: SnapProofCase[]; selectedCaseId: string | null; events: Array<Record<string, any>>; onSelectCase: (id: string) => void }) {
  const valid = useMemo(() => events.every((event, index) => index === 0 ? event.previousHash === null : event.previousHash === events[index - 1]?.eventHash), [events]);
  return <Panel id="snapproofos-custody" title="Chain of custody" description="Follow who added, reviewed, or changed each item and verify that the displayed evidence trail remains intact.">
    <Select label="Case" value={selectedCaseId || ''} onChange={onSelectCase} required options={cases.map(item => [item.id, `${item.reference} · ${item.title}`])} />
    <div style={{ ...cardStyle, background: valid ? '#06201b' : '#290b13', borderColor: valid ? '#0f766e' : '#be123c', margin: `${space.md}px 0` }}><ShieldCheck size={18} /> <strong>{valid ? 'Displayed custody links are continuous' : 'Displayed custody chain is discontinuous'}</strong></div>
    <div style={{ display: 'grid', gap: 8 }}>{events.length ? events.map(event => <article key={event.id} style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}><strong style={{ color: semantic.accentSuccess }}>Event {event.sequenceNumber}</strong><div><strong>{String(event.eventType).replaceAll('_', ' ')}</strong><div style={{ color: semantic.textMuted, fontSize: fontSize.xs }}>{new Date(event.createdAt).toLocaleString()}</div><code style={{ display: 'block', color: semantic.accentInfo, fontSize: 10, wordBreak: 'break-all', marginTop: 6 }}>{event.eventHash}</code></div></article>) : <Empty text="No custody events exist for this case." />}</div>
  </Panel>;
}

function RetentionPanel({ cases, selectedCase, onSelectCase, saving, mutate }: { cases: SnapProofCase[]; selectedCase?: SnapProofCase; onSelectCase: (id: string) => void; saving: boolean; mutate: (task: () => Promise<unknown>) => Promise<void> }) {
  const [retentionDate, setRetentionDate] = useState('');
  useEffect(() => setRetentionDate(selectedCase?.retentionUntil ? selectedCase.retentionUntil.slice(0, 10) : ''), [selectedCase?.retentionUntil]);
  return <Panel id="snapproofos-retention" title="Retention, legal hold, and archive" description="Organization administrators control retention. Legal hold blocks archive and future purge eligibility.">
    <Select label="Case" value={selectedCase?.id || ''} onChange={onSelectCase} required options={cases.map(item => [item.id, `${item.reference} · ${item.title}`])} />
    {selectedCase ? <div style={{ ...cardStyle, background: '#0f172a', marginTop: space.md }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, alignItems: 'end' }}>
        <label style={labelStyle}>Retain until<input type="date" value={retentionDate} onChange={event => setRetentionDate(event.target.value)} style={{ ...inputStyle, marginTop: 5 }} /></label>
        <button disabled={saving || !retentionDate} style={buttonStyle} onClick={() => void mutate(() => moduleShellApi.snapproofos.setRetention(selectedCase.id, { expectedVersion: selectedCase.version, retentionUntil: new Date(`${retentionDate}T23:59:59Z`).toISOString() }))}>Save retention</button>
        <button disabled={saving} style={selectedCase.legalHold ? dangerButton : subtleButton} onClick={() => void mutate(() => moduleShellApi.snapproofos.setRetention(selectedCase.id, { expectedVersion: selectedCase.version, legalHold: !selectedCase.legalHold }))}>{selectedCase.legalHold ? 'Release legal hold' : 'Place legal hold'}</button>
        <button disabled={saving || selectedCase.legalHold || !['approved', 'rejected'].includes(selectedCase.status)} style={subtleButton} onClick={() => void mutate(() => moduleShellApi.snapproofos.archiveCase(selectedCase.id))}><Archive size={14} /> Archive case</button>
      </div>
    </div> : <Empty text="Select a case to manage retention." />}
  </Panel>;
}

function SettingsPanel() {
  return <Panel id="snapproofos-settings" title="Privacy and access" description="Review how SnapProofOS protects evidence and limits access across your organization.">
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: space.md }}>
      <Info title="Private evidence storage" text="Raw files have no public links. Every download requires an active, authorized account." />
      <Info title="Review authority" text="Members may collect and submit. Organization administrators approve, reject, set legal holds, and archive." />
      <Info title="Accounts and billing" text="Profile, membership, billing, logout, and module access remain in the shared OperatorOS header." />
      <Info title="External integrations" text="Only approved sharing and integration options are available; unreviewed connections remain disabled." />
    </div>
  </Panel>;
}

const labelStyle: React.CSSProperties = { color: '#94a3b8', fontSize: 12 };
function Form({ onSubmit, children }: { onSubmit: (event: FormEvent) => void; children: React.ReactNode }) {
  return <form onSubmit={onSubmit} style={{ ...cardStyle, background: '#0f172a', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: space.md, alignItems: 'end', marginBottom: space.lg }}>{children}</form>;
}
function CardGrid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(270px,1fr))', gap: space.md }}>{children}</div>;
}
function Field({ label, value, onChange, required, multiline }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; multiline?: boolean }) {
  return <label style={labelStyle}>{label}{multiline ? <textarea aria-label={label} required={required} value={value} onChange={event => onChange(event.target.value)} rows={3} style={{ ...inputStyle, marginTop: 5, resize: 'vertical' }} /> : <input aria-label={label} required={required} value={value} onChange={event => onChange(event.target.value)} style={{ ...inputStyle, marginTop: 5 }} />}</label>;
}
function Select({ label, value, onChange, options, required }: { label: string; value: string; onChange: (value: string) => void; options: string[][]; required?: boolean }) {
  return <label style={labelStyle}>{label}<select aria-label={label} required={required} value={value} onChange={event => onChange(event.target.value)} style={{ ...inputStyle, marginTop: 5 }}><option value="">Select…</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;
}
function Submit({ saving, label, Icon = Plus }: { saving: boolean; label: string; Icon?: typeof Plus }) {
  return <button type="submit" disabled={saving} style={{ ...buttonStyle, opacity: saving ? .55 : 1, display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: 7 }}><Icon size={15} /> {saving ? 'Saving…' : label}</button>;
}
function Empty({ text }: { text: string }) {
  return <div style={{ ...cardStyle, background: '#0f172a', color: '#94a3b8', fontSize: fontSize.sm }}>{text}</div>;
}
function Status({ value }: { value: string }) {
  return <span style={{ color: '#5eead4', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5 }}>{value.replaceAll('_', ' ')}</span>;
}
function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt style={{ color: '#94a3b8', fontSize: 11 }}>{label}</dt><dd style={{ margin: '3px 0 0', fontWeight: 800 }}>{value}</dd></div>;
}
function Info({ title, text }: { title: string; text: string }) {
  return <article style={{ ...cardStyle, background: '#0f172a' }}><FileClock size={20} color="#2dd4bf" /><h3>{title}</h3><p style={{ color: '#94a3b8', marginBottom: 0 }}>{text}</p></article>;
}
