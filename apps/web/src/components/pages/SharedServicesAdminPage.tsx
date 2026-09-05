'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowRight, Boxes, KeyRound, Link2, RefreshCw, RotateCcw, Send, ServerCog, ShieldCheck, Users } from 'lucide-react';
import { sharedPlatformApi, tenantApi } from '@/lib/auth';
import { getActiveTenantId } from '@/lib/auth';
import { cardStyle, buttonStyles, semantic, space, fontSize, radius } from '@/lib/design-tokens';

type Props = { onNavigate: (page: string) => void };

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: radius.sm,
  border: `1px solid ${semantic.border}`, background: semantic.bg, color: semantic.text,
};

const field = (label: string, control: React.ReactNode) => (
  <label style={{ display: 'grid', gap: 5, color: semantic.textMuted, fontSize: fontSize.sm }}>
    {label}{control}
  </label>
);

function StateBadge({ value }: { value: string }) {
  const color = ['ready', 'delivered', 'completed', 'clean', 'active'].includes(value) ? semantic.accentSuccess
    : ['blocked', 'dead_letter', 'infected', 'error', 'disabled'].includes(value) ? semantic.accentDanger
      : semantic.accentWarning;
  return <span style={{ color, border: `1px solid ${color}66`, borderRadius: 999, padding: '2px 7px', fontSize: 11 }}>{value.replaceAll('_', ' ')}</span>;
}

export default function SharedServicesAdminPage({ onNavigate }: Props) {
  const tenantId = getActiveTenantId();
  const [overview, setOverview] = useState<any>(null);
  const [operations, setOperations] = useState<any>(null);
  const [modules, setModules] = useState<any[]>([]);
  const [endpoints, setEndpoints] = useState<any[]>([]);
  const [fabricRuns, setFabricRuns] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [oneTimeToken, setOneTimeToken] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setError(null);
    try {
      const [nextOverview, nextOperations, moduleData, endpointData, fabricData] = await Promise.all([
        sharedPlatformApi.overview(tenantId), sharedPlatformApi.operations(tenantId),
        tenantApi.listModules(tenantId), sharedPlatformApi.webhookEndpoints(tenantId), sharedPlatformApi.dataFabricActivity(tenantId),
      ]);
      setOverview(nextOverview); setOperations(nextOperations);
      setModules(moduleData.modules ?? []); setEndpoints(endpointData.endpoints ?? []);
      setFabricRuns(fabricData.runs ?? []);
    } catch (e: any) { setError(e?.error || 'Shared service control data could not be loaded.'); }
  }, [tenantId]);

  useEffect(() => { void refresh(); }, [refresh]);
  const defaultModule = useMemo(() => modules.find(m => m.status === 'active' || m.enabled)?.slug ?? modules[0]?.slug ?? '', [modules]);

  if (!tenantId) return <div style={{ padding: space.xxl, color: semantic.textMuted }}>Choose an organization to manage shared services.</div>;

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key); setError(null);
    try { await action(); await refresh(); }
    catch (e: any) { setError(e?.error || 'The shared service operation did not complete.'); }
    finally { setBusy(null); }
  };

  return (
    <div style={{ padding: space.xxl, maxWidth: 1180, margin: '0 auto', color: semantic.text }} data-testid="page-shared-services-admin">
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: space.xl }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, display: 'flex', gap: 9, alignItems: 'center' }}><ServerCog size={23} color={semantic.accent} /> Shared services</h1>
          <p style={{ color: semantic.textMuted, margin: '5px 0 0' }}>Manage shared connections, background work, application activity, held items, secure access, usage, and exports for this organization.</p>
        </div>
        <button data-testid="button-refresh-shared-services" style={buttonStyles.secondary} onClick={() => void refresh()}><RefreshCw size={14} /> Refresh</button>
      </header>

      {error && <div role="alert" data-testid="shared-services-error" style={{ ...cardStyle, borderColor: semantic.accentDanger, color: semantic.accentDanger, marginBottom: space.lg }}>{error}</div>}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginBottom: space.lg }} aria-label="Shared service health">
        {[
          ['Background work', overview?.worker?.started ? 'ready' : 'blocked', overview?.worker?.lastErrorCode || 'Completes and safely retries queued work'],
          ['Connection credentials', overview?.secretVault?.configured ? 'ready' : overview?.secretVault?.mode === 'test' ? 'test' : 'blocked', overview?.secretVault?.keyVersion || overview?.secretVault?.reasonCode],
          ['Files held for review', String(overview?.counts?.quarantined_attachments ?? 0), 'files waiting for or failing a safety check'],
          ['Items needing retry', String(Number(overview?.queues?.jobs_dead_letter || 0) + Number(overview?.queues?.outbound_webhooks_dead_letter || 0) + Number(overview?.queues?.outbox_dead_letter || 0)), 'can be retried with a recorded activity history'],
          ['API tokens', String(overview?.counts?.active_api_tokens ?? 0), 'active scoped credentials'],
          ['Credits used', String(overview?.counts?.credits_consumed ?? 0), 'durable usage ledger'],
        ].map(([label, value, detail]) => <div key={label} style={cardStyle}><div style={{ color: semantic.textMuted, fontSize: 12 }}>{label}</div><div style={{ fontSize: 21, fontWeight: 700, margin: '5px 0' }}>{['ready','blocked','test'].includes(value) ? <StateBadge value={value} /> : value}</div><div style={{ color: semantic.textMuted, fontSize: 11 }}>{detail}</div></div>)}
      </section>

      <section style={{ ...cardStyle, marginBottom: space.lg }} data-testid="shared-team-access-links">
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}><Users size={16} /> Team and application access</h2>
        <p style={{ color: semantic.textMuted, fontSize: 13 }}>OperatorOS manages team roles and application access in one place. Use these links to review or change who can do what.</p>
        <div style={{ display: 'flex', gap: 8 }}><button style={buttonStyles.secondary} onClick={() => onNavigate('tenant-users')}><Users size={13} /> Team members</button><button style={buttonStyles.secondary} onClick={() => onNavigate('tenant-modules')}><Boxes size={13} /> Tool access</button></div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 14, marginBottom: space.lg }}>
        <ProviderSetup busy={busy} providers={overview?.providers ?? []} run={run} tenantId={tenantId} />
        <WebhookSetup busy={busy} endpoints={endpoints} modules={modules} defaultModule={defaultModule} run={run} tenantId={tenantId} />
        <TokenSetup busy={busy} tokens={operations?.tokens ?? []} run={run} tenantId={tenantId} oneTimeToken={oneTimeToken} setOneTimeToken={setOneTimeToken} />
        <ExportSetup busy={busy} defaultModule={defaultModule} run={run} tenantId={tenantId} />
      </div>

      <OperationsTable operations={operations} modules={modules} busy={busy} run={run} tenantId={tenantId} />
      <DataFabricActivity runs={fabricRuns} busy={busy} run={run} tenantId={tenantId} />
    </div>
  );
}

function DataFabricActivity({ runs, busy, run, tenantId }: any) {
  return <section style={{ ...cardStyle, marginTop: space.lg }} data-testid="cross-module-provenance">
    <h2 style={{ margin: '0 0 5px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 7 }}><Link2 size={16} /> Activity between applications</h2>
    <p style={{ color: semantic.textMuted, fontSize: 12, margin: '0 0 10px' }}>Each entry shows what was created, where it came from, where it went, and whether it needs attention. Repeating the same request will not create duplicates.</p>
    {runs.length ? runs.map((item: any) => <article key={item.id} data-testid={`fabric-run-${item.id}`} style={{ borderTop: `1px solid ${semantic.border}`, padding: '10px 0', display: 'grid', gap: 7 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 12 }}>
        <strong>{item.source_module_name || item.source_module_slug}</strong><ArrowRight size={13} aria-hidden="true" /><strong>{item.destination_module_name || item.destination_module_slug}</strong>
        <StateBadge value={item.status} />
        <span style={{ color: semantic.textMuted }}>attempts {item.attempt_count ?? 0}/{item.max_attempts ?? 0} · replays {item.replay_count ?? 0}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 12 }}>
        {item.source_deep_link && <a href={item.source_deep_link} style={{ color: semantic.accent }}>Open original item</a>}
        {item.destination_deep_link && <a href={item.destination_deep_link} style={{ color: semantic.accent }}>Open created item</a>}
        <span style={{ color: semantic.textMuted }}>Started by {item.actor_email || 'a former team member'}</span>
        <details style={{ color: semantic.textMuted }}><summary>Technical details</summary><code>{item.workflow_key}{item.last_error_code ? ` · ${item.last_error_code}` : ''}</code></details>
        {item.delivery_status === 'dead_letter' && <button style={buttonStyles.secondary} disabled={busy === `fabric-${item.inbox_id}`} onClick={() => run(`fabric-${item.inbox_id}`, () => sharedPlatformApi.replayDataFabricInbox(tenantId,item.inbox_id))}><RotateCcw size={13} /> Try again</button>}
      </div>
    </article>) : <div style={{ color: semantic.textMuted, fontSize: 12 }}>No work has moved between applications yet.</div>}
  </section>;
}

function ProviderSetup({ busy, providers, run, tenantId }: any) {
  const [providerKey, setProviderKey] = useState('email.primary');
  const [kind, setKind] = useState('email');
  const [mode, setMode] = useState('disabled');
  const [secretReference, setSecretReference] = useState('');
  const [callbackReady, setCallbackReady] = useState(false);
  return <section style={cardStyle} data-testid="provider-setup">
    <h2 style={{ margin: '0 0 10px', fontSize: 16 }}><ShieldCheck size={16} /> External service connections</h2>
    <div style={{ display: 'grid', gap: 9 }}>
      {field('Connection key', <input style={inputStyle} value={providerKey} onChange={e => setProviderKey(e.target.value)} />)}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {field('Service type', <select style={inputStyle} value={kind} onChange={e => setKind(e.target.value)}>{['email','sms','ai','storage','oauth','webhook'].map(v => <option key={v}>{v}</option>)}</select>)}
        {field('Availability', <select style={inputStyle} value={mode} onChange={e => setMode(e.target.value)}>{['disabled','test','live'].map(v => <option key={v}>{v}</option>)}</select>)}
      </div>
      {field('Protected credential or vault reference (write-only)', <input type="password" autoComplete="new-password" style={inputStyle} value={secretReference} onChange={e => setSecretReference(e.target.value)} placeholder="protected credential or vault reference" />)}
      <label style={{ color: semantic.textMuted, fontSize: 12 }}><input type="checkbox" checked={callbackReady} onChange={e => setCallbackReady(e.target.checked)} /> Required return address verified</label>
      <button style={buttonStyles.primary} disabled={busy === 'provider'} onClick={() => run('provider', () => sharedPlatformApi.saveProvider(tenantId, providerKey, { kind, mode, secretReference: secretReference || undefined, callbackReady }))}><Send size={13} /> Save connection</button>
    </div>
    <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>{providers.map((p: any) => <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}><span>{p.providerKey} · {p.kind}{p.hasSecretReference ? ' · encrypted' : ''}</span><StateBadge value={p.state} /></div>)}</div>
  </section>;
}

function WebhookSetup({ busy, endpoints, modules, defaultModule, run, tenantId }: any) {
  const [moduleSlug, setModuleSlug] = useState(defaultModule);
  const [name, setName] = useState('Primary integration');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [signingSecret, setSigningSecret] = useState('');
  const [events, setEvents] = useState('record.updated');
  useEffect(() => { if (!moduleSlug && defaultModule) setModuleSlug(defaultModule); }, [defaultModule, moduleSlug]);
  return <section style={cardStyle} data-testid="webhook-management">
    <h2 style={{ margin: '0 0 10px', fontSize: 16 }}><Link2 size={16} /> External update notifications</h2>
    <div style={{ display: 'grid', gap: 9 }}>
      {field('Application', <select style={inputStyle} value={moduleSlug} onChange={e => setModuleSlug(e.target.value)}>{modules.map((m: any) => <option key={m.slug} value={m.slug}>{m.name || m.slug}</option>)}</select>)}
      {field('Name', <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} />)}
      {field('Destination HTTPS address', <input style={inputStyle} value={endpointUrl} onChange={e => setEndpointUrl(e.target.value)} placeholder="https://hooks.example.com/operatoros" />)}
      {field('Message-signing secret (write-only)', <input type="password" style={inputStyle} value={signingSecret} onChange={e => setSigningSecret(e.target.value)} />)}
      {field('Updates to send (comma separated)', <input style={inputStyle} value={events} onChange={e => setEvents(e.target.value)} />)}
      <button style={buttonStyles.primary} disabled={busy === 'webhook'} onClick={() => run('webhook', () => sharedPlatformApi.createWebhookEndpoint(tenantId, { moduleSlug, name, endpointUrl, signingSecret, eventTypes: events.split(',').map((v: string) => v.trim()) }))}>Create notification connection</button>
    </div>
    <div style={{ marginTop: 10, fontSize: 12, color: semantic.textMuted }}>{endpoints.length ? endpoints.map((e: any) => <div key={e.id}>{e.name} · {e.endpoint_url} · <StateBadge value={e.enabled ? 'active' : 'disabled'} /></div>) : 'No outbound endpoints configured.'}</div>
  </section>;
}

function TokenSetup({ busy, tokens, run, tenantId, oneTimeToken, setOneTimeToken }: any) {
  const [identityName, setIdentityName] = useState('reporting-service');
  const [tokenName, setTokenName] = useState('primary');
  const create = () => run('token', async () => {
    const result: any = await sharedPlatformApi.createServiceIdentity(tenantId, { identityName, tokenName, scopes: ['usage:read','exports:read','search:read'] });
    setOneTimeToken(result.rawToken);
  });
  return <section style={cardStyle} data-testid="api-token-management">
    <h2 style={{ margin: '0 0 10px', fontSize: 16 }}><KeyRound size={16} /> Service identities and API tokens</h2>
    <div style={{ display: 'grid', gap: 9 }}>{field('Identity name', <input style={inputStyle} value={identityName} onChange={e => setIdentityName(e.target.value)} />)}{field('Token name', <input style={inputStyle} value={tokenName} onChange={e => setTokenName(e.target.value)} />)}<button style={buttonStyles.primary} disabled={busy === 'token'} onClick={create}>Create scoped token</button></div>
    {oneTimeToken && <div data-testid="one-time-api-token" style={{ marginTop: 10, padding: 9, background: semantic.bg, overflowWrap: 'anywhere', fontSize: 12 }}><strong>Copy now; shown once:</strong> {oneTimeToken}</div>}
    <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>{tokens.map((t: any) => <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}><span>{t.identity_name} · {t.token_prefix}…</span>{t.revoked_at ? <StateBadge value="revoked" /> : <button style={buttonStyles.secondary} onClick={() => run(`revoke-${t.id}`, () => sharedPlatformApi.revokeApiToken(tenantId, t.id))}>Revoke</button>}</div>)}</div>
  </section>;
}

function ExportSetup({ busy, defaultModule, run, tenantId }: any) {
  const [format, setFormat] = useState('json');
  return <section style={cardStyle} data-testid="export-management"><h2 style={{ margin: '0 0 10px', fontSize: 16 }}><Activity size={16} /> Usage, credits, and exports</h2><p style={{ color: semantic.textMuted, fontSize: 12 }}>Prepare a downloadable history of shared-service activity. The download becomes available after the file is created and passes its safety check.</p>{field('Format', <select style={inputStyle} value={format} onChange={e => setFormat(e.target.value)}><option>json</option><option>csv</option></select>)}<button style={{ ...buttonStyles.primary, marginTop: 9 }} disabled={!defaultModule || busy === 'export'} onClick={() => run('export', () => sharedPlatformApi.requestExport(tenantId, { moduleSlug: defaultModule, exportType: 'control-plane-history', format }, `ui-export:${Date.now()}`))}>Prepare export</button></section>;
}

function OperationsTable({ operations, modules, busy, run, tenantId }: any) {
  const jobs = operations?.jobs ?? []; const webhooks = operations?.webhooks ?? []; const attachments = operations?.attachments ?? []; const exports = operations?.exports ?? []; const usage = operations?.usage ?? [];
  return <section style={cardStyle} data-testid="shared-service-operations"><h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Shared-service health and recovery</h2>
    <OperationGroup title="Background work" rows={jobs} render={(row: any) => <><span>{row.handler_key}</span><StateBadge value={row.status} />{row.status === 'dead_letter' && <button disabled={busy === `job-${row.id}`} style={buttonStyles.secondary} onClick={() => run(`job-${row.id}`, () => sharedPlatformApi.retryDeadLetter(tenantId, 'job', row.id))}>Try again</button>}</>} />
    <OperationGroup title="External update deliveries" rows={webhooks} render={(row: any) => <><span>{row.endpoint_name} · {row.event_type}</span><StateBadge value={row.status} />{row.status === 'dead_letter' && <button style={buttonStyles.secondary} onClick={() => run(`webhook-${row.id}`, () => sharedPlatformApi.retryDeadLetter(tenantId, 'webhook', row.id))}>Try again</button>}</>} />
    <OperationGroup title="File safety checks" rows={attachments} render={(row: any) => <><span>{row.original_name} · {row.size_bytes} bytes</span><StateBadge value={row.scan_status} /></>} />
    <OperationGroup title="Exports" rows={exports} render={(row: any) => <><span>{row.export_type} · {row.format}</span><StateBadge value={row.status} />{row.status === 'completed' && row.result_attachment_id && <button style={buttonStyles.secondary} onClick={() => run(`download-${row.id}`, async () => { const moduleSlug = modules.find((m: any) => m.id === row.module_id)?.slug; if (!moduleSlug) throw new Error('Module mapping is unavailable'); const result: any = await sharedPlatformApi.createDownloadGrant(tenantId, row.result_attachment_id, moduleSlug); window.location.assign(`/api/shared-downloads/${encodeURIComponent(result.grant.token)}`); })}>Signed download</button>}</>} />
    <OperationGroup title="Usage and credit history" rows={usage} render={(row: any) => <><span>{row.operation}</span><span>{row.units} {row.unit_kind}</span></>} />
  </section>;
}

function OperationGroup({ title, rows, render }: { title: string; rows: any[]; render: (row: any) => React.ReactNode }) {
  return <div style={{ marginTop: 14 }}><h3 style={{ fontSize: 13, color: semantic.textMuted, margin: '0 0 6px' }}>{title}</h3>{rows.length ? rows.slice(0, 20).map(row => <div key={row.id || `${row.module_id}:${row.operation}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: `1px solid ${semantic.border}`, fontSize: 12 }}>{render(row)}</div>) : <div style={{ color: semantic.textMuted, fontSize: 12 }}>No records.</div>}</div>;
}
