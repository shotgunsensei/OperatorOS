'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, FileArchive, KeyRound, RadioTower, RefreshCw, ShieldCheck, Webhook } from 'lucide-react';
import { moduleShellApi, type TechDeckLiteralWorkspaceResponse } from '@/lib/auth';

interface Props { tenantKey: string; canWrite: boolean; canManage: boolean }
type ActionOptions = { method?: 'POST' | 'PUT' | 'PATCH'; idempotencyKey?: string };

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    if ('error' in error && typeof error.error === 'string') return error.error;
    if ('message' in error && typeof error.message === 'string') return error.message;
  }
  return 'The TechDeck operation could not be completed.';
}

function values(form: HTMLFormElement): Record<string, string> {
  return Object.fromEntries(Array.from(new FormData(form).entries()).map(([key, value]) => [key, String(value).trim()]));
}

function RowList({ rows, empty, label }: { rows: Array<Record<string, any>>; empty: string; label: (row: Record<string, any>) => React.ReactNode }) {
  if (rows.length === 0) return <p className="tdl-empty">{empty}</p>;
  return <ul className="tdl-list">{rows.slice(0, 6).map((row, index) => <li key={String(row.id ?? index)}>{label(row)}</li>)}</ul>;
}

export default function TechDeckLiteralConsole({ tenantKey, canWrite, canManage }: Props) {
  const [workspace, setWorkspace] = useState<TechDeckLiteralWorkspaceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setWorkspace(await moduleShellApi.techdeck.getLiteralWorkspace()); }
    catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load, tenantKey]);

  const act = async (key: string, path: string, input: Record<string, unknown>, options?: ActionOptions) => {
    setBusy(key); setError(null); setNotice(null); setOneTimeSecret(null);
    try {
      const result = await moduleShellApi.techdeck.literalAction(path, input, options);
      const secret = result.publicPath ?? result.rawToken ?? result.rawKey;
      if (secret) setOneTimeSecret(String(secret));
      setNotice('Saved. The tenant-scoped workspace is current.');
      await load();
      return result;
    } catch (err) { setError(errorMessage(err)); return null; }
    finally { setBusy(null); }
  };

  const submit = (key: string, path: string, convert?: (input: Record<string, string>) => Record<string, unknown>, options?: ActionOptions) =>
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = event.currentTarget;
      const input = values(form);
      void act(key, path, convert ? convert(input) : input, options).then(result => { if (result) form.reset(); });
    };

  return (
    <section id="techdeck-literal-workspace" className="techdeck-panel tdl-console" data-testid="techdeck-literal-workspace" tabIndex={-1}>
      <header className="tdl-heading">
        <div><span>Literal product restoration</span><h2>Service automation and trust operations</h2><p>Calendar, portal, licensing, status, webhooks, scoped API access, secure intake, and deterministic compliance packets.</p></div>
        <button type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? 'tdl-spin' : ''} />Refresh</button>
      </header>
      {error && <div className="tdl-error" role="alert">{error}</div>}
      {notice && <div className="tdl-notice" role="status">{notice}</div>}
      {oneTimeSecret && <div className="tdl-secret" role="status"><strong>Copy now — shown once:</strong><code>{oneTimeSecret}</code></div>}
      {loading && !workspace ? <div className="tdl-loading" aria-busy="true">Loading restored workflows…</div> : <div className="tdl-grid">
        <article id="techdeck-calendar" className="tdl-card">
          <h3><CalendarClock size={17} />Calendar and recurrence</h3>
          <RowList rows={workspace?.appointments ?? []} empty="No appointments scheduled." label={row => <><strong>{row.title}</strong><span>{new Date(String(row.starts_at)).toLocaleString()}</span></>} />
          {canWrite && <form onSubmit={submit('appointment', 'appointments', input => ({ ...input, startsAt: new Date(input.startsAt).toISOString(), endsAt: new Date(input.endsAt).toISOString() }))}>
            <input name="title" required placeholder="Appointment title" /><input name="startsAt" required type="datetime-local" aria-label="Starts at" /><input name="endsAt" required type="datetime-local" aria-label="Ends at" /><button disabled={busy === 'appointment'}>Schedule</button>
          </form>}
          <RowList rows={workspace?.schedules ?? []} empty="No recurring ticket rules." label={row => <><strong>{row.name}</strong><span>{row.enabled ? 'Enabled' : 'Paused'} · every {row.interval_seconds}s</span></>} />
          {canManage && <form onSubmit={submit('recurrence', 'recurring-tickets', input => ({ name: input.name, title: input.ticketTitle, intervalDays: Number(input.intervalDays), nextRunAt: new Date().toISOString(), priority: 'medium' }))}>
            <input name="name" required placeholder="Rule name" /><input name="ticketTitle" required placeholder="Generated ticket title" /><input name="intervalDays" required type="number" min="1" max="30" defaultValue="1" aria-label="Interval days" /><button disabled={busy === 'recurrence'}>Create rule</button>
          </form>}
        </article>

        <article id="techdeck-portal" className="tdl-card">
          <h3><ShieldCheck size={17} />Scoped client portal</h3>
          <RowList rows={workspace?.portalAssignments ?? []} empty="No portal assignments." label={row => <><strong>{row.organization_name}</strong><span>{row.site_name ?? 'All assigned sites'} · user {String(row.user_id).slice(0, 8)}</span></>} />
          {canManage && <form onSubmit={submit('portal', 'portal-assignments', input => ({ userId: input.userId, directoryOrganizationId: input.organizationId, directorySiteId: input.siteId || undefined, canCreateTickets: true, canComment: true, canViewEvidence: true }))}>
            <input name="userId" required placeholder="OperatorOS user UUID" /><input name="organizationId" required placeholder="Directory client UUID" /><input name="siteId" placeholder="Optional site UUID" /><button disabled={busy === 'portal'}>Grant portal access</button>
          </form>}
          <p className="tdl-note">Portal users see and comment only on tickets for their assigned Directory clients and sites.</p>
        </article>

        <article id="techdeck-licenses" className="tdl-card">
          <h3><KeyRound size={17} />License server</h3>
          <RowList rows={workspace?.licenseProducts ?? []} empty="No licensed products." label={row => <><strong>{row.name}</strong><span>{row.key_count ?? 0} issued keys</span>{canManage && <button type="button" onClick={() => void act(`key-${row.id}`, `license/products/${row.id}/keys`, { label: 'Operator-issued key', maxActivations: 1 })}>Issue key</button>}</>} />
          {canManage && <form onSubmit={submit('license', 'license/products')}><input name="name" required placeholder="Product name" /><input name="slug" required pattern="[a-z0-9-]+" placeholder="product-slug" /><input name="description" placeholder="License purpose" /><button disabled={busy === 'license'}>Add product</button></form>}
          <p className="tdl-note">Raw keys appear once; validation stores only hashes and rate-limited activation history.</p>
        </article>

        <article id="techdeck-status" className="tdl-card">
          <h3><RadioTower size={17} />Public status</h3>
          <RowList rows={workspace?.statusPages ?? []} empty="No public status pages." label={row => <><strong>{row.title}</strong><span>/{row.public_slug} · {row.component_count ?? 0} components · {row.incident_count ?? 0} incidents</span>{canManage && <button type="button" onClick={() => void act(`incident-${row.id}`, `status/pages/${row.id}/incidents`, { title: 'Service investigation', description: 'Operators are investigating a service degradation.', severity: 'minor' })}>Open incident</button>}</>} />
          {canManage && <form onSubmit={submit('status', 'status/pages', input => ({ title: input.title, publicSlug: input.slug, description: input.description, public: true }))}><input name="title" required placeholder="Status page title" /><input name="slug" required pattern="[a-z0-9-]+" placeholder="public-slug" /><input name="description" placeholder="Public summary" /><button disabled={busy === 'status'}>Publish page</button></form>}
        </article>

        <article id="techdeck-webhooks" className="tdl-card">
          <h3><Webhook size={17} />Signed webhooks</h3>
          <RowList rows={workspace?.webhooks ?? []} empty="No webhook endpoints." label={row => <><strong>{row.name}</strong><span>{row.enabled ? 'Enabled' : 'Disabled'} · {row.endpoint_url}</span></>} />
          {canManage && <form onSubmit={submit('webhook', 'webhooks', input => ({ name: input.name, url: input.url, secret: input.secret, eventTypes: ['techdeck.status.incident_updated'] }))}><input name="name" required placeholder="Endpoint name" /><input name="url" required type="url" placeholder="https://receiver.example/hook" /><input name="secret" required type="password" minLength={16} placeholder="Signing secret" /><button disabled={busy === 'webhook'}>Add endpoint</button></form>}
          <p className="tdl-note">Delivery uses HMAC signatures, SSRF checks, bounded retries, delivery logs, and dead-letter state.</p>
        </article>

        <article id="techdeck-api-tokens" className="tdl-card">
          <h3><KeyRound size={17} />Scoped API tokens</h3>
          <RowList rows={workspace?.apiTokens ?? []} empty="No API-only identities." label={row => <><strong>{row.name}</strong><span>{row.identity_name} · {row.revoked_at ? 'Revoked' : 'Active'} · {row.token_prefix}</span></>} />
          {canManage && <form onSubmit={submit('token', 'api-tokens', input => ({ identityName: input.identityName, tokenName: input.tokenName, description: 'TechDeck headless client', scopes: ['techdeck:read'] }))}><input name="identityName" required placeholder="Service identity" /><input name="tokenName" required placeholder="Token label" /><button disabled={busy === 'token'}>Issue read token</button></form>}
          <p className="tdl-note">Headless ticket and evidence requests validate module identity, scope, expiry, and revocation.</p>
        </article>

        <article id="techdeck-secure-intake" className="tdl-card">
          <h3><ShieldCheck size={17} />Secure evidence intake</h3>
          <RowList rows={workspace?.intakeSpaces ?? []} empty="No intake spaces." label={row => <><strong>{row.name}</strong><span>{row.external_uploads_enabled ? 'External uploads enabled' : 'Internal only'} · {row.retention_days} day retention</span>{canWrite && <button type="button" onClick={() => void act(`intake-${row.id}`, 'intake/requests', { spaceId: row.id, title: `Evidence request for ${row.name}`, maxUploads: 5, oneTimeUse: false })}>Create request</button>}</>} />
          {canManage && <form onSubmit={submit('space', 'intake/spaces', input => ({ name: input.name, slug: input.slug, description: input.description, allowedFileTypes: ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'], externalUploadsEnabled: true, retentionDays: 30 }))}><input name="name" required placeholder="Intake space" /><input name="slug" required pattern="[a-z0-9-]+" placeholder="intake-slug" /><input name="description" placeholder="Uploader instructions" /><button disabled={busy === 'space'}>Create space</button></form>}
          <RowList rows={workspace?.intakeRequests ?? []} empty="No outstanding upload requests." label={row => <><strong>{row.title}</strong><span>{row.upload_count}/{row.max_uploads} uploads · expires {new Date(String(row.expires_at)).toLocaleDateString()}</span></>} />
        </article>

        <article id="techdeck-compliance" className="tdl-card">
          <h3><FileArchive size={17} />Compliance packets and IT Ops</h3>
          <RowList rows={workspace?.exports ?? []} empty="No compliance packet exports." label={row => <><strong>{row.export_type}</strong><span>{row.status} · {row.completed_at ? 'integrity artifact ready' : 'queued'}</span></>} />
          {canWrite && <button type="button" className="tdl-wide" disabled={busy === 'packet'} onClick={() => void act('packet', 'compliance-packets', { filters: {} }, { idempotencyKey: crypto.randomUUID() })}>Build deterministic ZIP packet</button>}
          {canWrite && <form onSubmit={submit('itops', 'itops/query')}><textarea name="query" required placeholder="Ask for documentation-only diagnostic guidance. TechDeck never claims execution." /><button disabled={busy === 'itops'}>Generate reviewed guidance</button></form>}
          <p className="tdl-note">Exports include a manifest, entry hashes, audit records, and deterministic ZIP bytes. AI output is guidance only—no scripts run in the API process.</p>
        </article>
      </div>}
      <style>{css}</style>
    </section>
  );
}

const css = `
  .tdl-console{padding:18px;display:grid;gap:14px}.tdl-heading{display:flex;gap:16px;justify-content:space-between;align-items:flex-start}.tdl-heading span{color:#38bdf8;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.tdl-heading h2{margin:4px 0;color:#e5eefc;font-size:20px}.tdl-heading p{margin:0;color:#8fa3bd;font-size:13px;line-height:1.5;max-width:760px}.tdl-heading button,.tdl-card button{border:1px solid rgba(56,189,248,.35);background:#0c4a6e;color:#e0f2fe;border-radius:6px;padding:8px 10px;display:inline-flex;align-items:center;justify-content:center;gap:7px;font:inherit;font-size:12px;font-weight:800;cursor:pointer}.tdl-heading button:disabled,.tdl-card button:disabled{opacity:.5;cursor:not-allowed}.tdl-error,.tdl-notice,.tdl-secret{border-radius:6px;padding:10px 12px;font-size:13px}.tdl-error{border:1px solid rgba(239,68,68,.45);background:rgba(127,29,29,.2);color:#fecaca}.tdl-notice{border:1px solid rgba(34,197,94,.35);background:rgba(20,83,45,.18);color:#bbf7d0}.tdl-secret{display:grid;gap:6px;border:1px solid rgba(245,158,11,.45);background:#1c1408;color:#fde68a}.tdl-secret code{overflow-wrap:anywhere;user-select:all;color:#fff}.tdl-loading,.tdl-empty,.tdl-note{color:#8fa3bd;font-size:12px}.tdl-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.tdl-card{border:1px solid rgba(148,163,184,.2);background:#080d16;border-radius:8px;padding:14px;display:grid;gap:11px;align-content:start}.tdl-card h3{margin:0;color:#e5eefc;font-size:15px;display:flex;align-items:center;gap:8px}.tdl-card h3 svg{color:#38bdf8}.tdl-card form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.tdl-card input,.tdl-card textarea{box-sizing:border-box;width:100%;border:1px solid rgba(148,163,184,.25);background:#101826;color:#e5eefc;border-radius:6px;padding:9px;font:inherit;font-size:12px;color-scheme:dark}.tdl-card textarea{grid-column:1/-1;min-height:72px;resize:vertical}.tdl-card form button{align-self:stretch}.tdl-card input:focus,.tdl-card textarea:focus,.tdl-card button:focus-visible{outline:2px solid rgba(56,189,248,.55);outline-offset:1px}.tdl-list{list-style:none;margin:0;padding:0;display:grid;gap:6px}.tdl-list li{border-left:2px solid rgba(56,189,248,.4);padding:5px 8px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 8px;align-items:center}.tdl-list strong{color:#dce9f8;font-size:12px;overflow-wrap:anywhere}.tdl-list span{grid-column:1;color:#8fa3bd;font-size:11px;overflow-wrap:anywhere}.tdl-list button{grid-column:2;grid-row:1/3;padding:6px 8px}.tdl-wide{width:100%}.tdl-spin{animation:tdl-spin 1s linear infinite}@keyframes tdl-spin{to{transform:rotate(360deg)}}@media(max-width:900px){.tdl-grid{grid-template-columns:1fr}}@media(max-width:560px){.tdl-heading{display:grid}.tdl-card form{grid-template-columns:1fr}.tdl-card textarea{grid-column:auto}.tdl-list li{grid-template-columns:1fr}.tdl-list button{grid-column:1;grid-row:auto;justify-self:start}}
`;
