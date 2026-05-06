'use client';

/**
 * Gate 2 — Super Admin Platform Command.
 *
 * Single-component design with internal sub-route state ("view") so
 * the surface stays one focused file: tabs for Dashboard / Tenants /
 * Modules / Billing / Pricing / Health / Audit, plus inline detail panes
 * for tenant/:id and module/:slug. Reuses the SaasLayout color palette.
 *
 * All API calls go through `apiCall` which threads JWT from localStorage
 * (matches AuthProvider's contract) and surfaces backend error codes
 * verbatim so admins see the policy reason for any 403/404/409.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../AuthProvider';

const colors = {
  bg: '#010409',
  bgSecondary: '#0d1117',
  bgHover: '#161b22',
  border: '#21262d',
  text: '#c9d1d9',
  textMuted: '#8b949e',
  textDim: '#484f58',
  accent: '#58a6ff',
  accentGreen: '#3fb950',
  accentRed: '#f85149',
  accentYellow: '#d29922',
  accentPurple: '#bc8cff',
};

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

type View =
  | { kind: 'dashboard' }
  | { kind: 'tenants' }
  | { kind: 'tenant'; id: string }
  | { kind: 'modules' }
  | { kind: 'module'; slug: string }
  | { kind: 'billing' }
  | { kind: 'pricing' }
  | { kind: 'health' }
  | { kind: 'audit' };

async function apiCall(path: string, init: RequestInit = {}): Promise<any> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
    credentials: 'include',
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const err: any = new Error(body?.error || res.statusText);
    err.status = res.status;
    err.code = body?.code;
    err.body = body;
    throw err;
  }
  return body;
}

// ─────────────────────────────────────────────────────────────────────────
// Top-level
// ─────────────────────────────────────────────────────────────────────────

export default function PlatformPage() {
  const { user } = useAuth();
  const [view, setView] = useState<View>({ kind: 'dashboard' });

  if (!user || (user as any).platformRole !== 'super_admin') {
    return (
      <div style={{ padding: 24, color: colors.textMuted }} data-testid="platform-unauthorized">
        Platform Command is restricted to super administrators.
      </div>
    );
  }

  const tabs: { key: View['kind']; label: string }[] = [
    { key: 'dashboard', label: 'Overview' },
    { key: 'tenants',   label: 'Tenants' },
    { key: 'modules',   label: 'Modules' },
    { key: 'billing',   label: 'Billing Events' },
    { key: 'pricing',   label: 'Pricing' },
    { key: 'health',    label: 'Health' },
    { key: 'audit',     label: 'Audit' },
  ];

  return (
    <div style={{ padding: 24, color: colors.text, background: colors.bg, minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Platform Command</h1>
        <div style={{ color: colors.textMuted, fontSize: 13 }}>Super admin control surface</div>
      </div>
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${colors.border}`, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map(t => {
          const active = view.kind === t.key
            || (t.key === 'tenants' && view.kind === 'tenant')
            || (t.key === 'modules' && view.kind === 'module');
          return (
            <button
              key={t.key}
              onClick={() => setView({ kind: t.key } as View)}
              data-testid={`tab-platform-${t.key}`}
              style={{
                background: 'transparent',
                color: active ? colors.accent : colors.textMuted,
                border: 'none',
                borderBottom: `2px solid ${active ? colors.accent : 'transparent'}`,
                padding: '8px 14px', fontSize: 13, cursor: 'pointer',
              }}>
              {t.label}
            </button>
          );
        })}
      </div>
      {view.kind === 'dashboard' && <Dashboard onNavigate={setView} />}
      {view.kind === 'tenants'   && <TenantList onOpen={(id) => setView({ kind: 'tenant', id })} />}
      {view.kind === 'tenant'    && <TenantDetail id={view.id} onBack={() => setView({ kind: 'tenants' })} />}
      {view.kind === 'modules'   && <ModuleList onOpen={(slug) => setView({ kind: 'module', slug })} />}
      {view.kind === 'module'    && <ModuleDetail slug={view.slug} onBack={() => setView({ kind: 'modules' })} />}
      {view.kind === 'billing'   && <BillingEvents />}
      {view.kind === 'pricing'   && <Pricing />}
      {view.kind === 'health'    && <Health />}
      {view.kind === 'audit'     && <AuditLog />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// UI primitives
// ─────────────────────────────────────────────────────────────────────────

function Card({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} style={{
    background: colors.bgSecondary, border: `1px solid ${colors.border}`,
    borderRadius: 8, padding: 16, ...(rest.style ?? {}),
  }}>{children}</div>;
}

function Btn({ children, variant = 'default', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'danger' | 'primary' }) {
  const palette = {
    default: { bg: colors.bgHover, fg: colors.text, border: colors.border },
    primary: { bg: colors.accent, fg: '#000', border: colors.accent },
    danger:  { bg: colors.bgSecondary, fg: colors.accentRed, border: colors.accentRed },
  }[variant];
  return <button {...rest} style={{
    background: palette.bg, color: palette.fg, border: `1px solid ${palette.border}`,
    borderRadius: 6, padding: '6px 12px', fontSize: 13, cursor: 'pointer', ...(rest.style ?? {}),
  }}>{children}</button>;
}

function Pill({ tone = 'muted', children }: { tone?: 'green' | 'red' | 'yellow' | 'purple' | 'muted'; children: React.ReactNode }) {
  const map = {
    green:  colors.accentGreen,
    red:    colors.accentRed,
    yellow: colors.accentYellow,
    purple: colors.accentPurple,
    muted:  colors.textMuted,
  };
  return <span style={{
    display: 'inline-block', padding: '2px 8px', fontSize: 11,
    borderRadius: 999, border: `1px solid ${map[tone]}`, color: map[tone],
  }}>{children}</span>;
}

function ErrorBlock({ err }: { err: any }) {
  if (!err) return null;
  return (
    <div data-testid="error-block" style={{
      padding: 12, marginBottom: 12, borderRadius: 6,
      background: 'rgba(248,81,73,0.1)', color: colors.accentRed,
      border: `1px solid ${colors.accentRed}`, fontSize: 13,
    }}>
      <strong>{err.code || err.status || 'Error'}</strong>: {err.message}
      {err.body?.activeSubscriptionCount != null && <div>Active subscriptions: {err.body.activeSubscriptionCount}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────────────────

function Dashboard({ onNavigate }: { onNavigate: (v: View) => void }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    Promise.all([
      apiCall('/v1/platform/tenants?status=active').catch(() => ({ tenants: [] })),
      apiCall('/v1/platform/modules').catch(() => ({ modules: [] })),
      apiCall('/v1/platform/health').catch(() => null),
    ]).then(([t, m, h]) => setData({ tenants: t.tenants, modules: m.modules, health: h }));
  }, []);
  if (!data) return <div style={{ color: colors.textMuted }}>Loading…</div>;
  const tenantsActive = data.tenants.length;
  const modulesLive = data.modules.filter((m: any) => m.status === 'live').length;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
      <Card data-testid="card-tenants" onClick={() => onNavigate({ kind: 'tenants' })} style={{ cursor: 'pointer' }}>
        <div style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>Active tenants</div>
        <div style={{ fontSize: 28, fontWeight: 700 }}>{tenantsActive}</div>
      </Card>
      <Card data-testid="card-modules" onClick={() => onNavigate({ kind: 'modules' })} style={{ cursor: 'pointer' }}>
        <div style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>Live modules</div>
        <div style={{ fontSize: 28, fontWeight: 700 }}>{modulesLive} <span style={{ color: colors.textDim, fontSize: 13 }}>/ {data.modules.length}</span></div>
      </Card>
      <Card data-testid="card-stripe">
        <div style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>Stripe</div>
        <div style={{ fontSize: 16 }}>
          <Pill tone={data.health?.stripe?.live ? 'green' : 'yellow'}>{data.health?.stripe?.mode ?? 'unknown'}</Pill>
        </div>
      </Card>
      <Card data-testid="card-db">
        <div style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>Database</div>
        <Pill tone={data.health?.db?.ok ? 'green' : 'red'}>{data.health?.db?.ok ? 'healthy' : 'down'}</Pill>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Tenants
// ─────────────────────────────────────────────────────────────────────────

function TenantList({ onOpen }: { onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<any>(null);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'suspended' | 'archived'>('');
  const [showCreate, setShowCreate] = useState(false);

  const load = () => {
    const qs = new URLSearchParams();
    if (statusFilter) qs.set('status', statusFilter);
    else qs.set('includeArchived', '1');
    if (filter) qs.set('q', filter);
    apiCall(`/v1/platform/tenants?${qs.toString()}`).then(d => setRows(d.tenants)).catch(setErr);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter]);

  return (
    <div>
      <ErrorBlock err={err} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          data-testid="input-tenant-search"
          placeholder="Search by name or slug…" value={filter}
          onChange={e => setFilter(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') load(); }}
          style={{ flex: 1, minWidth: 180, background: colors.bgSecondary, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 13 }}
        />
        <select data-testid="select-tenant-status" value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} style={{ background: colors.bgSecondary, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 13 }}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="archived">Archived</option>
        </select>
        <Btn data-testid="button-tenant-search" onClick={load}>Search</Btn>
        <Btn data-testid="button-tenant-create" variant="primary" onClick={() => setShowCreate(true)}>+ New tenant</Btn>
      </div>
      {showCreate && <CreateTenantForm onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
      {rows == null ? <div style={{ color: colors.textMuted }}>Loading…</div> : (
        <Card style={{ padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: colors.bgHover, color: colors.textMuted }}>
                <Th>Name</Th><Th>Slug</Th><Th>Type</Th><Th>Status</Th><Th>Members</Th><Th>Modules</Th><Th></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(t => (
                <tr key={t.id} style={{ borderTop: `1px solid ${colors.border}` }} data-testid={`row-tenant-${t.id}`}>
                  <Td>{t.name}</Td>
                  <Td><code style={{ color: colors.textMuted }}>{t.slug}</code></Td>
                  <Td><Pill tone={t.type === 'company' ? 'purple' : 'muted'}>{t.type}</Pill></Td>
                  <Td><Pill tone={t.status === 'active' ? 'green' : t.status === 'suspended' ? 'yellow' : 'red'}>{t.status}</Pill></Td>
                  <Td>{t.memberCount}</Td>
                  <Td>{t.enabledModuleCount}</Td>
                  <Td><Btn data-testid={`button-tenant-open-${t.id}`} onClick={() => onOpen(t.id)}>Open</Btn></Td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: colors.textMuted }}>No tenants match.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function CreateTenantForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [err, setErr] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(null); setBusy(true);
    try {
      // Resolve email -> userId via existing admin route. Falls back to
      // raw user-id input if the field looks like a UUID.
      let ownerUserId = ownerEmail.trim();
      if (ownerUserId.includes('@')) {
        const r = await apiCall(`/v1/admin/users?search=${encodeURIComponent(ownerUserId)}`).catch(() => ({ users: [] }));
        const found = r.users?.find((u: any) => u.email.toLowerCase() === ownerUserId.toLowerCase());
        if (!found) throw Object.assign(new Error('Owner email not found'), { code: 'USER_NOT_FOUND' });
        ownerUserId = found.id;
      }
      await apiCall('/v1/platform/tenants', { method: 'POST', body: JSON.stringify({ name, slug, ownerUserId, type: 'company' }) });
      onCreated();
    } catch (e: any) { setErr(e); } finally { setBusy(false); }
  };

  return (
    <Card style={{ marginBottom: 12 }} data-testid="form-create-tenant">
      <h3 style={{ marginTop: 0, fontSize: 14 }}>Create company tenant</h3>
      <ErrorBlock err={err} />
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 8 }}>
        <Input label="Name" value={name} onChange={setName} testid="input-name" />
        <Input label="Slug" value={slug} onChange={setSlug} testid="input-slug" />
        <Input label="Owner email or user id" value={ownerEmail} onChange={setOwnerEmail} testid="input-owner" />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn data-testid="button-submit-tenant" variant="primary" onClick={submit} disabled={busy}>{busy ? 'Creating…' : 'Create'}</Btn>
        <Btn data-testid="button-cancel-tenant" onClick={onClose}>Cancel</Btn>
      </div>
    </Card>
  );
}

function TenantDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = () => apiCall(`/v1/platform/tenants/${id}/detail`).then(setData).catch(setErr);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const lifecycle = async (action: 'suspend' | 'reactivate' | 'archive') => {
    setBusy(true); setErr(null);
    try { await apiCall(`/v1/platform/tenants/${id}/${action}`, { method: 'POST' }); await load(); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const enableModule = async (slug: string) => {
    setErr(null);
    try { await apiCall(`/v1/platform/tenants/${id}/modules/${slug}/enable`, { method: 'POST', body: JSON.stringify({ allowAllMembers: true }) }); await load(); }
    catch (e) { setErr(e); }
  };
  const disableModule = async (slug: string) => {
    setErr(null);
    try { await apiCall(`/v1/platform/tenants/${id}/modules/${slug}/disable`, { method: 'POST' }); await load(); }
    catch (e) { setErr(e); }
  };

  if (!data) return <div style={{ color: colors.textMuted }}>Loading…</div>;
  const t = data.tenant;
  return (
    <div>
      <Btn data-testid="button-tenant-back" onClick={onBack} style={{ marginBottom: 12 }}>← Back to tenants</Btn>
      <ErrorBlock err={err} />
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }} data-testid="text-tenant-name">{t.name}</h2>
            <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}><code>{t.slug}</code> · {t.type} · <Pill tone={t.status === 'active' ? 'green' : t.status === 'suspended' ? 'yellow' : 'red'}>{t.status}</Pill></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {t.status !== 'suspended' && t.status !== 'archived' && <Btn data-testid="button-suspend" disabled={busy} onClick={() => lifecycle('suspend')}>Suspend</Btn>}
            {t.status !== 'active' && <Btn data-testid="button-reactivate" variant="primary" disabled={busy} onClick={() => lifecycle('reactivate')}>Reactivate</Btn>}
            {t.status !== 'archived' && <Btn data-testid="button-archive" variant="danger" disabled={busy} onClick={() => lifecycle('archive')}>Archive</Btn>}
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Card>
          <h3 style={{ marginTop: 0, fontSize: 14 }}>Members ({data.members.length})</h3>
          {data.members.map((m: any) => (
            <div key={m.id} style={{ padding: '6px 0', borderBottom: `1px solid ${colors.border}`, fontSize: 13 }} data-testid={`row-member-${m.userId}`}>
              <div>{m.user?.name || m.user?.email || m.userId}</div>
              <div style={{ color: colors.textMuted, fontSize: 11 }}>{m.role} · {m.user?.email}</div>
            </div>
          ))}
        </Card>
        <Card>
          <h3 style={{ marginTop: 0, fontSize: 14 }}>Modules ({data.modules.length})</h3>
          {data.modules.map((m: any) => (
            <div key={m.id} style={{ padding: '6px 0', borderBottom: `1px solid ${colors.border}`, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} data-testid={`row-module-${m.module?.slug}`}>
              <div>
                <div>{m.module?.name ?? m.moduleId}</div>
                <div style={{ color: colors.textMuted, fontSize: 11 }}>{m.module?.slug} · <Pill tone={m.status === 'enabled' ? 'green' : 'muted'}>{m.status}</Pill></div>
              </div>
              {m.status === 'enabled'
                ? <Btn data-testid={`button-disable-${m.module?.slug}`} onClick={() => disableModule(m.module.slug)}>Disable</Btn>
                : <Btn data-testid={`button-enable-${m.module?.slug}`} variant="primary" onClick={() => enableModule(m.module.slug)}>Enable</Btn>}
            </div>
          ))}
        </Card>
      </div>

      <Card style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0, fontSize: 14 }}>Billing — {data.billing.activeAddonCount} active / {data.billing.addonCount} total addon subs</h3>
        {data.billing.subscriptions.length === 0 && <div style={{ color: colors.textMuted, fontSize: 13 }}>No add-on subscriptions.</div>}
        {data.billing.subscriptions.map((s: any) => (
          <div key={s.id} style={{ padding: '6px 0', borderBottom: `1px solid ${colors.border}`, fontSize: 12, color: colors.textMuted }}>
            <code>{s.id}</code> · status={s.status} · stripe={s.stripeSubscriptionId ?? '—'}
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Modules
// ─────────────────────────────────────────────────────────────────────────

function ModuleList({ onOpen }: { onOpen: (slug: string) => void }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(false);
  const load = () => apiCall('/v1/platform/modules?includeArchived=1').then(d => setRows(d.modules)).catch(setErr);
  useEffect(() => { load(); }, []);
  return (
    <div>
      <ErrorBlock err={err} />
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <Btn data-testid="button-module-create" variant="primary" onClick={() => setShowCreate(true)}>+ New module</Btn>
      </div>
      {showCreate && <CreateModuleForm onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
      {rows == null ? <div style={{ color: colors.textMuted }}>Loading…</div> : (
        <Card style={{ padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: colors.bgHover, color: colors.textMuted }}>
              <Th>Name</Th><Th>Slug</Th><Th>Status</Th><Th>Plan</Th><Th>Order</Th><Th></Th>
            </tr></thead>
            <tbody>
              {rows.map(m => (
                <tr key={m.id} style={{ borderTop: `1px solid ${colors.border}`, opacity: m.archivedAt ? 0.5 : 1 }} data-testid={`row-module-${m.slug}`}>
                  <Td>{m.name}</Td>
                  <Td><code style={{ color: colors.textMuted }}>{m.slug}</code></Td>
                  <Td><Pill tone={m.status === 'live' ? 'green' : m.status === 'beta' ? 'purple' : m.status === 'disabled' ? 'red' : 'yellow'}>{m.archivedAt ? 'archived' : m.status}</Pill></Td>
                  <Td>{m.planMin}</Td>
                  <Td>{m.ord}</Td>
                  <Td><Btn data-testid={`button-module-open-${m.slug}`} onClick={() => onOpen(m.slug)}>Open</Btn></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function CreateModuleForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [planMin, setPlanMin] = useState('elite');
  const [err, setErr] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr(null); setBusy(true);
    try { await apiCall('/v1/platform/modules', { method: 'POST', body: JSON.stringify({ slug, name, planMin, status: 'coming_soon' }) }); onCreated(); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Card style={{ marginBottom: 12 }} data-testid="form-create-module">
      <h3 style={{ marginTop: 0, fontSize: 14 }}>Create module</h3>
      <ErrorBlock err={err} />
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 8 }}>
        <Input label="Slug" value={slug} onChange={setSlug} testid="input-mod-slug" />
        <Input label="Name" value={name} onChange={setName} testid="input-mod-name" />
        <div>
          <label style={{ display: 'block', fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>planMin</label>
          <select value={planMin} onChange={e => setPlanMin(e.target.value)} data-testid="select-mod-plan" style={{ width: '100%', background: colors.bgSecondary, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 13 }}>
            <option value="starter">starter</option><option value="pro">pro</option><option value="elite">elite</option>
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn data-testid="button-submit-module" variant="primary" disabled={busy} onClick={submit}>{busy ? 'Creating…' : 'Create'}</Btn>
        <Btn data-testid="button-cancel-module" onClick={onClose}>Cancel</Btn>
      </div>
    </Card>
  );
}

function ModuleDetail({ slug, onBack }: { slug: string; onBack: () => void }) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = () => apiCall(`/v1/platform/modules?includeArchived=1`).then(d => setData(d.modules.find((m: any) => m.slug === slug))).catch(setErr);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [slug]);

  const archive = async (confirm: boolean) => {
    setErr(null); setBusy(true);
    try { await apiCall(`/v1/platform/modules/${slug}/archive${confirm ? '?confirm=1' : ''}`, { method: 'POST' }); await load(); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  if (!data) return <div style={{ color: colors.textMuted }}>Loading…</div>;
  return (
    <div>
      <Btn data-testid="button-module-back" onClick={onBack} style={{ marginBottom: 12 }}>← Back</Btn>
      <ErrorBlock err={err} />
      <Card>
        <h2 style={{ margin: 0, fontSize: 18 }} data-testid="text-module-name">{data.name}</h2>
        <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
          <code>{data.slug}</code> · status={data.archivedAt ? 'archived' : data.status} · planMin={data.planMin} · ord={data.ord}
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          {!data.archivedAt && <Btn data-testid="button-archive-module" variant="danger" disabled={busy} onClick={() => archive(false)}>Archive</Btn>}
          {!data.archivedAt && err?.code === 'MODULE_HAS_ACTIVE_SUBS' && <Btn data-testid="button-archive-module-confirm" variant="danger" onClick={() => archive(true)}>Confirm archive ({err.body?.activeSubscriptionCount} active)</Btn>}
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Other tabs
// ─────────────────────────────────────────────────────────────────────────

function BillingEvents() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [onlyFailed, setOnlyFailed] = useState(false);
  const load = () => apiCall(`/v1/platform/billing/events${onlyFailed ? '?onlyFailed=1' : ''}`).then(d => setRows(d.events));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [onlyFailed]);
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: colors.textMuted }}>
          <input data-testid="checkbox-only-failed" type="checkbox" checked={onlyFailed} onChange={e => setOnlyFailed(e.target.checked)} /> Only failed/unprocessed
        </label>
      </div>
      <Card style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ background: colors.bgHover, color: colors.textMuted }}>
            <Th>Created</Th><Th>Type</Th><Th>User</Th><Th>Stripe Event</Th><Th>Processed</Th><Th>Error</Th>
          </tr></thead>
          <tbody>
            {(rows ?? []).map(e => (
              <tr key={e.id} style={{ borderTop: `1px solid ${colors.border}` }}>
                <Td>{new Date(e.createdAt).toLocaleString()}</Td>
                <Td>{e.eventType}</Td>
                <Td><code>{e.userId}</code></Td>
                <Td><code>{e.stripeEventId ?? '—'}</code></Td>
                <Td>{e.processedAt ? <Pill tone="green">ok</Pill> : <Pill tone="yellow">pending</Pill>}</Td>
                <Td style={{ color: colors.accentRed }}>{e.errorMessage ?? ''}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Pricing() {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { apiCall('/v1/platform/pricing').then(d => setRows(d.pricing)); }, []);
  if (!rows) return <div style={{ color: colors.textMuted }}>Loading…</div>;
  return (
    <Card style={{ padding: 0 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ background: colors.bgHover, color: colors.textMuted }}>
          <Th>Module</Th><Th>Declared (¢)</Th><Th>Stripe (¢)</Th><Th>Currency</Th><Th>Env Key</Th><Th>Notes</Th>
        </tr></thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.slug} style={{ borderTop: `1px solid ${colors.border}` }} data-testid={`row-pricing-${p.slug}`}>
              <Td>{p.name} <span style={{ color: colors.textMuted, fontSize: 11 }}>{p.slug}</span></Td>
              <Td>{p.declaredAddonPriceCents ?? '—'}</Td>
              <Td>{p.stripeUnitAmountCents ?? '—'}</Td>
              <Td>{p.stripeCurrency ?? '—'}</Td>
              <Td><code style={{ color: colors.textMuted }}>{p.envKey}</code> {p.envKeyConfigured ? <Pill tone="green">configured</Pill> : <Pill tone="muted">missing</Pill>}</Td>
              <Td>{p.mismatch ? <Pill tone="red">mismatch</Pill> : (p.error ? <Pill tone="yellow">{p.error}</Pill> : <Pill tone="green">ok</Pill>)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Health() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { apiCall('/v1/platform/health').then(setData); }, []);
  if (!data) return <div style={{ color: colors.textMuted }}>Loading…</div>;
  return (
    <Card data-testid="card-health">
      <pre style={{ margin: 0, fontSize: 12, color: colors.text, whiteSpace: 'pre-wrap' }}>{JSON.stringify(data, null, 2)}</pre>
    </Card>
  );
}

function AuditLog() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [action, setAction] = useState('');
  const load = () => {
    const qs = new URLSearchParams();
    if (action) qs.set('action', action);
    qs.set('limit', '200');
    apiCall(`/v1/platform/audit?${qs.toString()}`).then(d => setRows(d.logs));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input data-testid="input-audit-action" placeholder="filter by action…" value={action} onChange={e => setAction(e.target.value)} style={{ flex: 1, background: colors.bgSecondary, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 13 }} />
        <Btn data-testid="button-audit-search" onClick={load}>Search</Btn>
      </div>
      <Card style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ background: colors.bgHover, color: colors.textMuted }}>
            <Th>When</Th><Th>Actor</Th><Th>Action</Th><Th>Tenant</Th><Th>Target</Th>
          </tr></thead>
          <tbody>
            {(rows ?? []).map(l => (
              <tr key={l.id} style={{ borderTop: `1px solid ${colors.border}` }} data-testid={`row-audit-${l.id}`}>
                <Td>{new Date(l.createdAt).toLocaleString()}</Td>
                <Td>{l.actor?.email ?? l.adminId}</Td>
                <Td><code>{l.action}</code></Td>
                <Td><code style={{ color: colors.textMuted }}>{l.tenantId ?? '—'}</code></Td>
                <Td><code style={{ color: colors.textMuted }}>{l.details?.targetType}/{l.details?.targetId ?? '—'}</code></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Tiny inputs
// ─────────────────────────────────────────────────────────────────────────

function Input({ label, value, onChange, testid }: { label: string; value: string; onChange: (v: string) => void; testid: string }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>{label}</label>
      <input data-testid={testid} value={value} onChange={e => onChange(e.target.value)} style={{ width: '100%', background: colors.bgSecondary, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 13 }} />
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{children}</th>;
}
function Td({ children, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...rest} style={{ padding: '8px 12px', verticalAlign: 'middle', ...(rest.style ?? {}) }}>{children}</td>;
}
