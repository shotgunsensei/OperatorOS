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

export type PlatformView =
  | { kind: 'dashboard' }
  | { kind: 'tenants' }
  | { kind: 'tenant'; id: string }
  | { kind: 'modules' }
  | { kind: 'module'; slug: string }
  | { kind: 'users' }
  | { kind: 'user'; id: string }
  | { kind: 'billing' }
  | { kind: 'pricing' }
  | { kind: 'health' }
  | { kind: 'audit' }
  | { kind: 'sso' };

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

const API = '/api';

type View = PlatformView;

async function apiCall(path: string, init: RequestInit = {}): Promise<any> {
  // localStorage key 'token' is set by AuthProvider on login. (PlatformPage
  // previously read 'auth_token' — that key is never set anywhere, so every
  // /v1/platform/* call went out without an Authorization header and the
  // entire surface 401'd. Aligning with the rest of the web app.)
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const tenantId = typeof window !== 'undefined' ? localStorage.getItem('activeTenantId') : null;
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}),
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

// -------------------------------------------------------------------------
// Top-level
// -------------------------------------------------------------------------

export default function PlatformPage(props: { view?: View; onNavigate?: (v: View) => void } = {}) {
  const { user } = useAuth();
  // Controlled mode: parent owns view (used by /platform/[[...slug]] route
  // for path-addressable URLs). Uncontrolled mode: internal state (used
  // when embedded under root '/' for legacy in-app sidebar nav).
  const [internalView, setInternalView] = useState<View>({ kind: 'dashboard' });
  const view = props.view ?? internalView;
  const setView = (v: View) => {
    if (props.onNavigate) props.onNavigate(v);
    else setInternalView(v);
  };

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
    { key: 'users',     label: 'Users' },
    { key: 'modules',   label: 'Modules' },
    { key: 'billing',   label: 'Billing Events' },
    { key: 'pricing',   label: 'Pricing' },
    { key: 'health',    label: 'Health' },
    { key: 'audit',     label: 'Audit' },
    { key: 'sso',       label: 'SSO' },
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
            || (t.key === 'modules' && view.kind === 'module')
            || (t.key === 'users'   && view.kind === 'user');
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
      {view.kind === 'users'     && <UserList onOpen={(id) => setView({ kind: 'user', id })} />}
      {view.kind === 'user'      && <UserDetail id={view.id} onBack={() => setView({ kind: 'users' })} />}
      {view.kind === 'billing'   && <BillingEvents />}
      {view.kind === 'pricing'   && <Pricing />}
      {view.kind === 'health'    && <Health />}
      {view.kind === 'audit'     && <AuditLog />}
      {view.kind === 'sso'       && <SsoSettings />}
    </div>
  );
}

// -------------------------------------------------------------------------
// SSO Settings (Task #81)
// -------------------------------------------------------------------------

function SsoSettings() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    apiCall('/v1/platform/sso/settings').then(setData).catch(setErr);
  }, []);
  const copyEnvBlock = async () => {
    if (!data?.envBlock) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(data.envBlock);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore — fallback shows the block inline anyway */ }
  };
  if (err) return <ErrorBlock err={err} />;
  if (!data) return <div style={{ color: colors.textMuted }}>Loading…</div>;
  const secretOk = data.secretStatus === 'configured';
  return (
    <div data-testid="sso-settings">
      <Card style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14, marginBottom: 8 }}>Identity provider</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, fontSize: 13 }}>
          <div>
            <div style={{ color: colors.textMuted, fontSize: 11 }}>Issuer</div>
            <div data-testid="sso-issuer"><code>{data.issuer || '(not set)'}</code></div>
          </div>
          <div>
            <div style={{ color: colors.textMuted, fontSize: 11 }}>Environment</div>
            <div data-testid="sso-env"><Pill tone={data.env === 'prod' ? 'green' : data.env === 'staging' ? 'yellow' : 'muted'}>{data.env}</Pill></div>
          </div>
          <div>
            <div style={{ color: colors.textMuted, fontSize: 11 }}>Token TTL</div>
            <div data-testid="sso-ttl">{data.ttlSeconds}s</div>
          </div>
          <div>
            <div style={{ color: colors.textMuted, fontSize: 11 }}>MODULE_SSO_SECRET</div>
            <div data-testid="sso-secret-status">
              <Pill tone={secretOk ? 'green' : 'red'}>{secretOk ? 'configured' : 'missing'}</Pill>
            </div>
          </div>
        </div>
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>Child app .env block</h3>
          <Btn data-testid="button-copy-env-block" variant="primary" onClick={copyEnvBlock}>{copied ? 'Copied!' : 'Copy'}</Btn>
        </div>
        <pre data-testid="sso-env-block" style={{
          margin: 0, padding: 12, background: colors.bg, border: `1px solid ${colors.border}`,
          borderRadius: 6, color: colors.text, fontSize: 12, overflow: 'auto',
        }}>{data.envBlock}</pre>
      </Card>

      <Card style={{ padding: 0 }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.border}` }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>Per-module launch URLs</h3>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: colors.bgHover, color: colors.textMuted }}>
            <Th>Module</Th><Th>Slug</Th><Th>Base URL</Th><Th>Launch URL pattern</Th>
          </tr></thead>
          <tbody>
            {data.modules.map((m: any) => (
              <tr key={m.slug} data-testid={`sso-module-row-${m.slug}`} style={{ borderTop: `1px solid ${colors.border}` }}>
                <Td>{m.displayName}</Td>
                <Td><code>{m.slug}</code></Td>
                <Td>
                  {m.baseUrlConfigured
                    ? <code style={{ fontSize: 11 }}>{m.baseUrl}</code>
                    : <Pill tone="red">missing</Pill>}
                </Td>
                <Td><code style={{ fontSize: 11 }}>{m.launchUrlPattern}</code></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// -------------------------------------------------------------------------
// UI primitives
// -------------------------------------------------------------------------

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

// -------------------------------------------------------------------------
// Dashboard
// -------------------------------------------------------------------------

function Dashboard({ onNavigate }: { onNavigate: (v: View) => void }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    Promise.all([
      apiCall('/v1/platform/stats').catch(() => null),
      apiCall('/v1/platform/health').catch(() => null),
      apiCall('/v1/platform/audit?limit=5').catch(() => ({ logs: [] })),
    ]).then(([s, h, a]) => setData({ stats: s, health: h, recent: a.logs ?? [] }));
  }, []);
  if (!data) return <div style={{ color: colors.textMuted }}>Loading…</div>;
  const s = data.stats ?? {};
  const h = data.health ?? {};
  const warnings: { code: string; message: string }[] = Array.isArray(s.warnings) ? s.warnings : [];
  return (
    <div>
      {warnings.length > 0 && (
        <div data-testid="banner-stats-warnings" style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {warnings.map(w => (
            <div
              key={w.code}
              data-testid={`banner-stats-warning-${w.code}`}
              style={{
                padding: '10px 12px',
                border: `1px solid ${colors.accentRed}`,
                background: 'rgba(220, 38, 38, 0.08)',
                color: colors.text,
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              <strong style={{ color: colors.accentRed }}>{w.code}</strong>: {w.message}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
        <Card data-testid="card-tenants" onClick={() => onNavigate({ kind: 'tenants' })} style={{ cursor: 'pointer' }}>
          <div style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>Tenants</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{s.tenants?.byStatus?.active ?? 0} <span style={{ color: colors.textDim, fontSize: 13 }}>/ {s.tenants?.total ?? 0}</span></div>
          <div style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>{s.tenants?.byStatus?.suspended ?? 0} suspended · {s.tenants?.byStatus?.archived ?? 0} archived</div>
        </Card>
        <Card data-testid="card-modules" onClick={() => onNavigate({ kind: 'modules' })} style={{ cursor: 'pointer' }}>
          <div style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>Modules</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{(s.modules?.byStatus?.live ?? 0) + (s.modules?.byStatus?.active ?? 0)} <span style={{ color: colors.textDim, fontSize: 13 }}>/ {s.modules?.total ?? 0}</span></div>
          <div style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>{s.modules?.byStatus?.beta ?? 0} beta · {s.modules?.byStatus?.coming_soon ?? 0} coming soon · {s.modules?.archivedCount ?? 0} archived</div>
        </Card>
        <Card data-testid="card-addons" onClick={() => onNavigate({ kind: 'billing' })} style={{ cursor: 'pointer' }}>
          <div style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>Addon subs</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{s.addonSubscriptions?.activeOrTrialing ?? 0} <span style={{ color: colors.textDim, fontSize: 13 }}>/ {s.addonSubscriptions?.total ?? 0}</span></div>
          <div style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>{s.addonSubscriptions?.byStatus?.incomplete ?? 0} incomplete · {s.addonSubscriptions?.byStatus?.canceled ?? 0} canceled</div>
        </Card>
        <Card data-testid="card-billing-events" onClick={() => onNavigate({ kind: 'billing' })} style={{ cursor: 'pointer' }}>
          <div style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>Billing events</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: (s.billingEvents?.failed ?? 0) > 0 ? colors.accentRed : colors.text }}>{s.billingEvents?.failed ?? 0} <span style={{ color: colors.textDim, fontSize: 13 }}>failed</span></div>
          <div style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>{s.billingEvents?.processed ?? 0} processed of {s.billingEvents?.total ?? 0}</div>
        </Card>
        <Card data-testid="card-users">
          <div style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>Users</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{s.users?.active ?? 0} <span style={{ color: colors.textDim, fontSize: 13 }}>/ {s.users?.total ?? 0}</span></div>
          <div style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>{s.users?.superAdmins ?? 0} super admin{(s.users?.superAdmins ?? 0) === 1 ? '' : 's'}</div>
        </Card>
        <Card data-testid="card-stripe" onClick={() => onNavigate({ kind: 'health' })} style={{ cursor: 'pointer' }}>
          <div style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>Stripe</div>
          <div style={{ fontSize: 16 }}><Pill tone={h.stripe?.live ? 'green' : 'yellow'}>{h.stripe?.mode ?? 'unknown'}</Pill></div>
          <div style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>last webhook: {h.stripe?.lastSuccessfulWebhookAt ? new Date(h.stripe.lastSuccessfulWebhookAt).toLocaleString() : '—'}</div>
        </Card>
        <Card data-testid="card-db" onClick={() => onNavigate({ kind: 'health' })} style={{ cursor: 'pointer' }}>
          <div style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>Infrastructure</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Pill tone={h.db?.ok ? 'green' : 'red'}>db {h.db?.ok ? 'ok' : 'down'}</Pill>
            <Pill tone={h.auth?.sessionSecretConfigured ? 'green' : 'red'}>session</Pill>
            <Pill tone={h.ai?.openaiKeyConfigured ? 'green' : 'muted'}>openai</Pill>
          </div>
        </Card>
      </div>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>Recent admin activity</h3>
          <Btn data-testid="button-view-all-audit" onClick={() => onNavigate({ kind: 'audit' })}>View all</Btn>
        </div>
        {data.recent.length === 0 && <div style={{ color: colors.textMuted, fontSize: 13 }}>No recent activity.</div>}
        {data.recent.map((l: any) => (
          <div key={l.id} style={{ padding: '6px 0', borderBottom: `1px solid ${colors.border}`, fontSize: 12 }}>
            <code>{l.action}</code> · {l.actor?.email ?? l.adminId} · <span style={{ color: colors.textMuted }}>{new Date(l.createdAt).toLocaleString()}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

// -------------------------------------------------------------------------
// Tenants
// -------------------------------------------------------------------------

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
        const r = await apiCall(`/v1/platform/users?search=${encodeURIComponent(ownerUserId)}`).catch(() => ({ users: [] }));
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

type TenantTab = 'overview' | 'members' | 'modules' | 'billing' | 'activity' | 'audit' | 'settings';

function TenantDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<TenantTab>('overview');
  const [audit, setAudit] = useState<any[] | null>(null);

  const load = () => apiCall(`/v1/platform/tenants/${id}/detail`).then(setData).catch(setErr);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);
  useEffect(() => {
    if (tab === 'audit') {
      apiCall(`/v1/platform/audit?tenantId=${id}&limit=100`).then(d => setAudit(d.logs)).catch(setErr);
    }
  }, [tab, id]);

  const lifecycle = async (action: 'suspend' | 'reactivate' | 'archive' | 'restore') => {
    setBusy(true); setErr(null);
    try { await apiCall(`/v1/platform/tenants/${id}/${action}`, { method: 'POST' }); await load(); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const hardDelete = async () => {
    setErr(null);
    if (typeof window === 'undefined') return;
    const slug = data?.tenant?.slug;
    if (!slug) return;
    const typed = window.prompt(`Type the tenant slug "${slug}" to permanently delete this tenant. This cannot be undone.`);
    if (typed !== slug) return;
    setBusy(true);
    try {
      await apiCall(`/v1/platform/tenants/${id}?confirm=${encodeURIComponent(slug)}`, { method: 'DELETE' });
      onBack();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const enableModule = async (slug: string, allowAllMembers: boolean) => {
    setErr(null);
    try { await apiCall(`/v1/platform/tenants/${id}/modules/${slug}/enable`, { method: 'POST', body: JSON.stringify({ allowAllMembers }) }); await load(); }
    catch (e) { setErr(e); }
  };
  const disableModule = async (slug: string) => {
    setErr(null);
    try { await apiCall(`/v1/platform/tenants/${id}/modules/${slug}/disable`, { method: 'POST' }); await load(); }
    catch (e) { setErr(e); }
  };
  const setUserAccess = async (userId: string, moduleSlug: string, accessLevel: 'none' | 'user' | 'manager') => {
    setErr(null);
    try {
      await apiCall(`/v1/platform/tenants/${id}/users/${userId}/module-access`, {
        method: 'POST',
        body: JSON.stringify({ moduleSlug, accessLevel }),
      });
      await load();
    } catch (e) { setErr(e); }
  };

  if (!data) return <div style={{ color: colors.textMuted }}>Loading…</div>;
  const t = data.tenant;
  const enabledModules = data.modules.filter((m: any) => m.status === 'enabled');

  const tabs: { key: TenantTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'members',  label: `Members (${data.members.length})` },
    { key: 'modules',  label: `Modules (${data.modules.length})` },
    { key: 'billing',  label: `Billing (${data.billing.activeAddonCount}/${data.billing.addonCount})` },
    { key: 'activity', label: 'Activity' },
    { key: 'audit',    label: 'Audit' },
    { key: 'settings', label: 'Settings' },
  ];

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
            {t.status === 'archived' && <Btn data-testid="button-restore" variant="primary" disabled={busy} onClick={() => lifecycle('restore')}>Restore</Btn>}
            {t.status === 'archived' && <Btn data-testid="button-hard-delete" variant="danger" disabled={busy} onClick={hardDelete}>Delete permanently</Btn>}
          </div>
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: `1px solid ${colors.border}`, flexWrap: 'wrap' }}>
        {tabs.map(x => (
          <button
            key={x.key}
            data-testid={`tab-${x.key}`}
            onClick={() => setTab(x.key)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13,
              padding: '8px 12px',
              color: tab === x.key ? colors.accent : colors.textMuted,
              borderBottom: tab === x.key ? `2px solid ${colors.accent}` : '2px solid transparent',
            }}
          >{x.label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <Card><div style={{ color: colors.textMuted, fontSize: 11 }}>Members</div><div style={{ fontSize: 24, fontWeight: 600 }}>{data.members.length}</div></Card>
          <Card><div style={{ color: colors.textMuted, fontSize: 11 }}>Enabled modules</div><div style={{ fontSize: 24, fontWeight: 600 }}>{enabledModules.length}</div></Card>
          <Card><div style={{ color: colors.textMuted, fontSize: 11 }}>Active add-ons</div><div style={{ fontSize: 24, fontWeight: 600 }}>{data.billing.activeAddonCount}</div></Card>
        </div>
      )}

      {tab === 'members' && (
        <Card style={{ padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: colors.bgHover, color: colors.textMuted }}>
              <Th>User</Th><Th>Role</Th><Th>Per-module access</Th>
            </tr></thead>
            <tbody>
              {data.members.map((m: any) => (
                <tr key={m.id} style={{ borderTop: `1px solid ${colors.border}`, verticalAlign: 'top' }} data-testid={`row-member-${m.userId}`}>
                  <Td>
                    <div>{m.user?.name || m.user?.email || m.userId}</div>
                    <div style={{ color: colors.textMuted, fontSize: 11 }}>{m.user?.email}</div>
                  </Td>
                  <Td><Pill tone={m.role === 'owner' ? 'purple' : 'muted'}>{m.role}</Pill></Td>
                  <Td>
                    <div style={{ display: 'grid', gap: 4 }}>
                      {enabledModules.map((tm: any) => {
                        const slug = tm.module?.slug;
                        if (!slug) return null;
                        const grant = (m.moduleAccess ?? []).find((a: any) => a.moduleId === tm.moduleId);
                        const lvl = grant?.accessLevel ?? (tm.allowAllMembers ? 'user' : 'none');
                        return (
                          <div key={slug} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                            <code style={{ minWidth: 120, color: colors.textMuted }}>{slug}</code>
                            <select
                              data-testid={`select-grant-${m.userId}-${slug}`}
                              value={lvl}
                              onChange={e => setUserAccess(m.userId, slug, e.target.value as any)}
                              style={inp}
                            >
                              <option value="none">none</option>
                              <option value="user">user</option>
                              <option value="manager">manager</option>
                            </select>
                          </div>
                        );
                      })}
                      {enabledModules.length === 0 && <span style={{ color: colors.textMuted, fontSize: 11 }}>No modules enabled for this tenant.</span>}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === 'modules' && (
        <>
          <ModuleCatalogPicker
            tenantModules={data.modules}
            onEnable={(slug) => enableModule(slug, true)}
          />
          <Card style={{ padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: colors.bgHover, color: colors.textMuted }}>
              <Th>Module</Th><Th>Status</Th><Th>Allow all members</Th><Th></Th>
            </tr></thead>
            <tbody>
              {data.modules.map((m: any) => (
                <tr key={m.id} style={{ borderTop: `1px solid ${colors.border}` }} data-testid={`row-module-${m.module?.slug}`}>
                  <Td>
                    <div>{m.module?.name ?? m.moduleId}</div>
                    <div style={{ color: colors.textMuted, fontSize: 11 }}><code>{m.module?.slug}</code></div>
                  </Td>
                  <Td><Pill tone={m.status === 'enabled' ? 'green' : 'muted'}>{m.status}</Pill></Td>
                  <Td>{m.allowAllMembers ? <Pill tone="green">yes</Pill> : <Pill tone="muted">no</Pill>}</Td>
                  <Td>
                    {m.status === 'enabled'
                      ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <Btn data-testid={`button-toggle-allow-${m.module?.slug}`} onClick={() => enableModule(m.module.slug, !m.allowAllMembers)}>{m.allowAllMembers ? 'Restrict' : 'Allow all'}</Btn>
                          <Btn data-testid={`button-disable-${m.module?.slug}`} onClick={() => disableModule(m.module.slug)}>Disable</Btn>
                        </div>
                      )
                      : <Btn data-testid={`button-enable-${m.module?.slug}`} variant="primary" onClick={() => enableModule(m.module.slug, true)}>Enable</Btn>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          </Card>
        </>
      )}

      {tab === 'activity' && <TenantActivity tenantId={id} />}

      {tab === 'billing' && (
        <Card>
          <h3 style={{ marginTop: 0, fontSize: 14 }}>{data.billing.activeAddonCount} active / {data.billing.addonCount} total addon subs</h3>
          {data.billing.subscriptions.length === 0 && <div style={{ color: colors.textMuted, fontSize: 13 }}>No add-on subscriptions.</div>}
          {data.billing.subscriptions.map((s: any) => (
            <div key={s.id} style={{ padding: '6px 0', borderBottom: `1px solid ${colors.border}`, fontSize: 12, color: colors.textMuted }} data-testid={`row-billing-${s.id}`}>
              <code>{s.id}</code> · status={s.status} · stripe={s.stripeSubscriptionId ?? '—'} · module={s.moduleId}
            </div>
          ))}
        </Card>
      )}

      {tab === 'audit' && (
        <Card style={{ padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ background: colors.bgHover, color: colors.textMuted }}>
              <Th>When</Th><Th>Actor</Th><Th>Action</Th><Th>Target</Th>
            </tr></thead>
            <tbody>
              {(audit ?? []).map(l => (
                <tr key={l.id} style={{ borderTop: `1px solid ${colors.border}` }} data-testid={`row-audit-${l.id}`}>
                  <Td>{new Date(l.createdAt).toLocaleString()}</Td>
                  <Td>{l.actor?.email ?? l.adminId}</Td>
                  <Td><code>{l.action}</code></Td>
                  <Td><code style={{ color: colors.textMuted }}>{l.details?.targetType}/{l.details?.targetId ?? '—'}</code></Td>
                </tr>
              ))}
              {audit && audit.length === 0 && <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: colors.textMuted }}>No audit rows for this tenant.</td></tr>}
              {audit === null && <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: colors.textMuted }}>Loading…</td></tr>}
            </tbody>
          </table>
        </Card>
      )}

      {tab === 'settings' && <TenantSettings tenant={t} onSaved={load} />}
    </div>
  );
}

function ModuleCatalogPicker({ tenantModules, onEnable }: { tenantModules: any[]; onEnable: (slug: string) => void }) {
  const [catalog, setCatalog] = useState<any[] | null>(null);
  const [pick, setPick] = useState('');
  useEffect(() => { apiCall('/v1/platform/modules').then(d => setCatalog(d.modules)).catch(() => setCatalog([])); }, []);
  const present = new Set(tenantModules.map((m: any) => m.module?.slug).filter(Boolean));
  const eligible = (catalog ?? []).filter(m => !m.archivedAt && !present.has(m.slug));
  if (eligible.length === 0) return null;
  return (
    <Card style={{ marginBottom: 12 }} data-testid="block-module-catalog-picker">
      <h3 style={{ marginTop: 0, fontSize: 14 }}>Enable a new module for this tenant</h3>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select data-testid="select-module-catalog" value={pick} onChange={e => setPick(e.target.value)} style={{ ...inp, flex: 1 }}>
          <option value="">— choose a module —</option>
          {eligible.map(m => <option key={m.slug} value={m.slug}>{m.name} ({m.slug}) · {m.status} · planMin={m.planMin}</option>)}
        </select>
        <Btn data-testid="button-enable-from-catalog" variant="primary" disabled={!pick} onClick={() => { if (pick) { onEnable(pick); setPick(''); } }}>Enable for tenant</Btn>
      </div>
    </Card>
  );
}

function TenantActivity({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<{ logs: any[]; subs: any[]; events: any[] } | null>(null);
  const [err, setErr] = useState<any>(null);
  useEffect(() => {
    Promise.all([
      apiCall(`/v1/platform/audit?tenantId=${tenantId}&limit=20`).catch(() => ({ logs: [] })),
      apiCall(`/v1/platform/billing/events?tenantId=${tenantId}&limit=20`).catch(() => ({ events: [] })),
    ]).then(([a, b]) => setData({ logs: a.logs ?? [], subs: [], events: b.events ?? [] })).catch(setErr);
  }, [tenantId]);
  if (err) return <ErrorBlock err={err} />;
  if (!data) return <div style={{ color: colors.textMuted }}>Loading…</div>;
  // Merge audit + billing events into one timeline keyed by created/processed time.
  type Item = { kind: 'audit' | 'billing'; at: string; title: string; body: string; id: string };
  const items: Item[] = [
    ...data.logs.map((l: any) => ({
      kind: 'audit' as const, id: `a-${l.id}`,
      at: l.createdAt, title: l.action,
      body: `${l.actor?.email ?? l.adminId} → ${l.details?.targetType ?? '?'}/${l.details?.targetId ?? '—'}`,
    })),
    ...data.events.map((e: any) => ({
      kind: 'billing' as const, id: `b-${e.id}`,
      at: e.processedAt ?? e.createdAt, title: `billing.${e.eventType}`,
      body: `status=${e.status} stripe=${e.stripeEventId ?? '—'}`,
    })),
  ].sort((x, y) => (y.at ?? '').localeCompare(x.at ?? ''));
  return (
    <Card data-testid="block-tenant-activity">
      <h3 style={{ marginTop: 0, fontSize: 14 }}>Activity timeline</h3>
      {items.length === 0 && <div style={{ color: colors.textMuted, fontSize: 13 }}>No recent activity for this tenant.</div>}
      {items.map(i => (
        <div key={i.id} style={{ padding: '8px 0', borderBottom: `1px solid ${colors.border}`, fontSize: 12 }} data-testid={`row-activity-${i.id}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span><Pill tone={i.kind === 'billing' ? 'purple' : 'muted'}>{i.kind}</Pill> <code>{i.title}</code></span>
            <span style={{ color: colors.textMuted }}>{i.at ? new Date(i.at).toLocaleString() : '—'}</span>
          </div>
          <div style={{ color: colors.textMuted, marginTop: 2 }}>{i.body}</div>
        </div>
      ))}
    </Card>
  );
}

function TenantSettings({ tenant, onSaved }: { tenant: any; onSaved: () => void }) {
  const [name, setName] = useState(tenant.name);
  const [slug, setSlug] = useState(tenant.slug);
  const [err, setErr] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const dirty = name !== tenant.name || slug !== tenant.slug;
  const save = async () => {
    setErr(null); setBusy(true);
    try {
      const body: any = {};
      if (name !== tenant.name) body.name = name;
      if (slug !== tenant.slug) body.slug = slug;
      await apiCall(`/v1/platform/tenants/${tenant.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      onSaved();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Card data-testid="form-tenant-settings">
      <h3 style={{ marginTop: 0, fontSize: 14 }}>Tenant settings</h3>
      <ErrorBlock err={err} />
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr', marginBottom: 8 }}>
        <Input label="Name" value={name} onChange={setName} testid="input-tenant-name-edit" />
        <Input label="Slug (collisions return 409 SLUG_TAKEN)" value={slug} onChange={setSlug} testid="input-tenant-slug-edit" />
      </div>
      <Btn data-testid="button-save-tenant" variant="primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</Btn>
      <div style={{ marginTop: 12, color: colors.textMuted, fontSize: 11 }}>
        Plan tier is governed per-user via the legacy subscription flow; this surface is for tenant-level metadata only.
      </div>
    </Card>
  );
}

// -------------------------------------------------------------------------
// Modules
// -------------------------------------------------------------------------

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
  const [pricing, setPricing] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = () => Promise.all([
    apiCall(`/v1/platform/modules?includeArchived=1`).then(d => d.modules.find((m: any) => m.slug === slug)),
    apiCall(`/v1/platform/pricing`).catch(() => ({ pricing: [] })).then((p: any) => p.pricing?.find((r: any) => r.slug === slug)),
  ]).then(([m, p]) => { setData(m); setPricing(p); }).catch(setErr);
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
        {pricing && (
          <div style={{ marginTop: 12, padding: 10, background: colors.bg, borderRadius: 6, fontSize: 12 }} data-testid="block-module-stripe">
            <div style={{ color: colors.textMuted, marginBottom: 4 }}>Stripe add-on price binding (read-only)</div>
            <div data-testid={`text-binding-source-${pricing.slug}`}>
              binding:{' '}
              {pricing.priceSource === 'override' && <Pill tone="green">via override</Pill>}
              {pricing.priceSource === 'env' && <Pill tone="green">via env</Pill>}
              {pricing.priceSource === 'none' && <Pill tone="muted">not configured</Pill>}
              {pricing.priceId && <> <code>{pricing.priceId}</code></>}
            </div>
            <div>
              override: {pricing.overridePriceId ? <code>{pricing.overridePriceId}</code> : <span style={{ color: colors.textMuted }}>—</span>}
              {' · '}env <code>{pricing.envKey}</code>: {pricing.envPriceId ? <code>{pricing.envPriceId}</code> : <span style={{ color: colors.textMuted }}>—</span>}
            </div>
            <div>declared: {pricing.declaredAddonPriceCents ?? '—'}¢ · stripe: {pricing.stripeUnitAmountCents ?? '—'}¢ {pricing.stripeCurrency ? `(${pricing.stripeCurrency})` : ''} {pricing.mismatch && <Pill tone="red">mismatch</Pill>}</div>
          </div>
        )}
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          {!data.archivedAt && <Btn data-testid="button-archive-module" variant="danger" disabled={busy} onClick={() => archive(false)}>Archive</Btn>}
          {!data.archivedAt && err?.code === 'MODULE_HAS_ACTIVE_SUBS' && <Btn data-testid="button-archive-module-confirm" variant="danger" onClick={() => archive(true)}>Confirm archive ({err.body?.activeSubscriptionCount} active)</Btn>}
        </div>
      </Card>
      {!data.archivedAt && <ModuleEditForm module={data} onSaved={load} />}
      {!data.archivedAt && <ModulePlanMapping moduleSlug={slug} onSaved={load} />}
      {!data.archivedAt && <ModuleAddonPriceEditor module={data} onSaved={load} />}
      <ModuleMembers moduleSlug={slug} />
    </div>
  );
}

function ModulePlanMapping({ moduleSlug, onSaved }: { moduleSlug: string; onSaved: () => void }) {
  // Loads the catalog (which now includes `includedInPlans`) and the plan
  // list, lets a super_admin toggle plan inclusion, and POSTs the full set
  // back. The endpoint replaces all mappings for the module in one call.
  const [allPlans, setAllPlans] = useState<any[] | null>(null);
  const [included, setIncluded] = useState<Set<string> | null>(null);
  const [err, setErr] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = () => Promise.all([
    apiCall('/v1/platform/pricing').catch(() => ({ pricing: [] })),
    apiCall('/v1/platform/modules?includeArchived=1'),
  ]).then(([_p, m]) => {
    const mod = m.modules.find((x: any) => x.slug === moduleSlug);
    setIncluded(new Set(mod?.includedInPlans ?? []));
  }).catch(setErr);
  useEffect(() => {
    apiCall('/v1/platform/plans').catch(() => null).then((d) => {
      // /v1/platform/plans may not exist; fall back to a hard-coded set
      // matching the legacy AdminPage's plan picker if necessary.
      const fallback = [{ slug: 'free' }, { slug: 'starter' }, { slug: 'pro' }, { slug: 'elite' }];
      setAllPlans(d?.plans ?? fallback);
    });
    load(); /* eslint-disable-next-line */
  }, [moduleSlug]);
  const toggle = (slug: string) => {
    if (!included) return;
    const next = new Set(included);
    if (next.has(slug)) next.delete(slug); else next.add(slug);
    setIncluded(next);
  };
  const save = async () => {
    if (!included) return;
    setErr(null); setBusy(true);
    try {
      await apiCall(`/v1/platform/modules/${moduleSlug}/plan-mapping`, {
        method: 'POST', body: JSON.stringify({ planSlugs: Array.from(included) }),
      });
      onSaved();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  if (!allPlans || !included) return null;
  return (
    <Card style={{ marginTop: 12 }} data-testid="form-module-plan-mapping">
      <h3 style={{ marginTop: 0, fontSize: 14 }}>Plan mapping</h3>
      <div style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
        Plans that bundle this module out of the box. Leaving all unchecked makes the module add-on-only.
      </div>
      <ErrorBlock err={err} />
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 8 }}>
        {allPlans.map(p => (
          <label key={p.slug} data-testid={`check-plan-${p.slug}`} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={included.has(p.slug)}
              onChange={() => toggle(p.slug)}
            />
            <code>{p.slug}</code>
          </label>
        ))}
      </div>
      <Btn data-testid="button-save-plan-mapping" variant="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save plan mapping'}</Btn>
    </Card>
  );
}

interface AddonPriceHistoryEntry {
  id: string;
  createdAt: string;
  adminId: string;
  adminEmail: string | null;
  adminName: string | null;
  previousCents: number | null;
  nextCents: number | null;
}

function ModuleAddonPriceEditor({ module: m, onSaved }: { module: any; onSaved: () => void }) {
  const meta = (m.metadata ?? {}) as any;
  const current: number | null = typeof meta.addonPriceCents === 'number' ? meta.addonPriceCents : null;
  const currentPriceId: string = typeof meta.stripePriceId === 'string' ? meta.stripePriceId : '';
  const [cents, setCents] = useState<string>(current != null ? String(current) : '');
  const [priceId, setPriceId] = useState<string>(currentPriceId);
  const [err, setErr] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [priceIdBusy, setPriceIdBusy] = useState(false);
  const [priceIdResult, setPriceIdResult] = useState<any>(null);
  const [drift, setDrift] = useState<any>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<AddonPriceHistoryEntry[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyErr, setHistoryErr] = useState<any>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const checkStripe = async () => {
    setErr(null);
    try { setDrift(await apiCall(`/v1/platform/modules/${m.slug}/stripe-price`)); }
    catch (e) { setErr(e); }
  };
  const writePrice = async (n: number) => {
    await apiCall(`/v1/platform/modules/${m.slug}/addon-price`, {
      method: 'PUT', body: JSON.stringify({ addonPriceCents: n }),
    });
  };
  const save = async () => {
    setErr(null); setBusy(true);
    try {
      const n = parseInt(cents, 10);
      if (!Number.isFinite(n) || n < 0) throw Object.assign(new Error('Enter a non-negative integer (cents)'), { code: 'BAD_INPUT' });
      await writePrice(n);
      if (historyOpen) await loadHistory();
      onSaved();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const loadHistory = async () => {
    setHistoryLoading(true); setHistoryErr(null);
    try {
      const d = await apiCall(`/v1/platform/modules/${m.slug}/addon-price-history`);
      const next = d.history as AddonPriceHistoryEntry[];
      setHistory(next);
      setCompareIds(prev => prev.filter(id => next.some(h => h.id === id)));
    } catch (e) { setHistoryErr(e); } finally { setHistoryLoading(false); }
  };
  const toggleHistory = () => {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next && history === null && !historyLoading) loadHistory();
  };
  const restore = async (entry: AddonPriceHistoryEntry) => {
    if (entry.previousCents == null) return;
    setRestoringId(entry.id);
    setErr(null);
    try {
      await writePrice(entry.previousCents);
      setCents(String(entry.previousCents));
      await loadHistory();
      onSaved();
    } catch (e) { setErr(e); } finally { setRestoringId(null); }
  };
  const savePriceId = async (clear = false) => {
    setErr(null); setPriceIdResult(null); setPriceIdBusy(true);
    try {
      const r = await apiCall(`/v1/platform/modules/${m.slug}/stripe-price-id`, {
        method: 'PUT',
        body: JSON.stringify({ stripePriceId: clear ? null : priceId.trim() }),
      });
      setPriceIdResult(r?.validation ?? { ok: true, cleared: clear });
      if (clear) setPriceId('');
      onSaved();
    } catch (e) { setErr(e); } finally { setPriceIdBusy(false); }
  };
  const lookup = drift?.lookup;
  const fmt = (c: number | null) => c == null ? '—' : `${c}¢`;
  const toggleCompare = (id: string) => {
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };
  const compareRows = history && compareIds.length === 2
    ? compareIds.map(id => history.find(h => h.id === id)).filter(Boolean) as AddonPriceHistoryEntry[]
    : [];
  const diff = compareRows.length === 2 ? (() => {
    const sorted = [...compareRows].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const [older, newer] = sorted;
    const a = older.nextCents;
    const b = newer.nextCents;
    const deltaCents = (a != null && b != null) ? b - a : null;
    const pct = (a != null && b != null && a !== 0) ? ((b - a) / a) * 100 : null;
    const ms = new Date(newer.createdAt).getTime() - new Date(older.createdAt).getTime();
    return { older, newer, a, b, deltaCents, pct, ms };
  })() : null;
  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m2 = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m2}m`;
    return `${m2}m`;
  };
  const exportCompareCsv = () => {
    if (!diff) return;
    const rows = [
      ['field', 'older', 'newer'],
      ['id', diff.older.id, diff.newer.id],
      ['createdAt', diff.older.createdAt, diff.newer.createdAt],
      ['previousCents', String(diff.older.previousCents ?? ''), String(diff.newer.previousCents ?? '')],
      ['nextCents', String(diff.older.nextCents ?? ''), String(diff.newer.nextCents ?? '')],
      ['adminEmail', diff.older.adminEmail ?? '', diff.newer.adminEmail ?? ''],
      [],
      ['summary', '', ''],
      ['deltaCents', diff.deltaCents != null ? String(diff.deltaCents) : '', ''],
      ['deltaPercent', diff.pct != null ? diff.pct.toFixed(4) : '', ''],
      ['timeBetweenMs', String(diff.ms), ''],
      ['timeBetween', formatDuration(diff.ms), ''],
    ];
    const csv = rows.map(r => r.map(v => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `addon-price-compare-${m.slug}-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  return (
    <Card style={{ marginTop: 12 }} data-testid="form-module-addon-price">
      <h3 style={{ marginTop: 0, fontSize: 14 }}>Add-on price</h3>
      <div style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
        Stored on the module under <code>metadata.addonPriceCents</code>. Used by add-on subscription flows.
      </div>
      <ErrorBlock err={err} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 8 }}>
        <div style={{ flex: '0 0 220px' }}>
          <label style={{ display: 'block', fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>Price (cents, e.g. 9900 = $99)</label>
          <input data-testid="input-addon-price" value={cents} onChange={e => setCents(e.target.value)} style={{ ...inp, width: '100%' }} />
        </div>
        <Btn data-testid="button-save-addon-price" variant="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save price'}</Btn>
        <Btn data-testid="button-check-stripe-price" onClick={checkStripe}>Check Stripe drift</Btn>
        <Btn data-testid="button-toggle-price-history" onClick={toggleHistory}>{historyOpen ? 'Hide price history' : 'Price history'}</Btn>
      </div>
      <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 12, paddingTop: 12 }}>
        <h3 style={{ marginTop: 0, fontSize: 14 }}>Stripe Price ID override</h3>
        <div style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
          Stored at <code>metadata.stripePriceId</code>. Preferred over the
          legacy <code>STRIPE_PRICE_ADDON_{m.slug.toUpperCase().replace(/-/g, '_')}</code> env binding.
          The id is validated against Stripe before it is saved.
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px', minWidth: 220 }}>
            <label style={{ display: 'block', fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>Stripe Price ID (e.g. price_1A2b…)</label>
            <input
              data-testid="input-stripe-price-id"
              value={priceId}
              onChange={e => setPriceId(e.target.value)}
              placeholder="price_…"
              style={{ ...inp, width: '100%' }}
            />
          </div>
          <Btn data-testid="button-save-stripe-price-id" variant="primary" disabled={priceIdBusy || !priceId.trim()} onClick={() => savePriceId(false)}>
            {priceIdBusy ? 'Validating…' : 'Save price id'}
          </Btn>
          <Btn data-testid="button-clear-stripe-price-id" disabled={priceIdBusy || !currentPriceId} onClick={() => savePriceId(true)}>
            Clear override
          </Btn>
        </div>
        {currentPriceId && (
          <div style={{ marginTop: 6, fontSize: 12, color: colors.textMuted }}>
            current override: <code data-testid="text-current-stripe-price-id">{currentPriceId}</code>
          </div>
        )}
        {priceIdResult && (
          <div data-testid="block-stripe-price-id-result" style={{ marginTop: 8, padding: 10, background: colors.bg, borderRadius: 6, fontSize: 12 }}>
            {priceIdResult.cleared
              ? <Pill tone="green">override cleared</Pill>
              : (
                <>
                  <Pill tone={priceIdResult.ok ? 'green' : 'red'}>{priceIdResult.ok ? 'validated' : 'invalid'}</Pill>{' '}
                  {priceIdResult.unitAmountCents != null && <>{priceIdResult.unitAmountCents}¢ </>}
                  {priceIdResult.currency && <>({priceIdResult.currency}) </>}
                  {priceIdResult.active === false && <Pill tone="yellow">inactive</Pill>}
                </>
              )
            }
          </div>
        )}
      </div>
      {lookup && (
        <div data-testid="block-stripe-drift" style={{ marginTop: 8, padding: 10, background: colors.bg, borderRadius: 6, fontSize: 12 }}>
          <div>
            binding:{' '}
            {lookup.source === 'override' && <Pill tone="green">via override</Pill>}
            {lookup.source === 'env' && <Pill tone="green">via env</Pill>}
            {lookup.source === 'none' && <Pill tone="muted">not configured</Pill>}
            {lookup.priceId && <> <code>{lookup.priceId}</code></>}
          </div>
          <div>
            override: {lookup.overridePriceId ? <code>{lookup.overridePriceId}</code> : <span style={{ color: colors.textMuted }}>—</span>}
            {' · '}env <code>{lookup.envKey ?? '—'}</code>: {lookup.envPriceId ? <code>{lookup.envPriceId}</code> : <span style={{ color: colors.textMuted }}>—</span>}
          </div>
          <div>declared: {lookup.declaredAddonPriceCents ?? '—'}¢ · stripe: {lookup.stripeUnitAmountCents ?? '—'}¢ {lookup.stripeCurrency ? `(${lookup.stripeCurrency})` : ''}</div>
          {lookup.mismatch && <Pill tone="red">mismatch</Pill>}
          {lookup.error && <Pill tone="yellow">{lookup.error}</Pill>}
        </div>
      )}
      {historyOpen && (
        <div data-testid="block-addon-price-history" style={{ marginTop: 8, padding: 10, background: colors.bg, borderRadius: 6, fontSize: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontWeight: 600 }}>Price history</div>
            <div style={{ color: colors.textMuted, fontSize: 11 }} data-testid="text-compare-hint">
              {compareIds.length === 0 && 'Tick two rows to compare'}
              {compareIds.length === 1 && 'Tick one more row to compare'}
              {compareIds.length === 2 && (
                <button
                  type="button"
                  data-testid="button-clear-compare"
                  onClick={() => setCompareIds([])}
                  style={{ background: 'none', border: 'none', color: colors.textMuted, cursor: 'pointer', textDecoration: 'underline', fontSize: 11, padding: 0 }}
                >Clear comparison</button>
              )}
            </div>
          </div>
          {historyLoading && <div data-testid="addon-price-history-loading" style={{ color: colors.textMuted }}>Loading…</div>}
          {historyErr && <ErrorBlock err={historyErr} />}
          {!historyLoading && !historyErr && history && history.length === 0 && (
            <div data-testid="addon-price-history-empty" style={{ color: colors.textMuted }}>No price changes recorded yet.</div>
          )}
          {diff && (
            <div
              data-testid="block-addon-price-compare"
              style={{ marginBottom: 8, padding: 8, background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 6 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontWeight: 600 }}>Comparison</div>
                <Btn data-testid="button-export-compare-csv" onClick={exportCompareCsv}>Export CSV</Btn>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div data-testid="block-compare-older">
                  <div style={{ color: colors.textMuted, fontSize: 11 }}>Older</div>
                  <div style={{ fontFamily: 'monospace' }} data-testid="text-compare-older-price">{fmt(diff.older.nextCents)}</div>
                  <div style={{ color: colors.textMuted, fontSize: 11 }}>{new Date(diff.older.createdAt).toLocaleString()}</div>
                  <div style={{ color: colors.textMuted, fontSize: 11 }}>{diff.older.adminEmail ?? diff.older.adminId}</div>
                </div>
                <div data-testid="block-compare-newer">
                  <div style={{ color: colors.textMuted, fontSize: 11 }}>Newer</div>
                  <div style={{ fontFamily: 'monospace' }} data-testid="text-compare-newer-price">{fmt(diff.newer.nextCents)}</div>
                  <div style={{ color: colors.textMuted, fontSize: 11 }}>{new Date(diff.newer.createdAt).toLocaleString()}</div>
                  <div style={{ color: colors.textMuted, fontSize: 11 }}>{diff.newer.adminEmail ?? diff.newer.adminId}</div>
                </div>
              </div>
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${colors.border}`, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span data-testid="text-compare-delta-cents">
                  Δ {diff.deltaCents == null ? '—' : `${diff.deltaCents > 0 ? '+' : ''}${diff.deltaCents}¢`}
                </span>
                <span data-testid="text-compare-delta-percent">
                  Δ% {diff.pct == null ? '—' : `${diff.pct > 0 ? '+' : ''}${diff.pct.toFixed(2)}%`}
                </span>
                <span data-testid="text-compare-time-between">
                  time between: {formatDuration(diff.ms)}
                </span>
              </div>
            </div>
          )}
          {!historyLoading && !historyErr && history && history.map(entry => {
            const canRestore = entry.previousCents != null && entry.previousCents !== current;
            const when = new Date(entry.createdAt);
            const checked = compareIds.includes(entry.id);
            return (
              <div
                key={entry.id}
                data-testid={`addon-price-history-row-${entry.id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', padding: '4px 0', borderTop: `1px solid ${colors.border}` }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    data-testid={`checkbox-compare-${entry.id}`}
                    checked={checked}
                    onChange={() => toggleCompare(entry.id)}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'monospace' }}>{fmt(entry.previousCents)} → {fmt(entry.nextCents)}</div>
                    <div style={{ color: colors.textMuted, fontSize: 11 }}>
                      {when.toLocaleString()} · {entry.adminEmail ?? entry.adminId}
                    </div>
                  </div>
                </label>
                <Btn
                  data-testid={`button-restore-addon-price-${entry.id}`}
                  onClick={() => restore(entry)}
                  disabled={!canRestore || restoringId === entry.id}
                  title={canRestore ? `Restore to ${fmt(entry.previousCents)}` : entry.previousCents == null ? 'No prior value' : 'Already at this price'}
                >{restoringId === entry.id ? '…' : 'Restore'}</Btn>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function ModuleMembers({ moduleSlug }: { moduleSlug: string }) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  useEffect(() => {
    apiCall(`/v1/platform/modules/${moduleSlug}/members`).then(setData).catch(setErr);
  }, [moduleSlug]);
  if (err) return <ErrorBlock err={err} />;
  if (!data) return null;
  return (
    <Card style={{ marginTop: 12 }} data-testid="block-module-members">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>Members with access</h3>
        <span style={{ color: colors.textMuted, fontSize: 12 }}>
          total {data.counts.total} · plan {data.counts.plan} · addon {data.counts.addon} · grant {data.counts.override_grant} · revoke {data.counts.override_revoke} · admin_role {data.counts.admin_role}
        </span>
      </div>
      <div style={{ maxHeight: 240, overflow: 'auto' }}>
        {data.members.length === 0
          ? <div style={{ color: colors.textMuted, fontSize: 12 }}>No members currently have access.</div>
          : data.members.slice(0, 50).map((mem: any) => (
            <div key={mem.userId} data-testid={`row-member-${mem.userId}`} style={{ padding: '4px 0', borderBottom: `1px solid ${colors.border}`, fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
              <span>{mem.email}</span>
              <span><Pill tone={mem.accessSource === 'plan' ? 'green' : mem.accessSource === 'addon' ? 'purple' : mem.accessSource === 'override' ? 'yellow' : 'muted'}>{mem.accessSource}</Pill> {mem.planSlug ? <code style={{ color: colors.textMuted }}>{mem.planSlug}</code> : null}</span>
            </div>
          ))}
      </div>
    </Card>
  );
}

// -------------------------------------------------------------------------
// Users (ported from retired AdminPage)
// -------------------------------------------------------------------------

function UserList({ onOpen }: { onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);
  const load = (p = page) => {
    const qs = new URLSearchParams();
    if (search) qs.set('search', search);
    if (statusFilter) qs.set('status', statusFilter);
    if (roleFilter) qs.set('role', roleFilter);
    qs.set('page', String(p));
    apiCall(`/v1/platform/users?${qs.toString()}`).then(d => setRows(d.users)).catch(setErr);
  };
  useEffect(() => { load(1); /* eslint-disable-next-line */ }, [statusFilter, roleFilter]);
  return (
    <div>
      <ErrorBlock err={err} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          data-testid="input-user-search"
          placeholder="Search by email or name…" value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { setPage(1); load(1); } }}
          style={{ ...inp, flex: 1, minWidth: 220 }}
        />
        <select data-testid="select-user-status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={inp}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="deleted">Deleted</option>
        </select>
        <select data-testid="select-user-role" value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={inp}>
          <option value="">All roles</option>
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
        <Btn data-testid="button-user-search" onClick={() => { setPage(1); load(1); }}>Search</Btn>
        <Btn data-testid="button-users-prev" onClick={() => { const p = Math.max(1, page - 1); setPage(p); load(p); }} disabled={page === 1}>← Prev</Btn>
        <Btn data-testid="button-users-next" onClick={() => { const p = page + 1; setPage(p); load(p); }} disabled={(rows?.length ?? 0) < 25}>Next →</Btn>
      </div>
      {rows == null ? <div style={{ color: colors.textMuted }}>Loading…</div> : (
        <Card style={{ padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: colors.bgHover, color: colors.textMuted }}>
              <Th>Email</Th><Th>Name</Th><Th>Role</Th><Th>Plan</Th><Th>Status</Th><Th>Sub</Th><Th></Th>
            </tr></thead>
            <tbody>
              {rows.map(u => (
                <tr key={u.id} style={{ borderTop: `1px solid ${colors.border}` }} data-testid={`row-user-${u.id}`}>
                  <Td>{u.email}</Td>
                  <Td>{u.name ?? '—'}</Td>
                  <Td>
                    <Pill tone={u.platformRole === 'super_admin' ? 'purple' : u.role === 'admin' ? 'yellow' : 'muted'}>
                      {u.platformRole === 'super_admin' ? 'super_admin' : u.role}
                    </Pill>
                  </Td>
                  <Td>{u.planName}</Td>
                  <Td><Pill tone={u.status === 'active' ? 'green' : u.status === 'suspended' ? 'yellow' : 'red'}>{u.status}</Pill></Td>
                  <Td>{u.subscription?.status ?? '—'}</Td>
                  <Td><Btn data-testid={`button-user-open-${u.id}`} onClick={() => onOpen(u.id)}>Open</Btn></Td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: colors.textMuted }}>No users match.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function UserDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = () => apiCall(`/v1/platform/users/${id}`).then(setData).catch(setErr);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const setStatus = async (status: string, label: string) => {
    if (!confirm(`${label} this user?`)) return;
    setErr(null); setBusy(true);
    try { await apiCall(`/v1/platform/users/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }); await load(); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const unlock = async () => {
    setErr(null); setBusy(true);
    try { await apiCall(`/v1/platform/users/${id}/unlock`, { method: 'PUT' }); await load(); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const hardDelete = async () => {
    if (!confirm('PERMANENTLY delete this user? This cannot be undone.')) return;
    setErr(null); setBusy(true);
    try { await apiCall(`/v1/platform/users/${id}/hard`, { method: 'DELETE' }); onBack(); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const changeRole = async (role: string) => {
    setErr(null); setBusy(true);
    try { await apiCall(`/v1/platform/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }); await load(); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const changePlan = async (planSlug: string) => {
    if (!planSlug) return;
    setErr(null); setBusy(true);
    try { await apiCall(`/v1/platform/users/${id}/plan`, { method: 'PUT', body: JSON.stringify({ planSlug }) }); await load(); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const setSubStatus = async (status: string) => {
    setErr(null); setBusy(true);
    try { await apiCall(`/v1/platform/users/${id}/subscription-status`, { method: 'PUT', body: JSON.stringify({ status }) }); await load(); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const setTrial = async () => {
    const v = prompt('Trial end date (YYYY-MM-DD or ISO):');
    if (!v) return;
    setErr(null); setBusy(true);
    try { await apiCall(`/v1/platform/users/${id}/trial`, { method: 'PUT', body: JSON.stringify({ trialEndDate: v }) }); await load(); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const [resyncResult, setResyncResult] = useState<{
    mode?: string;
    scanned?: number;
    reconciled?: number;
    needsAttention?: number;
    needsAttentionAddons?: Array<{ stripeSubscriptionId: string; moduleSlug: string | null; reason?: string }>;
    message?: string;
  } | null>(null);
  const resync = async () => {
    setErr(null); setBusy(true);
    try {
      const r = await apiCall(`/v1/platform/billing/resync/${id}`, { method: 'POST' });
      setResyncResult(r);
      await load();
    }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  if (!data) return <div style={{ color: colors.textMuted }}>Loading…</div>;
  const u = data.user;
  return (
    <div>
      <Btn data-testid="button-user-back" onClick={onBack} style={{ marginBottom: 12 }}>← Back</Btn>
      <ErrorBlock err={err} />
      <Card>
        <h2 style={{ margin: 0, fontSize: 18 }} data-testid="text-user-email">{u.email}</h2>
        <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
          <code>{u.id}</code> · {u.name ?? '—'} ·
          status=<Pill tone={u.status === 'active' ? 'green' : u.status === 'suspended' ? 'yellow' : 'red'}>{u.status}</Pill> ·
          role=<Pill tone={u.role === 'admin' ? 'yellow' : 'muted'}>{u.role}</Pill>
          {u.platformRole === 'super_admin' && <Pill tone="purple">super_admin</Pill>}
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: colors.textMuted }}>
          workspaces: {data.stats.workspaces} · projects: {data.stats.projects} · tasks: {data.stats.tasks} · notes: {data.stats.notes}
          {u.lockedUntil && <> · <Pill tone="red">locked until {new Date(u.lockedUntil).toLocaleString()}</Pill></>}
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {u.status !== 'suspended' && u.status !== 'deleted' && <Btn data-testid="button-suspend" disabled={busy} onClick={() => setStatus('suspended', 'Suspend')}>Suspend</Btn>}
          {u.status === 'suspended' && <Btn data-testid="button-reactivate" variant="primary" disabled={busy} onClick={() => setStatus('active', 'Reactivate')}>Reactivate</Btn>}
          {u.status !== 'deleted' && <Btn data-testid="button-soft-delete" variant="danger" disabled={busy} onClick={() => setStatus('deleted', 'Soft-delete')}>Soft-delete</Btn>}
          {u.status === 'deleted' && <Btn data-testid="button-hard-delete" variant="danger" disabled={busy} onClick={hardDelete}>Hard delete</Btn>}
          {u.lockedUntil && <Btn data-testid="button-unlock" disabled={busy} onClick={unlock}>Unlock</Btn>}
          <Btn data-testid="button-resync-billing" disabled={busy} onClick={resync}>Resync billing</Btn>
        </div>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0, fontSize: 14 }}>Subscription</h3>
        <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 8 }}>
          plan: <code>{data.plan?.slug ?? '—'}</code> · status: <code>{data.subscription?.status ?? '—'}</code>
          {data.subscription?.currentPeriodEnd && <> · ends: {new Date(data.subscription.currentPeriodEnd).toLocaleString()}</>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select data-testid="select-change-plan" defaultValue="" disabled={busy} onChange={e => { const v = e.target.value; e.target.value = ''; changePlan(v); }} style={inp}>
            <option value="">Change plan…</option>
            <option value="free">free</option>
            <option value="starter">starter</option>
            <option value="pro">pro</option>
            <option value="elite">elite</option>
          </select>
          <select data-testid="select-change-role" value={u.role} disabled={busy} onChange={e => changeRole(e.target.value)} style={inp}>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          <select data-testid="select-sub-status" defaultValue="" disabled={busy} onChange={e => { const v = e.target.value; e.target.value = ''; if (v) setSubStatus(v); }} style={inp}>
            <option value="">Force sub status…</option>
            <option value="active">active</option>
            <option value="trialing">trialing</option>
            <option value="past_due">past_due</option>
            <option value="canceled">canceled</option>
            <option value="expired">expired</option>
          </select>
          <Btn data-testid="button-set-trial" onClick={setTrial} disabled={busy}>Set trial end…</Btn>
        </div>
      </Card>

      <UserModuleOverrides userId={id} />
      <UserBillingEvents events={data.billingEvents ?? []} />
      <UserAuditHistory rows={data.auditHistory ?? []} />
      {resyncResult && (
        <ResyncResultDialog result={resyncResult} onClose={() => setResyncResult(null)} />
      )}
    </div>
  );
}

function ResyncResultDialog({
  result,
  onClose,
}: {
  result: {
    mode?: string;
    scanned?: number;
    reconciled?: number;
    needsAttention?: number;
    needsAttentionAddons?: Array<{ stripeSubscriptionId: string; moduleSlug: string | null; reason?: string }>;
    message?: string;
  };
  onClose: () => void;
}) {
  const needsAttention = result.needsAttention ?? 0;
  const addons = result.needsAttentionAddons ?? [];
  const tone: 'green' | 'yellow' = needsAttention > 0 ? 'yellow' : 'green';
  return (
    <div
      data-testid="dialog-resync-result"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resync-result-title"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, zIndex: 50,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: colors.bgSecondary, border: `1px solid ${colors.border}`,
          borderRadius: 8, padding: 20, maxWidth: 640, width: '100%',
          maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 id="resync-result-title" style={{ margin: 0, fontSize: 16 }}>Resync billing</h3>
          <Pill tone={tone}>{needsAttention > 0 ? 'Needs attention' : 'Healthy'}</Pill>
        </div>
        <div style={{ fontSize: 13, color: colors.text, marginBottom: 8 }} data-testid="text-resync-summary">
          mode: <code>{result.mode ?? '—'}</code> ·
          scanned: <code data-testid="text-resync-scanned">{result.scanned ?? 0}</code> ·
          reconciled: <code data-testid="text-resync-reconciled">{result.reconciled ?? 0}</code> ·
          needs attention: <code data-testid="text-resync-needs-attention">{needsAttention}</code>
        </div>
        {result.message && (
          <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>{result.message}</div>
        )}
        {needsAttention > 0 && (
          <div data-testid="list-needs-attention-addons" style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>
              These add-on subscriptions exist in Stripe but couldn't be reconciled locally. Investigate each one:
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: colors.textMuted }}>
                  <th style={{ padding: '6px 8px', borderBottom: `1px solid ${colors.border}` }}>Stripe subscription</th>
                  <th style={{ padding: '6px 8px', borderBottom: `1px solid ${colors.border}` }}>Module</th>
                  <th style={{ padding: '6px 8px', borderBottom: `1px solid ${colors.border}` }}>Reason</th>
                </tr>
              </thead>
              <tbody>
                {addons.map(a => (
                  <tr key={a.stripeSubscriptionId} data-testid={`row-needs-attention-${a.stripeSubscriptionId}`}>
                    <td style={{ padding: '6px 8px', borderBottom: `1px solid ${colors.border}` }}>
                      <code data-testid={`text-needs-attention-sub-${a.stripeSubscriptionId}`}>{a.stripeSubscriptionId}</code>
                    </td>
                    <td style={{ padding: '6px 8px', borderBottom: `1px solid ${colors.border}` }}>
                      <code data-testid={`text-needs-attention-module-${a.stripeSubscriptionId}`}>{a.moduleSlug ?? '—'}</code>
                    </td>
                    <td style={{ padding: '6px 8px', borderBottom: `1px solid ${colors.border}`, color: colors.textMuted }}>
                      {a.reason ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <Btn data-testid="button-resync-result-close" variant="primary" onClick={onClose}>Close</Btn>
        </div>
      </div>
    </div>
  );
}

function UserModuleOverrides({ userId }: { userId: string }) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [moduleSlug, setModuleSlug] = useState('');
  const [grant, setGrant] = useState(true);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => apiCall(`/v1/platform/users/${userId}/module-overrides`).then(setData).catch(setErr);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [userId]);
  const add = async () => {
    if (!moduleSlug) return;
    setErr(null); setBusy(true);
    try {
      await apiCall(`/v1/platform/users/${userId}/module-overrides`, {
        method: 'POST', body: JSON.stringify({ moduleSlug, grant, reason: reason || undefined }),
      });
      setModuleSlug(''); setReason(''); await load();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const remove = async (overrideId: string) => {
    setErr(null); setBusy(true);
    try { await apiCall(`/v1/platform/users/${userId}/module-overrides/${overrideId}`, { method: 'DELETE' }); await load(); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  if (!data) return null;
  return (
    <Card style={{ marginTop: 12 }} data-testid="block-user-overrides">
      <h3 style={{ marginTop: 0, fontSize: 14 }}>Per-user module overrides</h3>
      <ErrorBlock err={err} />
      {(data.overrides ?? []).length === 0
        ? <div style={{ color: colors.textMuted, fontSize: 13, marginBottom: 8 }}>No overrides set.</div>
        : <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginBottom: 8 }}>
            <thead><tr style={{ color: colors.textMuted }}><Th>Module</Th><Th>Grant</Th><Th>Reason</Th><Th>Expires</Th><Th></Th></tr></thead>
            <tbody>
              {data.overrides.map((o: any) => (
                <tr key={o.id} style={{ borderTop: `1px solid ${colors.border}` }} data-testid={`row-override-${o.id}`}>
                  <Td><code>{o.moduleSlug}</code> {o.moduleName}</Td>
                  <Td>{o.grant ? <Pill tone="green">grant</Pill> : <Pill tone="red">revoke</Pill>}</Td>
                  <Td>{o.reason ?? '—'}</Td>
                  <Td>{o.expiresAt ? new Date(o.expiresAt).toLocaleDateString() : 'never'}</Td>
                  <Td><Btn data-testid={`button-remove-override-${o.id}`} variant="danger" disabled={busy} onClick={() => remove(o.id)}>Remove</Btn></Td>
                </tr>
              ))}
            </tbody>
          </table>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input data-testid="input-override-module" placeholder="module slug…" value={moduleSlug} onChange={e => setModuleSlug(e.target.value)} style={{ ...inp, minWidth: 180 }} />
        <select data-testid="select-override-grant" value={grant ? '1' : '0'} onChange={e => setGrant(e.target.value === '1')} style={inp}>
          <option value="1">grant</option>
          <option value="0">revoke</option>
        </select>
        <input data-testid="input-override-reason" placeholder="reason (optional)…" value={reason} onChange={e => setReason(e.target.value)} style={{ ...inp, flex: 1, minWidth: 200 }} />
        <Btn data-testid="button-add-override" variant="primary" disabled={busy || !moduleSlug} onClick={add}>Add override</Btn>
      </div>
    </Card>
  );
}

function UserBillingEvents({ events }: { events: any[] }) {
  if (!events.length) return null;
  return (
    <Card style={{ marginTop: 12 }} data-testid="block-user-billing-events">
      <h3 style={{ marginTop: 0, fontSize: 14 }}>Recent billing events</h3>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead><tr style={{ color: colors.textMuted }}><Th>When</Th><Th>Type</Th><Th>Processed</Th><Th>Error</Th></tr></thead>
        <tbody>
          {events.map((e: any) => (
            <tr key={e.id} style={{ borderTop: `1px solid ${colors.border}` }}>
              <Td>{new Date(e.createdAt).toLocaleString()}</Td>
              <Td>{e.eventType}</Td>
              <Td>{e.processedAt ? <Pill tone="green">ok</Pill> : <Pill tone="yellow">pending</Pill>}</Td>
              <Td style={{ color: colors.accentRed }}>{e.errorMessage ?? ''}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function UserAuditHistory({ rows }: { rows: any[] }) {
  if (!rows.length) return null;
  return (
    <Card style={{ marginTop: 12 }} data-testid="block-user-audit">
      <h3 style={{ marginTop: 0, fontSize: 14 }}>Audit history</h3>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead><tr style={{ color: colors.textMuted }}><Th>When</Th><Th>Action</Th><Th>Actor</Th></tr></thead>
        <tbody>
          {rows.map((l: any) => (
            <tr key={l.id} style={{ borderTop: `1px solid ${colors.border}` }}>
              <Td>{new Date(l.createdAt).toLocaleString()}</Td>
              <Td><code>{l.action}</code></Td>
              <Td>{l.adminId}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function ModuleEditForm({ module: m, onSaved }: { module: any; onSaved: () => void }) {
  const STATUSES = ['live', 'active', 'beta', 'coming_soon', 'hidden', 'deprecated', 'disabled'];
  const PLANS = ['starter', 'pro', 'elite'];
  const meta = (m.metadata ?? {}) as any;
  const [name, setName] = useState(m.name ?? '');
  const [slug, setSlug] = useState(m.slug);
  const [description, setDescription] = useState(m.description ?? '');
  const [iconUrl, setIconUrl] = useState(m.iconUrl ?? '');
  const [baseUrl, setBaseUrl] = useState(m.baseUrl ?? '');
  const [category, setCategory] = useState(m.category ?? '');
  const [status, setStatus] = useState(m.status);
  const [planMin, setPlanMin] = useState(m.planMin);
  const [ord, setOrd] = useState(String(m.ord ?? 0));
  // Spec-grade fields stored under modules.metadata JSONB so they don't
  // require DDL. PATCH writes the merged metadata blob back.
  const [tagline, setTagline] = useState(meta.tagline ?? '');
  const [shortDescription, setShortDescription] = useState(meta.shortDescription ?? '');
  const [longDescription, setLongDescription] = useState(meta.longDescription ?? '');
  const [iconName, setIconName] = useState(meta.iconName ?? '');
  const [accentColor, setAccentColor] = useState(meta.accentColor ?? '');
  const [internalRoute, setInternalRoute] = useState(meta.internalRoute ?? '');
  const [externalUrl, setExternalUrl] = useState(meta.externalUrl ?? '');
  const [marketingUrl, setMarketingUrl] = useState(meta.marketingUrl ?? '');
  const [docsUrl, setDocsUrl] = useState(meta.docsUrl ?? '');
  const [supportUrl, setSupportUrl] = useState(meta.supportUrl ?? '');
  const [isCore, setIsCore] = useState(!!meta.isCore);
  const [isPaidAddon, setIsPaidAddon] = useState(!!meta.isPaidAddon);
  const addonAnnualPriceCents = meta.addonAnnualPriceCents;
  const stripePriceEnvKey = meta.stripePriceEnvKey ?? '';
  const [featureTagsCsv, setFeatureTagsCsv] = useState(Array.isArray(meta.featureTags) ? meta.featureTags.join(', ') : '');

  const [err, setErr] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setErr(null); setBusy(true);
    try {
      const body: any = {};
      if (name !== (m.name ?? '')) body.name = name;
      if (slug !== m.slug) body.slug = slug;
      if (description !== (m.description ?? '')) body.description = description;
      if (iconUrl !== (m.iconUrl ?? '')) body.iconUrl = iconUrl || null;
      if (baseUrl !== (m.baseUrl ?? '')) body.baseUrl = baseUrl || null;
      if (category !== (m.category ?? '')) body.category = category || null;
      if (status !== m.status) body.status = status;
      if (planMin !== m.planMin) body.planMin = planMin;
      if (parseInt(ord) !== (m.ord ?? 0)) body.ord = parseInt(ord);

      const nextMeta: any = { ...meta };
      const setOrUnset = (k: string, v: any) => {
        if (v === '' || v === null || v === undefined) delete nextMeta[k];
        else nextMeta[k] = v;
      };
      setOrUnset('tagline', tagline);
      setOrUnset('shortDescription', shortDescription);
      setOrUnset('longDescription', longDescription);
      setOrUnset('iconName', iconName);
      setOrUnset('accentColor', accentColor);
      setOrUnset('internalRoute', internalRoute);
      setOrUnset('externalUrl', externalUrl);
      setOrUnset('marketingUrl', marketingUrl);
      setOrUnset('docsUrl', docsUrl);
      setOrUnset('supportUrl', supportUrl);
      nextMeta.isCore = isCore;
      nextMeta.isPaidAddon = isPaidAddon;
      const tags = featureTagsCsv.split(',').map((s: string) => s.trim()).filter(Boolean);
      if (tags.length === 0) delete nextMeta.featureTags; else nextMeta.featureTags = tags;
      if (JSON.stringify(nextMeta) !== JSON.stringify(meta)) body.metadata = nextMeta;

      if (Object.keys(body).length === 0) return;
      await apiCall(`/v1/platform/modules/${m.slug}`, { method: 'PATCH', body: JSON.stringify(body) });
      onSaved();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Card style={{ marginTop: 12 }} data-testid="form-module-edit">
      <h3 style={{ marginTop: 0, fontSize: 14 }}>Edit module</h3>
      <ErrorBlock err={err} />
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr', marginBottom: 8 }}>
        <Input label="Name"        value={name}        onChange={setName}        testid="input-mod-edit-name" />
        <Input label="Slug (changing requires no entitlement deps)" value={slug} onChange={setSlug} testid="input-mod-edit-slug" />
        <Input label="Category"    value={category}    onChange={setCategory}    testid="input-mod-edit-category" />
        <Input label="Order (ord)" value={ord}         onChange={setOrd}         testid="input-mod-edit-ord" />
        <Input label="Icon URL"    value={iconUrl}     onChange={setIconUrl}     testid="input-mod-edit-icon" />
        <Input label="Base URL"    value={baseUrl}     onChange={setBaseUrl}     testid="input-mod-edit-baseurl" />
        <div>
          <label style={{ display: 'block', fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>Status</label>
          <select data-testid="select-mod-edit-status" value={status} onChange={e => setStatus(e.target.value)} style={{ ...inp, width: '100%' }}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>planMin</label>
          <select data-testid="select-mod-edit-plan" value={planMin} onChange={e => setPlanMin(e.target.value)} style={{ ...inp, width: '100%' }}>
            {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>Description (legacy short field)</label>
        <textarea data-testid="input-mod-edit-description" value={description} onChange={e => setDescription(e.target.value)} rows={2} style={{ ...inp, width: '100%', fontFamily: 'inherit' }} />
      </div>

      <h4 style={{ marginTop: 16, marginBottom: 6, fontSize: 13, color: colors.textMuted }}>Spec-grade fields (stored in module metadata)</h4>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr', marginBottom: 8 }}>
        <Input label="Tagline"          value={tagline}        onChange={setTagline}        testid="input-mod-edit-tagline" />
        <Input label="Icon name (Lucide)" value={iconName}     onChange={setIconName}       testid="input-mod-edit-iconname" />
        <Input label="Accent color (hex)" value={accentColor}  onChange={setAccentColor}    testid="input-mod-edit-accent" />
        <Input label="Internal route"     value={internalRoute} onChange={setInternalRoute} testid="input-mod-edit-internalroute" />
        <Input label="External URL"       value={externalUrl}  onChange={setExternalUrl}    testid="input-mod-edit-external" />
        <Input label="Marketing URL"      value={marketingUrl} onChange={setMarketingUrl}   testid="input-mod-edit-marketing" />
        <Input label="Docs URL"           value={docsUrl}      onChange={setDocsUrl}        testid="input-mod-edit-docs" />
        <Input label="Support URL"        value={supportUrl}   onChange={setSupportUrl}     testid="input-mod-edit-support" />
        <div data-testid="badge-mod-annualprice">
          <label style={{ display: 'block', fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>Addon annual price (read-only)</label>
          <div style={{ ...inp, width: '100%', background: '#0d1117', color: colors.textMuted }}>
            {addonAnnualPriceCents != null ? `${addonAnnualPriceCents} cents` : '—'}
          </div>
        </div>
        <div data-testid="badge-mod-stripekey">
          <label style={{ display: 'block', fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>Stripe price env key (read-only)</label>
          <div style={{ ...inp, width: '100%', background: '#0d1117', color: colors.textMuted, fontFamily: 'monospace' }}>
            {stripePriceEnvKey || '—'}
          </div>
        </div>
        <Input label="Feature tags (comma-separated)" value={featureTagsCsv} onChange={setFeatureTagsCsv} testid="input-mod-edit-tags" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 16 }}>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input data-testid="check-mod-iscore" type="checkbox" checked={isCore} onChange={e => setIsCore(e.target.checked)} /> isCore
          </label>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input data-testid="check-mod-ispaidaddon" type="checkbox" checked={isPaidAddon} onChange={e => setIsPaidAddon(e.target.checked)} /> isPaidAddon
          </label>
        </div>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>Short description</label>
        <textarea data-testid="input-mod-edit-shortdesc" value={shortDescription} onChange={e => setShortDescription(e.target.value)} rows={2} style={{ ...inp, width: '100%', fontFamily: 'inherit' }} />
      </div>
      <div style={{ marginTop: 8 }}>
        <label style={{ display: 'block', fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>Long description</label>
        <textarea data-testid="input-mod-edit-longdesc" value={longDescription} onChange={e => setLongDescription(e.target.value)} rows={4} style={{ ...inp, width: '100%', fontFamily: 'inherit' }} />
      </div>

      <Btn data-testid="button-save-module" variant="primary" disabled={busy} onClick={save} style={{ marginTop: 12 }}>{busy ? 'Saving…' : 'Save module'}</Btn>
    </Card>
  );
}

// -------------------------------------------------------------------------
// Other tabs
// -------------------------------------------------------------------------

function BillingEvents() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [eventType, setEventType] = useState('');
  const [userId, setUserId] = useState('');
  const [err, setErr] = useState<any>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const load = () => {
    const qs = new URLSearchParams();
    if (onlyFailed) qs.set('onlyFailed', '1');
    if (eventType)  qs.set('eventType', eventType);
    if (userId)     qs.set('userId', userId);
    const q = qs.toString();
    apiCall(`/v1/platform/billing/events${q ? `?${q}` : ''}`).then(d => setRows(d.events)).catch(setErr);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [onlyFailed]);
  const retry = async (id: string) => {
    setErr(null); setRetrying(id);
    try {
      await apiCall(`/v1/platform/billing/events/${id}/retry`, { method: 'POST' });
      await load();
    } catch (e) { setErr(e); } finally { setRetrying(null); }
  };
  return (
    <div>
      <ErrorBlock err={err} />
      <div style={{ marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: colors.textMuted }}>
          <input data-testid="checkbox-only-failed" type="checkbox" checked={onlyFailed} onChange={e => setOnlyFailed(e.target.checked)} /> Only failed/unprocessed
        </label>
        <input
          data-testid="input-event-type"
          placeholder="event type contains…"
          value={eventType}
          onChange={e => setEventType(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') load(); }}
          style={{ ...inp, minWidth: 200 }}
        />
        <input
          data-testid="input-event-user"
          placeholder="user id…"
          value={userId}
          onChange={e => setUserId(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') load(); }}
          style={{ ...inp, minWidth: 220 }}
        />
        <Btn data-testid="button-billing-search" onClick={load}>Search</Btn>
      </div>
      <Card style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ background: colors.bgHover, color: colors.textMuted }}>
            <Th>Created</Th><Th>Type</Th><Th>User</Th><Th>Stripe Event</Th><Th>Processed</Th><Th>Error</Th><Th></Th>
          </tr></thead>
          <tbody>
            {(rows ?? []).map(e => {
              const failed = !!e.errorMessage && !e.processedAt;
              return (
                <tr key={e.id} style={{ borderTop: `1px solid ${colors.border}` }} data-testid={`row-billing-${e.id}`}>
                  <Td>{new Date(e.createdAt).toLocaleString()}</Td>
                  <Td>{e.eventType}</Td>
                  <Td><code>{e.userId}</code></Td>
                  <Td><code>{e.stripeEventId ?? '—'}</code></Td>
                  <Td>{e.processedAt ? <Pill tone="green">ok</Pill> : <Pill tone="yellow">pending</Pill>}</Td>
                  <Td style={{ color: colors.accentRed }}>{e.errorMessage ?? ''}</Td>
                  <Td>
                    {failed && (
                      <Btn data-testid={`button-retry-${e.id}`} onClick={() => retry(e.id)} disabled={retrying === e.id}>
                        {retrying === e.id ? 'Retrying…' : 'Retry'}
                      </Btn>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Pricing() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [stripeMode, setStripeMode] = useState<string>('off');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<any>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = () => apiCall('/v1/platform/pricing')
    .then(d => { setRows(d.pricing); setStripeMode(d.stripeMode || 'off'); })
    .catch(setErr);
  useEffect(() => { reload(); }, []);

  const sync = async (slug: string) => {
    setErr(null); setNotice(null); setBusy(`sync:${slug}`);
    try {
      const r = await apiCall(`/v1/platform/pricing/${encodeURIComponent(slug)}/sync-from-stripe`, { method: 'POST' });
      setNotice(`Synced ${slug}: declared price is now ${r.nextCents}¢ (was ${r.previousCents ?? '—'}¢).`);
      await reload();
    } catch (e) { setErr(e); } finally { setBusy(null); }
  };

  const createPrice = async (slug: string, declaredCents: number | null) => {
    setErr(null); setNotice(null);
    const def = String(declaredCents ?? '');
    const input = window.prompt(
      `Create a NEW Stripe Price for "${slug}" (recurring monthly).\n\nEnter the new unit_amount in CENTS.\nThis will create a fresh Stripe Price, persist it to modules.metadata.stripePriceId (survives restart), point the in-process env binding at it, and align the declared price.\n\nThe previous priceId is preserved in the audit log so you can restore it from the module's "Stripe Price ID override" field if needed.`,
      def,
    );
    if (input == null) return;
    const cents = parseInt(input, 10);
    if (!Number.isFinite(cents) || cents <= 0) { setErr(new Error('Invalid cents value')); return; }
    setBusy(`create:${slug}`);
    try {
      const r = await apiCall(`/v1/platform/pricing/${encodeURIComponent(slug)}/create-stripe-price`, {
        method: 'POST',
        body: JSON.stringify({ unitAmountCents: cents }),
      });
      const persistedNote = r.persistedToMetadata
        ? ' Persisted to modules.metadata.stripePriceId — survives restart.'
        : '';
      setNotice(
        `Created Stripe price ${r.newPriceId} for ${slug} at ${r.nextCents}¢ ${r.currency?.toUpperCase?.() || ''}.` +
        persistedNote +
        (r.requiresSecretRotation ? ` IMPORTANT: ${r.secretRotationHint}` : ''),
      );
      await reload();
    } catch (e) { setErr(e); } finally { setBusy(null); }
  };

  if (!rows) return <div style={{ color: colors.textMuted }}>Loading…</div>;

  const mismatchCount = rows.filter(r => r.mismatch).length;
  const isLive = stripeMode === 'live';

  return (
    <div>
      <ErrorBlock err={err} />
      {notice && (
        <div data-testid="pricing-notice" style={{
          padding: 12, marginBottom: 12, borderRadius: 6,
          border: `1px solid ${colors.accentGreen}`, color: colors.text,
          background: colors.bgSecondary, fontSize: 13,
        }}>{notice}</div>
      )}
      <div data-testid="pricing-banner" style={{
        padding: 12, marginBottom: 12, borderRadius: 6,
        border: `1px solid ${mismatchCount > 0 ? colors.accentRed : colors.border}`,
        background: colors.bgSecondary, color: colors.text, fontSize: 13, lineHeight: 1.5,
      }}>
        <div style={{ marginBottom: 6 }}>
          <strong>Pricing drift inspector</strong>{' '}
          <Pill tone={isLive ? 'green' : 'yellow'}>STRIPE_MODE={stripeMode}</Pill>{' '}
          {mismatchCount > 0
            ? <Pill tone="red">{mismatchCount} mismatch{mismatchCount === 1 ? '' : 'es'}</Pill>
            : <Pill tone="green">all aligned</Pill>}
        </div>
        <div style={{ color: colors.textMuted }}>
          When the declared price (modules.metadata.addonPriceCents) differs from what Stripe will actually charge, customers can be silently over- or undercharged.
          {' '}<strong>Sync from Stripe</strong> trusts Stripe and rewrites the declared price to match the live unit_amount.
          {' '}<strong>Create new Stripe price</strong> provisions a fresh Stripe Price at the amount you choose, points the in-process env binding at it, and aligns the declared price — use this when Stripe is wrong (e.g. you priced incorrectly there) or no price is bound yet.
          {isLive ? '' : ' (Create is disabled because STRIPE_MODE is not "live".)'}
        </div>
      </div>
      <Card style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: colors.bgHover, color: colors.textMuted }}>
            <Th>Module</Th><Th>Declared (¢)</Th><Th>Stripe (¢)</Th><Th>Currency</Th><Th>Binding</Th><Th>Status</Th><Th>Actions</Th>
          </tr></thead>
          <tbody>
            {rows.map(p => {
              const canSync = p.envKeyConfigured && p.stripeFetched && p.mismatch;
              const createDisabled = !isLive || busy != null;
              return (
                <tr key={p.slug} style={{ borderTop: `1px solid ${colors.border}` }} data-testid={`row-pricing-${p.slug}`}>
                  <Td>{p.name} <span style={{ color: colors.textMuted, fontSize: 11 }}>{p.slug}</span></Td>
                  <Td data-testid={`text-declared-${p.slug}`}>{p.declaredAddonPriceCents ?? '—'}</Td>
                  <Td data-testid={`text-stripe-${p.slug}`}>{p.stripeUnitAmountCents ?? '—'}</Td>
                  <Td>{p.stripeCurrency ?? '—'}</Td>
                  <Td data-testid={`text-binding-source-row-${p.slug}`}>
                    {p.priceSource === 'override' && <Pill tone="green">via override</Pill>}
                    {p.priceSource === 'env' && <Pill tone="green">via env</Pill>}
                    {p.priceSource === 'none' && <Pill tone="muted">not configured</Pill>}
                    <div style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                      {p.priceId ? <code>{p.priceId}</code> : '—'}
                    </div>
                    <div style={{ color: colors.textMuted, fontSize: 11 }}>
                      env <code>{p.envKey}</code>{p.envPriceId ? <> = <code>{p.envPriceId}</code></> : ' (unset)'}
                    </div>
                  </Td>
                  <Td>{p.mismatch ? <Pill tone="red">mismatch</Pill> : (p.error ? <Pill tone="yellow">{p.error}</Pill> : <Pill tone="green">ok</Pill>)}</Td>
                  <Td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Btn
                        data-testid={`button-sync-${p.slug}`}
                        variant={canSync ? 'primary' : 'default'}
                        disabled={!canSync || busy != null}
                        title={canSync
                          ? 'Overwrite the declared price with the live Stripe unit_amount'
                          : 'No mismatch to sync (or Stripe price not fetched).'}
                        onClick={() => sync(p.slug)}
                      >{busy === `sync:${p.slug}` ? 'Syncing…' : 'Sync from Stripe'}</Btn>
                      <Btn
                        data-testid={`button-create-${p.slug}`}
                        disabled={createDisabled}
                        title={isLive
                          ? 'Create a NEW Stripe price and rotate the env binding'
                          : 'Disabled: STRIPE_MODE is not "live".'}
                        onClick={() => createPrice(p.slug, p.declaredAddonPriceCents)}
                      >{busy === `create:${p.slug}` ? 'Creating…' : 'Create new Stripe price'}</Btn>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
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
  const [actorUserId, setActorUserId] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [limit, setLimit] = useState(100);
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState<any>(null);
  const load = (newOffset = offset) => {
    const qs = new URLSearchParams();
    if (action)       qs.set('action', action);
    if (actorUserId)  qs.set('actorUserId', actorUserId);
    if (tenantId)     qs.set('tenantId', tenantId);
    if (fromDate)     qs.set('fromDate', new Date(fromDate).toISOString());
    if (toDate)       qs.set('toDate',   new Date(toDate).toISOString());
    qs.set('limit', String(limit));
    qs.set('offset', String(newOffset));
    apiCall(`/v1/platform/audit?${qs.toString()}`).then(d => setRows(d.logs)).catch(setErr);
  };
  useEffect(() => { load(0); /* eslint-disable-next-line */ }, []);
  const search = () => { setOffset(0); load(0); };
  const next = () => { const o = offset + limit; setOffset(o); load(o); };
  const prev = () => { const o = Math.max(0, offset - limit); setOffset(o); load(o); };
  return (
    <div>
      <ErrorBlock err={err} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 12 }}>
        <input data-testid="input-audit-action"     placeholder="action contains…"      value={action}       onChange={e => setAction(e.target.value)}       style={inp} />
        <input data-testid="input-audit-actor"      placeholder="actor user id…"        value={actorUserId}  onChange={e => setActorUserId(e.target.value)}  style={inp} />
        <input data-testid="input-audit-tenant"     placeholder="tenant id…"            value={tenantId}     onChange={e => setTenantId(e.target.value)}     style={inp} />
        <input data-testid="input-audit-from"       type="datetime-local"               value={fromDate}     onChange={e => setFromDate(e.target.value)}     style={inp} />
        <input data-testid="input-audit-to"         type="datetime-local"               value={toDate}       onChange={e => setToDate(e.target.value)}       style={inp} />
        <select data-testid="select-audit-limit" value={limit} onChange={e => setLimit(parseInt(e.target.value))} style={inp}>
          <option value={50}>50 per page</option><option value={100}>100 per page</option><option value={200}>200 per page</option><option value={500}>500 per page</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <Btn data-testid="button-audit-search" variant="primary" onClick={search}>Search</Btn>
        <Btn data-testid="button-audit-prev"   onClick={prev}    disabled={offset === 0}>← Prev</Btn>
        <Btn data-testid="button-audit-next"   onClick={next}    disabled={(rows?.length ?? 0) < limit}>Next →</Btn>
        <span style={{ color: colors.textMuted, fontSize: 12 }}>showing {offset + 1}–{offset + (rows?.length ?? 0)}</span>
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
            {rows && rows.length === 0 && <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: colors.textMuted }}>No audit rows match the filter.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

const inp: React.CSSProperties = {
  background: colors.bgSecondary, color: colors.text,
  border: `1px solid ${colors.border}`, borderRadius: 6,
  padding: '6px 10px', fontSize: 13,
};

// -------------------------------------------------------------------------
// Tiny inputs
// -------------------------------------------------------------------------

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
