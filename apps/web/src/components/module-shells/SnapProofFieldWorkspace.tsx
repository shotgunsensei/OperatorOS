'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Link2, Plus, RefreshCw, Upload } from 'lucide-react';
import { moduleShellApi } from '@/lib/auth';
import {
  listSnapProofCaptures,
  queueSnapProofCapture,
  reconcileSnapProofCaptures,
} from '@/lib/snapproof-offline-queue';

export type SnapProofFieldTab =
  | 'customers'
  | 'jobs'
  | 'capture'
  | 'work'
  | 'costs'
  | 'templates'
  | 'team'
  | 'activity'
  | 'reports'
  | 'share'
  | 'exports'
  | 'branding';
type Row = Record<string, any>;

const colors = {
  panel: '#17191d',
  raised: '#202329',
  line: '#393d45',
  text: '#f5f5f5',
  muted: '#a6a9b0',
  red: '#dc2626',
  redSoft: '#3a1115',
  green: '#34d399',
};
const input: React.CSSProperties = {
  width: '100%',
  minHeight: 43,
  boxSizing: 'border-box',
  border: `1px solid ${colors.line}`,
  borderRadius: 6,
  background: '#111317',
  color: colors.text,
  padding: '10px 11px',
  font: 'inherit',
};
const button: React.CSSProperties = {
  minHeight: 42,
  border: 0,
  borderRadius: 6,
  background: colors.red,
  color: 'white',
  padding: '10px 15px',
  fontWeight: 850,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
};
const quiet: React.CSSProperties = {
  ...button,
  background: colors.raised,
  border: `1px solid ${colors.line}`,
  color: colors.text,
};
const card: React.CSSProperties = {
  border: `1px solid ${colors.line}`,
  borderRadius: 8,
  background: colors.raised,
  padding: 16,
};
const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,240px),1fr))',
  gap: 12,
};

const errorText = (error: any) =>
  error?.error || error?.message || 'SnapProofOS could not save that change.';
const money = (cents: unknown) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    Number(cents || 0) / 100,
  );
const base64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] || '');
    reader.readAsDataURL(file);
  });
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function SnapProofFieldWorkspace({
  tab,
  selectedJobId,
  onSelectJob,
  onOpenJob = onSelectJob,
}: {
  tab: SnapProofFieldTab;
  selectedJobId: string | null;
  onSelectJob: (id: string) => void;
  onOpenJob?: (id: string) => void;
}) {
  const [customers, setCustomers] = useState<Row[]>([]);
  const [jobs, setJobs] = useState<Row[]>([]);
  const [templates, setTemplates] = useState<Row[]>([]);
  const [team, setTeam] = useState<Row[]>([]);
  const [events, setEvents] = useState<Row[]>([]);
  const [branding, setBranding] = useState<Row>({});
  const [exports, setExports] = useState<Row[]>([]);
  const [detail, setDetail] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [queued, setQueued] = useState(0);
  const [online, setOnline] = useState(typeof navigator === 'undefined' || navigator.onLine);
  const [lastShare, setLastShare] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tasks: Array<Promise<void>> = [];
      let loadedJobs: Row[] | null = null;
      const needsJobs = ['jobs', 'capture', 'work', 'costs', 'templates', 'reports', 'share', 'exports'].includes(tab);
      const needsCustomers = ['customers', 'jobs'].includes(tab);
      const needsTeam = tab === 'jobs';
      if (needsCustomers) tasks.push(moduleShellApi.snapproofos.customers().then(rows => setCustomers(rows.customers)));
      if (needsJobs) tasks.push(moduleShellApi.snapproofos.jobs().then(rows => {
        loadedJobs = rows.jobs;
        setJobs(rows.jobs);
      }));
      if (tab === 'templates') tasks.push(moduleShellApi.snapproofos.templates().then(rows => setTemplates(rows.templates)));
      if (needsTeam) tasks.push(moduleShellApi.snapproofos.team().then(rows => setTeam(rows.members || [])));
      if (tab === 'activity') tasks.push(moduleShellApi.snapproofos.activity().then(rows => setEvents(rows.events || [])));
      if (tab === 'branding') tasks.push(moduleShellApi.snapproofos.branding().then(value => setBranding(value.branding || {})));
      if (['reports', 'share', 'exports'].includes(tab)) tasks.push(moduleShellApi.snapproofos.listExports().then(rows => setExports(rows.exports)));
      if (tab === 'capture') tasks.push(listSnapProofCaptures().then(queue => setQueued(queue.length)));
      await Promise.all(tasks);
      const jobRows = loadedJobs as Row[] | null;
      if (!jobRows) return;
      const current =
        selectedJobId && jobRows.some((item) => item.id === selectedJobId)
          ? selectedJobId
          : jobRows[0]?.id;
      if (current && !selectedJobId) onSelectJob(current);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setLoading(false);
    }
  }, [selectedJobId, onSelectJob, tab]);
  const loadDetail = useCallback(async () => {
    if (!selectedJobId || !['jobs', 'capture', 'work', 'costs', 'templates', 'reports', 'share', 'exports'].includes(tab)) {
      setDetail(null);
      return;
    }
    try {
      setDetail(await moduleShellApi.snapproofos.job(selectedJobId));
    } catch (reason) {
      setError(errorText(reason));
    }
  }, [selectedJobId, tab]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);
  const reconcile = useCallback(async () => {
    if (!navigator.onLine) return;
    const result = await reconcileSnapProofCaptures((item) =>
      moduleShellApi.snapproofos.uploadJobFile(item.jobId, item.payload),
    );
    setQueued(result.remaining);
    if (result.completed) {
      await load();
      await loadDetail();
    }
  }, [load, loadDetail]);
  useEffect(() => {
    const connected = () => {
      setOnline(true);
      void reconcile();
    };
    const disconnected = () => setOnline(false);
    window.addEventListener('online', connected);
    window.addEventListener('offline', disconnected);
    void reconcile();
    return () => {
      window.removeEventListener('online', connected);
      window.removeEventListener('offline', disconnected);
    };
  }, [reconcile]);
  async function mutate(task: () => Promise<unknown>) {
    setSaving(true);
    setError(null);
    try {
      await task();
      await load();
      await loadDetail();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setSaving(false);
    }
  }
  const selected = detail?.job as Row | undefined;
  if (loading) return <State>Loading field operations…</State>;
  return (
    <section
      id={`snapproofos-${tab}`}
      data-testid="snapproofos-field-workspace"
      style={{ color: colors.text }}
    >
      {error && (
        <div
          role="alert"
          style={{
            ...card,
            background: colors.redSoft,
            borderColor: colors.red,
            color: '#fecaca',
            marginBottom: 14,
          }}
        >
          {error}
        </div>
      )}
      {!online && (
        <div role="status" style={{ ...card, borderColor: '#b45309', marginBottom: 14 }}>
          Offline capture mode is active. New photos remain on this device until a connection
          returns.
        </div>
      )}
      {queued > 0 && (
        <div
          role="status"
          style={{
            ...card,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            marginBottom: 14,
          }}
        >
          <span>
            {queued} capture{queued === 1 ? '' : 's'} waiting to upload
          </span>
          <button style={quiet} onClick={() => void reconcile()} disabled={!online}>
            <RefreshCw size={15} />
            Retry
          </button>
        </div>
      )}
      {tab === 'customers' && (
        <Customers customers={customers} saving={saving} mutate={mutate} />
      )}{' '}
      {tab === 'jobs' && (
        <Jobs
          customers={customers}
          jobs={jobs}
          team={team}
          selected={selected}
          selectedJobId={selectedJobId}
          onSelect={onOpenJob}
          saving={saving}
          mutate={mutate}
        />
      )}{' '}
      {tab === 'capture' && (
        <Capture
          jobs={jobs}
          detail={detail}
          selectedJobId={selectedJobId}
          onSelect={onSelectJob}
          saving={saving}
          queued={queued}
          setQueued={setQueued}
          mutate={mutate}
        />
      )}{' '}
      {tab === 'work' && (
        <Work
          jobs={jobs}
          detail={detail}
          selectedJobId={selectedJobId}
          onSelect={onSelectJob}
          saving={saving}
          mutate={mutate}
        />
      )}{' '}
      {tab === 'costs' && (
        <Costs
          jobs={jobs}
          detail={detail}
          selectedJobId={selectedJobId}
          onSelect={onSelectJob}
          saving={saving}
          mutate={mutate}
        />
      )}{' '}
      {tab === 'templates' && (
        <Templates
          jobs={jobs}
          templates={templates}
          selectedJobId={selectedJobId}
          onSelect={onSelectJob}
          saving={saving}
          mutate={mutate}
        />
      )}{' '}
      {tab === 'team' && <Team rows={team} />} {tab === 'activity' && <Activity rows={events} />}{' '}
      {tab === 'branding' && <Branding value={branding} saving={saving} mutate={mutate} />}{' '}
      {lastShare && (
        <div style={{ ...card, marginTop: 14, borderColor: colors.green }}>
          <strong>Secure link created</strong>
          <p style={{ color: colors.muted }}>
            This token is shown once. Copy it before leaving this page.
          </p>
          <input
            aria-label="New secure share URL"
            readOnly
            value={`${window.location.origin}${lastShare}`}
            style={input}
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      )}
      {['reports', 'share', 'exports'].includes(tab) && !selected && (
        <State>Create or select a job before generating a report, export, or secure share.</State>
      )}
      {['reports', 'share', 'exports'].includes(tab) && selected && (
        <Reports
          detail={detail}
          exports={exports}
          saving={saving}
          mutate={mutate}
          setLastShare={setLastShare}
        />
      )}
    </section>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ borderLeft: `4px solid ${colors.red}`, paddingLeft: 12, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 24 }}>{title}</h2>
        <p style={{ margin: 0, color: colors.muted }}>{description}</p>
      </div>
      {children}
    </div>
  );
}
function State({ children }: { children: React.ReactNode }) {
  return <div style={{ ...card, color: colors.muted }}>{children}</div>;
}
function Label({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 5, color: colors.muted, fontSize: 12, fontWeight: 750 }}>
      {name}
      {children}
    </label>
  );
}
function Text({
  name,
  value,
  set,
  required,
  type = 'text',
}: {
  name: string;
  value: string;
  set: (value: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <Label name={name}>
      <input
        aria-label={name}
        type={type}
        required={required}
        value={value}
        onChange={(event) => set(event.target.value)}
        style={input}
      />
    </Label>
  );
}
function Select({
  name,
  value,
  set,
  rows,
  required,
}: {
  name: string;
  value: string;
  set: (value: string) => void;
  rows: Array<[string, string]>;
  required?: boolean;
}) {
  return (
    <Label name={name}>
      <select
        aria-label={name}
        required={required}
        value={value}
        onChange={(event) => set(event.target.value)}
        style={input}
      >
        <option value="">Select…</option>
        {rows.map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>
    </Label>
  );
}
function Submit({ saving, label }: { saving: boolean; label: string }) {
  return (
    <button type="submit" style={button} disabled={saving}>
      <Plus size={15} />
      {saving ? 'Saving…' : label}
    </button>
  );
}
function Form({
  children,
  onSubmit,
}: {
  children: React.ReactNode;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} style={{ ...card, ...grid, alignItems: 'end', marginBottom: 16 }}>
      {children}
    </form>
  );
}
function Status({ value }: { value: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 900,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        color: value === 'completed' || value === 'approved' ? colors.green : '#fca5a5',
      }}
    >
      {value.replaceAll('_', ' ')}
    </span>
  );
}

function Customers({
  customers,
  saving,
  mutate,
}: {
  customers: Row[];
  saving: boolean;
  mutate: (task: () => Promise<unknown>) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [search, setSearch] = useState('');
  const visibleCustomers = customers.filter((item) =>
    [item.name, item.company, item.email]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search.toLowerCase())),
  );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void mutate(async () => {
      await moduleShellApi.snapproofos.createCustomer({
        name,
        email: email || null,
        company: company || null,
        phone: phone || null,
      });
      setName('');
      setEmail('');
      setCompany('');
      setPhone('');
    });
  };
  return (
    <Section
      title="Customers"
      description="Customer history stays attached to every field job and approved report."
    >
      <Form onSubmit={submit}>
        <Text name="Customer name" value={name} set={setName} required />
        <Text name="Company" value={company} set={setCompany} />
        <Text name="Email" value={email} set={setEmail} type="email" />
        <Text name="Phone" value={phone} set={setPhone} />
        <Submit saving={saving} label="Create customer" />
      </Form>
      <div style={{ ...card, marginBottom: 16 }}>
        <Text name="Search customers" value={search} set={setSearch} />
      </div>
      <div style={grid}>
        {visibleCustomers.length ? (
          visibleCustomers.map((item) => (
            <article key={item.id} style={card}>
              <h3 style={{ margin: '0 0 5px' }}>{item.name}</h3>
              <div style={{ color: colors.muted }}>{item.company || 'Independent customer'}</div>
              <p>
                {item.email || 'No email'} · {item.phone || 'No phone'}
              </p>
              <strong>{item.jobCount || 0} jobs</strong>
              <div style={{ marginTop: 12 }}>
                <button
                  style={quiet}
                  disabled={saving}
                  onClick={() =>
                    void mutate(() => moduleShellApi.snapproofos.archiveCustomer(item.id))
                  }
                >
                  Archive customer
                </button>
              </div>
            </article>
          ))
        ) : (
          <State>No customers yet.</State>
        )}
      </div>
    </Section>
  );
}

function Jobs({
  customers,
  jobs,
  team,
  selected,
  selectedJobId,
  onSelect,
  saving,
  mutate,
}: {
  customers: Row[];
  jobs: Row[];
  team: Row[];
  selected?: Row;
  selectedJobId: string | null;
  onSelect: (id: string) => void;
  saving: boolean;
  mutate: (task: () => Promise<unknown>) => void;
}) {
  const [title, setTitle] = useState('');
  const [customerId, setCustomer] = useState('');
  const [location, setLocation] = useState('');
  const [jobType, setJobType] = useState('field_service');
  const [assignedToId, setAssignedToId] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const visibleJobs = jobs.filter(
    (item) =>
      (!status || item.status === status) &&
      (!search ||
        [item.reference, item.title, item.customerName, item.assigneeName]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search.toLowerCase()))),
  );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void mutate(async () => {
      const result = await moduleShellApi.snapproofos.createJob({
        title,
        customerId: customerId || null,
        siteAddress: location || null,
        jobType,
        assignedToId: assignedToId || null,
        clientMutationId: crypto.randomUUID(),
        sourceContext: { captureChannel: 'operatoros_web' },
      });
      setTitle('');
      setLocation('');
      setAssignedToId('');
      onSelect(result.job.id);
    });
  };
  return (
    <Section
      title="Jobs"
      description="Schedule, assign, document, complete, review, and archive field work without losing proof history."
    >
      <Form onSubmit={submit}>
        <Text name="Job title" value={title} set={setTitle} required />
        <Select
          name="Customer"
          value={customerId}
          set={setCustomer}
          rows={customers.map((item) => [item.id, item.name])}
        />
        <Text name="Location" value={location} set={setLocation} />
        <Text name="Job type" value={jobType} set={setJobType} required />
        <Select
          name="Assignee"
          value={assignedToId}
          set={setAssignedToId}
          rows={team.map((item) => [item.id, item.name || item.email])}
        />
        <Submit saving={saving} label="Create job" />
      </Form>
      <div style={{ ...card, ...grid, marginBottom: 16 }}>
        <Text name="Search jobs" value={search} set={setSearch} />
        <Select
          name="Filter by status"
          value={status}
          set={setStatus}
          rows={['draft', 'in_progress', 'completed', 'archived'].map((value) => [
            value,
            value.replaceAll('_', ' '),
          ])}
        />
      </div>
      <div className="snapproof-job-layout">
        <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
          {visibleJobs.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              style={{
                ...quiet,
                textAlign: 'left',
                display: 'block',
                borderColor: item.id === selectedJobId ? colors.red : colors.line,
              }}
            >
              <strong>{item.reference}</strong>
              <div>{item.title}</div>
              <Status value={item.status} />
            </button>
          ))}
        </div>
        {selected ? (
          <article style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <small style={{ color: '#fca5a5' }}>{selected.reference}</small>
                <h3>{selected.title}</h3>
              </div>
              <Status value={selected.status} />
            </div>
            <p style={{ color: colors.muted }}>{selected.description || 'No job description.'}</p>
            <div style={grid}>
              <span>
                <small>Customer</small>
                <br />
                <strong>{selected.customerName || 'Unassigned'}</strong>
              </span>
              <span>
                <small>Location</small>
                <br />
                <strong>{selected.siteAddress || 'Not set'}</strong>
              </span>
              <span>
                <small>Assignee</small>
                <br />
                <strong>{selected.assigneeName || 'Unassigned'}</strong>
              </span>
              <span>
                <small>Proof review</small>
                <br />
                <Status value={selected.proofStatus} />
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 15 }}>
              {selected.status === 'draft' && (
                <button
                  style={button}
                  onClick={() =>
                    void mutate(() =>
                      moduleShellApi.snapproofos.updateJob(selected.id, { status: 'in_progress' }),
                    )
                  }
                >
                  Start job
                </button>
              )}
              {selected.status === 'in_progress' && (
                <button
                  style={button}
                  onClick={() =>
                    void mutate(() =>
                      moduleShellApi.snapproofos.updateJob(selected.id, { status: 'completed' }),
                    )
                  }
                >
                  Mark field work complete
                </button>
              )}
              {selected.status === 'completed' && (
                <button
                  style={quiet}
                  onClick={() =>
                    void mutate(() => moduleShellApi.snapproofos.submitCase(selected.id))
                  }
                >
                  Submit proof for review
                </button>
              )}
              {selected.status !== 'archived' && (
                <button
                  style={quiet}
                  onClick={() =>
                    void mutate(() =>
                      moduleShellApi.snapproofos.updateJob(selected.id, { status: 'archived' }),
                    )
                  }
                >
                  Archive job
                </button>
              )}
            </div>
          </article>
        ) : (
          <State>Select a job.</State>
        )}
      </div>
    </Section>
  );
}

function Capture({
  jobs,
  detail,
  selectedJobId,
  onSelect,
  saving,
  queued,
  setQueued,
  mutate,
}: {
  jobs: Row[];
  detail: Row | null;
  selectedJobId: string | null;
  onSelect: (id: string) => void;
  saving: boolean;
  queued: number;
  setQueued: (value: number) => void;
  mutate: (task: () => Promise<unknown>) => void;
}) {
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || !selectedJobId) return;
    const clientMutationId = crypto.randomUUID();
    const payload = {
      title,
      caption: caption || null,
      fileType: file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('audio/')
          ? 'audio'
          : 'document',
      capturedAt: new Date().toISOString(),
      sourceType: 'mobile_capture',
      originalName: file.name,
      declaredMimeType: file.type,
      contentBase64: await base64(file),
      clientMutationId,
      privacyMetadata: { capture: 'field', exifPolicy: 'strip-app1-before-storage' },
    };
    if (!navigator.onLine) {
      await queueSnapProofCapture({
        id: clientMutationId,
        jobId: selectedJobId,
        payload,
        createdAt: new Date().toISOString(),
      });
      setQueued(queued + 1);
      setTitle('');
      setCaption('');
      setFile(null);
      return;
    }
    void mutate(async () => {
      try {
        await moduleShellApi.snapproofos.uploadJobFile(selectedJobId, payload);
      } catch (error) {
        await queueSnapProofCapture({
          id: clientMutationId,
          jobId: selectedJobId,
          payload,
          createdAt: new Date().toISOString(),
        });
        setQueued(queued + 1);
        throw error;
      }
      setTitle('');
      setCaption('');
      setFile(null);
    });
  };
  return (
    <Section
      title="Mobile capture"
      description="Camera, document, and voice evidence is MIME-validated, scanned, hashed, EXIF-scrubbed for JPEGs, and retried safely after reconnect."
    >
      <Form onSubmit={(event) => void submit(event)}>
        <Select
          name="Job"
          value={selectedJobId || ''}
          set={onSelect}
          required
          rows={jobs.map((item) => [item.id, `${item.reference} · ${item.title}`])}
        />
        <Text name="Title" value={title} set={setTitle} required />
        <Text name="Caption" value={caption} set={setCaption} />
        <Label name="Camera, file, or voice note">
          <input
            aria-label="Camera, file, or voice note"
            type="file"
            capture="environment"
            accept="image/*,.pdf,.txt,.csv,audio/wav,audio/mpeg,audio/mp4"
            required
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            style={input}
          />
        </Label>
        <Submit saving={saving} label="Secure capture" />
      </Form>
      <State>
        Files remain private. Clean scan state is required before retrieval; infected content is
        quarantined and pending scans do not download.
      </State>
      <div style={{ ...grid, marginTop: 16 }}>
        {detail?.files?.length ? (
          detail.files.map((item: Row) => (
            <article key={item.id} style={card}>
              <Status value={item.scanStatus || item.status} />
              <h3>{item.title}</h3>
              <p style={{ color: colors.muted }}>{item.caption || item.originalName}</p>
              <small>
                Order {item.sortOrder} · {Math.ceil(Number(item.sizeBytes || 0) / 1024)} KB
              </small>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <button
                  style={quiet}
                  disabled={item.scanStatus !== 'clean'}
                  onClick={() =>
                    void moduleShellApi.snapproofos
                      .downloadJobFile(item.id)
                      .then((blob) => saveBlob(blob, item.originalName || item.title))
                  }
                >
                  <Download size={14} />
                  Download
                </button>
                <button
                  style={quiet}
                  disabled={saving}
                  onClick={() =>
                    void mutate(() => moduleShellApi.snapproofos.deleteJobFile(item.id))
                  }
                >
                  Remove
                </button>
              </div>
            </article>
          ))
        ) : (
          <State>No captured files for this job.</State>
        )}
      </div>
    </Section>
  );
}

function Work({
  jobs,
  detail,
  selectedJobId,
  onSelect,
  saving,
  mutate,
}: {
  jobs: Row[];
  detail: Row | null;
  selectedJobId: string | null;
  onSelect: (id: string) => void;
  saving: boolean;
  mutate: (task: () => Promise<unknown>) => void;
}) {
  const [issue, setIssue] = useState('');
  const [cause, setCause] = useState('');
  const [resolution, setResolution] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [note, setNote] = useState('');
  const [visibility, setVisibility] = useState('internal');
  const [voice, setVoice] = useState<File | null>(null);
  const finding = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedJobId) return;
    void mutate(async () => {
      await moduleShellApi.snapproofos.createJobFinding(selectedJobId, {
        issue,
        cause,
        resolution: resolution || null,
        severity,
      });
      setIssue('');
      setCause('');
      setResolution('');
    });
  };
  const addNote = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedJobId) return;
    void mutate(async () => {
      await moduleShellApi.snapproofos.createJobNote(selectedJobId, {
        body: note,
        noteType: voice ? 'voice_transcript' : visibility,
        audioName: voice?.name,
        declaredMimeType: voice?.type,
        contentBase64: voice ? await base64(voice) : undefined,
      });
      setNote('');
      setVoice(null);
    });
  };
  return (
    <Section
      title="Findings and notes"
      description="Record the issue, cause, resolution, recommendation, severity, and the exact audience for every note."
    >
      <Select
        name="Job"
        value={selectedJobId || ''}
        set={onSelect}
        required
        rows={jobs.map((item) => [item.id, `${item.reference} · ${item.title}`])}
      />
      <div style={{ height: 12 }} />
      <Form onSubmit={finding}>
        <Text name="Issue" value={issue} set={setIssue} required />
        <Text name="Cause" value={cause} set={setCause} required />
        <Text name="Resolution" value={resolution} set={setResolution} />
        <Select
          name="Severity"
          value={severity}
          set={setSeverity}
          required
          rows={['low', 'medium', 'high', 'critical'].map((value) => [value, value])}
        />
        <Submit saving={saving} label="Add finding" />
      </Form>
      <Form onSubmit={addNote}>
        <Text name="Note" value={note} set={setNote} required />
        <Select
          name="Audience"
          value={visibility}
          set={setVisibility}
          required
          rows={[
            ['internal', 'Internal team'],
            ['customer_facing', 'Customer-facing'],
          ]}
        />
        <Label name="Optional voice note">
          <input
            aria-label="Optional voice note"
            type="file"
            accept="audio/wav,audio/mpeg,audio/mp4"
            onChange={(event) => setVoice(event.target.files?.[0] || null)}
            style={input}
          />
        </Label>
        <Submit saving={saving} label="Add note" />
      </Form>
      <div style={grid}>
        {detail?.findings?.map((item: Row) => (
          <article key={item.id} style={card}>
            <Status value={item.severity} />
            <h3>{item.issue || item.title}</h3>
            <p>
              <strong>Cause:</strong> {item.cause || item.description}
            </p>
            <p>
              <strong>Resolution:</strong> {item.resolution || 'Pending'}
            </p>
          </article>
        ))}
        {detail?.notes?.map((item: Row) => (
          <article key={item.id} style={card}>
            <Status value={item.noteType} />
            <p>{item.body}</p>
            {item.audioAttachmentId && (
              <button
                style={quiet}
                onClick={() =>
                  void moduleShellApi.snapproofos
                    .downloadVoiceNote(item.id)
                    .then((blob) => saveBlob(blob, `voice-note-${item.id}.mp3`))
                }
              >
                <Download size={14} />
                Play or download voice note
              </button>
            )}
          </article>
        ))}
      </div>
    </Section>
  );
}

function Costs({
  jobs,
  detail,
  selectedJobId,
  onSelect,
  saving,
  mutate,
}: {
  jobs: Row[];
  detail: Row | null;
  selectedJobId: string | null;
  onSelect: (id: string) => void;
  saving: boolean;
  mutate: (task: () => Promise<unknown>) => void;
}) {
  const [part, setPart] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState('0');
  const [description, setDescription] = useState('');
  const [hours, setHours] = useState('1');
  const [rate, setRate] = useState('0');
  const addPart = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedJobId) return;
    void mutate(async () => {
      await moduleShellApi.snapproofos.createPart(selectedJobId, {
        name: part,
        quantity: Number(quantity),
        unitPriceCents: Math.round(Number(price) * 100),
      });
      setPart('');
    });
  };
  const addLabor = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedJobId) return;
    void mutate(async () => {
      await moduleShellApi.snapproofos.createLabor(selectedJobId, {
        description,
        hours: Number(hours),
        rateCents: Math.round(Number(rate) * 100),
      });
      setDescription('');
    });
  };
  const partTotal = useMemo(
    () =>
      detail?.parts?.reduce((sum: number, row: Row) => sum + Number(row.totalPriceCents || 0), 0) ||
      0,
    [detail],
  );
  const laborTotal = useMemo(
    () =>
      detail?.labor?.reduce((sum: number, row: Row) => sum + Number(row.totalCents || 0), 0) || 0,
    [detail],
  );
  return (
    <Section
      title="Parts and labor"
      description="Customer price, internal cost, hours, rates, and historical report totals use integer cents and persisted quantities."
    >
      <Select
        name="Job"
        value={selectedJobId || ''}
        set={onSelect}
        required
        rows={jobs.map((item) => [item.id, `${item.reference} · ${item.title}`])}
      />
      <div style={{ height: 12 }} />
      <Form onSubmit={addPart}>
        <Text name="Part" value={part} set={setPart} required />
        <Text name="Quantity" value={quantity} set={setQuantity} type="number" />
        <Text name="Unit price" value={price} set={setPrice} type="number" />
        <Submit saving={saving} label="Add part" />
      </Form>
      <Form onSubmit={addLabor}>
        <Text name="Labor description" value={description} set={setDescription} required />
        <Text name="Hours" value={hours} set={setHours} type="number" />
        <Text name="Hourly rate" value={rate} set={setRate} type="number" />
        <Submit saving={saving} label="Add labor" />
      </Form>
      <div style={grid}>
        <article style={card}>
          <small>Parts total</small>
          <h3>{money(partTotal)}</h3>
          {detail?.parts?.map((row: Row) => (
            <p key={row.id}>
              {row.name} × {row.quantity} — {money(row.totalPriceCents)}
            </p>
          ))}
        </article>
        <article style={card}>
          <small>Labor total</small>
          <h3>{money(laborTotal)}</h3>
          {detail?.labor?.map((row: Row) => (
            <p key={row.id}>
              {row.description} — {row.hours}h — {money(row.totalCents)}
            </p>
          ))}
        </article>
        <article style={{ ...card, borderColor: colors.red }}>
          <small>Job total</small>
          <h3>{money(partTotal + laborTotal)}</h3>
        </article>
      </div>
    </Section>
  );
}

function Templates({
  jobs,
  templates,
  selectedJobId,
  onSelect,
  saving,
  mutate,
}: {
  jobs: Row[];
  templates: Row[];
  selectedJobId: string | null;
  onSelect: (id: string) => void;
  saving: boolean;
  mutate: (task: () => Promise<unknown>) => void;
}) {
  return (
    <Section
      title="Job templates"
      description="System and organization templates apply a durable checklist and default job type to active work."
    >
      <Select
        name="Job"
        value={selectedJobId || ''}
        set={onSelect}
        rows={jobs.map((item) => [item.id, `${item.reference} · ${item.title}`])}
      />
      <div style={{ height: 12 }} />
      <div style={grid}>
        {templates.map((item) => (
          <article key={item.id} style={card}>
            <Status value={item.isSystem ? 'system' : 'organization'} />
            <h3>{item.name}</h3>
            <p style={{ color: colors.muted }}>{item.description || 'Reusable field workflow'}</p>
            <p>
              {item.sections?.length || 0} sections · {item.defaultJobType}
            </p>
            <button
              disabled={saving || !selectedJobId}
              style={button}
              onClick={() =>
                selectedJobId &&
                void mutate(() => moduleShellApi.snapproofos.applyTemplate(selectedJobId, item.id))
              }
            >
              Apply template
            </button>
          </article>
        ))}
      </div>
    </Section>
  );
}
function Team({ rows }: { rows: Row[] }) {
  return (
    <Section
      title="Team and assignment"
      description="Membership, roles, and SnapProofOS access are projected from OperatorOS—there is no second identity system."
    >
      <div style={grid}>
        {rows.map((item) => (
          <article key={item.id} style={card}>
            <h3>{item.name || item.email}</h3>
            <p style={{ color: colors.muted }}>{item.email}</p>
            <Status value={`${item.role} · ${item.moduleAccess}`} />
          </article>
        ))}
      </div>
    </Section>
  );
}
function Activity({ rows }: { rows: Row[] }) {
  return (
    <Section
      title="Activity and audit"
      description="Field actions are written to the shared tenant-scoped OperatorOS activity stream."
    >
      <div style={{ display: 'grid', gap: 8 }}>
        {rows.length ? (
          rows.map((item) => (
            <article key={item.id} style={card}>
              <Status value={item.event_type || item.eventType} />
              <strong style={{ display: 'block', marginTop: 5 }}>{item.summary}</strong>
              <small style={{ color: colors.muted }}>
                {new Date(item.created_at || item.createdAt).toLocaleString()}
              </small>
            </article>
          ))
        ) : (
          <State>No activity yet.</State>
        )}
      </div>
    </Section>
  );
}
function Branding({
  value,
  saving,
  mutate,
}: {
  value: Row;
  saving: boolean;
  mutate: (task: () => Promise<unknown>) => void;
}) {
  const [company, setCompany] = useState(value.companyName || '');
  const [accent, setAccent] = useState(value.accentColor || '#dc2626');
  const [footer, setFooter] = useState(value.footerText || '');
  const [email, setEmail] = useState(value.contactEmail || '');
  const [phone, setPhone] = useState(value.contactPhone || '');
  const [website, setWebsite] = useState(value.website || '');
  const [logo, setLogo] = useState<File | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void mutate(async () => {
      await moduleShellApi.snapproofos.updateBranding({
        companyName: company || null,
        accentColor: accent,
        footerText: footer || null,
        contactEmail: email || null,
        contactPhone: phone || null,
        website: website || null,
      });
      if (logo) {
        await moduleShellApi.snapproofos.uploadBrandingLogo({
          originalName: logo.name,
          declaredMimeType: logo.type,
          contentBase64: await base64(logo),
        });
        setLogo(null);
      }
    });
  };
  return (
    <Section
      title="Organization branding"
      description="Approved reports snapshot these values so later brand changes cannot rewrite historical documents."
    >
      <Form onSubmit={submit}>
        <Text name="Company name" value={company} set={setCompany} />
        <Text name="Accent color" value={accent} set={setAccent} type="color" />
        <Text name="Report footer" value={footer} set={setFooter} />
        <Text name="Contact email" value={email} set={setEmail} type="email" />
        <Text name="Contact phone" value={phone} set={setPhone} />
        <Text name="Website" value={website} set={setWebsite} type="url" />
        <Label name="Report logo (PNG or JPEG)">
          <input
            aria-label="Report logo (PNG or JPEG)"
            type="file"
            accept="image/png,image/jpeg"
            onChange={(event) => setLogo(event.target.files?.[0] || null)}
            style={input}
          />
        </Label>
        <Submit saving={saving} label="Save branding" />
      </Form>
      {value.logoAttachmentId && (
        <button
          style={quiet}
          onClick={() =>
            void moduleShellApi.snapproofos
              .downloadBrandingLogo()
              .then((blob) => saveBlob(blob, 'snapproofos-organization-logo'))
          }
        >
          <Download size={14} />
          Download current logo
        </button>
      )}
      <State>
        Profile, team, usage, plan, entitlement, and billing controls remain in OperatorOS.
      </State>
    </Section>
  );
}

function Reports({
  detail,
  exports,
  saving,
  mutate,
  setLastShare,
}: {
  detail: Row | null;
  exports: Row[];
  saving: boolean;
  mutate: (task: () => Promise<unknown>) => void;
  setLastShare: (url: string | null) => void;
}) {
  const reports = detail?.reports || [];
  const job = detail?.job;
  const create = () =>
    job &&
    void mutate(() =>
      moduleShellApi.snapproofos.generateReport({
        jobId: job.id,
        title: `${job.reference} Client Field Report`,
        reportType: 'full_report',
        tone: 'client_friendly',
      }),
    );
  const exportReport = (reportId: string, format: 'pdf' | 'docx') =>
    void mutate(async () => {
      const result = await moduleShellApi.snapproofos.createReportExport(reportId, format);
      saveBlob(
        await moduleShellApi.snapproofos.downloadExport(result.export.id),
        result.export.filename,
      );
    });
  const share = (reportId: string) =>
    void mutate(async () => {
      const result = await moduleShellApi.snapproofos.createShareLink(reportId, {
        expiresInDays: 7,
        allowDownload: true,
      });
      setLastShare(result.shareLink.url);
    });
  return (
    <div style={{ marginTop: 22 }}>
      <Section
        title="Reports, exports, and secure shares"
        description="Drafts move through review and approval. Valid PDF/DOCX bytes and their SHA-256 hashes are persisted; share tokens expire and can be revoked."
      >
        <button style={button} onClick={create} disabled={saving || !job}>
          Generate draft report
        </button>
        <div style={{ ...grid, marginTop: 12 }}>
          {reports.map((item: Row) => (
            <article key={item.id} style={card}>
              <Status value={item.status} />
              <h3>{item.title}</h3>
              <code style={{ fontSize: 10, color: '#fca5a5', wordBreak: 'break-all' }}>
                {item.contentHash}
              </code>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
                {['draft', 'rejected'].includes(item.status) && (
                  <button
                    style={quiet}
                    onClick={() =>
                      void mutate(() => moduleShellApi.snapproofos.submitReport(item.id))
                    }
                  >
                    Submit for review
                  </button>
                )}
                {item.status === 'approved' && (
                  <>
                    <button style={quiet} onClick={() => exportReport(item.id, 'pdf')}>
                      <Download size={14} />
                      PDF
                    </button>
                    <button style={quiet} onClick={() => exportReport(item.id, 'docx')}>
                      <Download size={14} />
                      DOCX
                    </button>
                    <button style={quiet} onClick={() => share(item.id)}>
                      <Link2 size={14} />
                      Share
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
        <h3>Export history</h3>
        <div style={grid}>
          {exports
            .filter((item) => item.caseId === job?.id)
            .map((item) => (
              <article key={item.id} style={card}>
                <Status value={item.format} />
                <p>{item.filename}</p>
                <code style={{ fontSize: 10, wordBreak: 'break-all' }}>{item.exportHash}</code>
                <button
                  style={quiet}
                  onClick={() =>
                    void moduleShellApi.snapproofos
                      .downloadExport(item.id)
                      .then((blob) => saveBlob(blob, item.filename))
                  }
                >
                  <Download size={14} />
                  Download verified file
                </button>
              </article>
            ))}
        </div>
      </Section>
    </div>
  );
}
