'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { moduleShellApi } from '../../lib/auth';

const emailServiceName = (provider: string) => ({
  sendgrid: 'SendGrid',
  imap: 'Standard email mailbox',
  google: 'Google Workspace',
  microsoft: 'Microsoft 365',
} as Record<string, string>)[provider] ?? 'Email service';

const connectionStatus = (status: string) => ({
  active: 'Ready',
  connected: 'Connected',
  revoked: 'Disconnected',
  failed: 'Needs attention',
  error: 'Needs attention',
  test: 'Sample only',
} as Record<string, string>)[status] ?? status.replaceAll('_', ' ');

export default function PulseDeskConnectorConsole({ mode }: { mode: 'inbound' | 'integrations' }) {
  const [connectors, setConnectors] = useState<any[]>([]);
  const [capabilities, setCapabilities] = useState<{ deterministicTestAdapter: boolean; liveMailboxAdapters: boolean; liveMailboxSetupReason?: string; canManageMailboxes?: boolean }>({ deterministicTestAdapter: false, liveMailboxAdapters: false });
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const requestVersion = useRef(0);
  const oauthCompletion = useRef<Promise<boolean> | null>(null);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true); setLoadError('');
    try {
      const response = await moduleShellApi.pulsedesk.listConnectors();
      if (version !== requestVersion.current) return;
      setConnectors(response.connectors ?? []);
      setCapabilities(response.capabilities ?? { deterministicTestAdapter: false, liveMailboxAdapters: false });
    } catch {
      if (version === requestVersion.current) {
        setConnectors([]);
        setLoadError('We could not load your email connections. Try again. Your saved settings have not changed.');
      }
    } finally { if (version === requestVersion.current) setLoading(false); }
  }, []);
  useEffect(() => { void load(); return () => { requestVersion.current++; }; }, [load]);
  const run = async (label: string, action: () => Promise<unknown>) => { setBusy(true); setNotice(''); try { await action(); setNotice(`${label} completed.`); await load(); } catch { setNotice(`${label} could not be confirmed. Reload and check the saved result before trying again.`); } finally { setBusy(false); } };
  const authorize = async (connector: { id: string; provider: string }) => {
    setBusy(true); setNotice('');
    try {
      const result = await moduleShellApi.pulsedesk.startConnectorOauth(connector.id);
      const authorization = new URL(String(result.authorizationUrl));
      const expected = connector.provider === 'google' ? 'https://accounts.google.com' : 'https://login.microsoftonline.com';
      if (authorization.origin !== expected) throw new Error('Unsupported authorization destination');
      // A bounded connector ID is UI continuation metadata, never a token,
      // password, PKCE verifier, or OperatorOS session credential.
      sessionStorage.setItem('pulsedesk.pending-mailbox', JSON.stringify({ id: connector.id, expiresAt: Date.now()+10*60_000 }));
      window.location.assign(authorization.href);
    } catch { setNotice('Mailbox authorization could not start. Ask your workspace administrator to check the approved provider application.'); setBusy(false); }
  };
  const queueImport = async (id: string) => {
    setBusy(true); setNotice('');
    try { await moduleShellApi.pulsedesk.pollConnector(id); setNotice('Mailbox import was queued. Check the saved connection activity for its result.'); await load(); }
    catch { setNotice('Mailbox import could not be queued. Reload the saved connection status before trying again.'); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    let active = true;
    if (!oauthCompletion.current) {
      const query = new URLSearchParams(window.location.search);
      if (!query.has('code') && !query.has('error')) return;
      let continuation: string | null = null;
      try { continuation=sessionStorage.getItem('pulsedesk.pending-mailbox');sessionStorage.removeItem('pulsedesk.pending-mailbox'); }
      catch { /* An unavailable continuation fails closed below. */ }
      // Provider codes/state are exchanged server-side immediately and removed
      // from the visible URL. They are never persisted in browser storage.
      window.history.replaceState(null, '', window.location.pathname);
      oauthCompletion.current=(async()=>{
        try {
          const pending=JSON.parse(continuation??'null') as {id?:unknown;expiresAt?:unknown}|null;
          if(query.has('error')||!pending||typeof pending.id!=='string'||!/^[a-f0-9-]{36}$/i.test(pending.id)||typeof pending.expiresAt!=='number'||pending.expiresAt<=Date.now()||!query.get('code')||!query.get('state'))return false;
          await moduleShellApi.pulsedesk.completeConnectorOauth(pending.id,{code:query.get('code'),state:query.get('state')});return true;
        } catch {return false;}
      })();
    }
    setBusy(true);
    // Subscribe again during React's effect replay without exchanging twice.
    void oauthCompletion.current.then(async confirmed=>{
      if(!active)return;
      setNotice(confirmed?'Mailbox authorization was confirmed. Choose Import new requests to review incoming operational messages.':'Mailbox authorization was not confirmed. Reload the saved status, then start authorization again if needed.');
      if(confirmed)await load();
      if(active)setBusy(false);
    });
    return () => { active=false; };
  }, [load]);
  if (loading || loadError) return <section data-testid="pulsedesk-connector-console" aria-label="Email connections" style={{ padding: 20, borderRadius: 16, background: '#f7fbff', color: '#102a43', border: '1px solid #c9e2f4' }}>
    <h2>Email connections</h2>
    {loading ? <p role="status">Loading email connections…</p> : <div role="alert"><p>{loadError}</p><button style={{ minHeight: 44, padding: '10px 16px', background: '#0d6f9c', color: '#fff', border: 0, borderRadius: 8 }} onClick={() => void load()}>Try again</button></div>}
  </section>;
  return <section id="pulsedesk-connectors" className="pdc" data-testid="pulsedesk-connector-console" data-connector-view={mode}>
    <header><div><span>{mode === 'inbound' ? 'Incoming requests' : 'Email connections'}</span><h2>{mode === 'inbound' ? 'Operations request intake' : 'Mailbox connection status'}</h2><p>{capabilities.liveMailboxAdapters ? 'Authorize an approved Google Workspace or Microsoft 365 mailbox, then import new operational requests. Provider application setup belongs to your workspace administrator. Direct requests and protected intake remain available.' : mode === 'inbound' ? 'Use the protected operations request form today and review earlier mailbox activity here. Mailbox import is not connected yet; requests can still be created directly.' : 'See which supported email services can turn incoming operational messages into requests. Mailbox import is not connected yet; use the protected request form or create requests directly.'}</p></div><strong>Operations only · no patient or clinical data</strong></header>
    {!capabilities.liveMailboxAdapters && <p role="status" className="pdc-boundary"><b>Email connections are not available yet.</b> Use the request form or create a request directly while mailbox import is unavailable.</p>}
    {notice && <p role="status" className="pdc-notice">{notice}</p>}
    {mode === 'integrations' && capabilities.liveMailboxAdapters && capabilities.canManageMailboxes && <form onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);void run('Mailbox setup',()=>moduleShellApi.pulsedesk.createConnector({provider:data.get('provider'),label:data.get('label'),mailboxAddress:data.get('mailboxAddress'),mode:'live',publicConfig:{operationsOnly:data.get('operationsOnly')==='on'}}));}}>
      <label>Email service<select name="provider" required><option value="google">Google Workspace</option><option value="microsoft">Microsoft 365</option></select></label>
      <label>Connection name<input name="label" required minLength={2} maxLength={120} placeholder="Facilities inbox" /></label>
      <label>Mailbox address<input name="mailboxAddress" type="email" required maxLength={254} autoComplete="off" placeholder="facilities@example.org" /></label>
      <label className="pdc-check"><input name="operationsOnly" type="checkbox" required />This mailbox is for operational requests and excludes patient or clinical information.</label>
      <p>Provider secrets stay in the OperatorOS workspace vault. Authorize access with your email provider after saving this connection. Messages with attachments are held from ticket creation; no attachment contents are imported.</p>
      <button disabled={busy}>Add mailbox connection</button>
    </form>}
    {mode === 'integrations' && capabilities.deterministicTestAdapter && <form onSubmit={event => { event.preventDefault(); const data=new FormData(event.currentTarget); void run('Sample connection setup',()=>moduleShellApi.pulsedesk.createConnector({provider:data.get('provider'),label:data.get('label'),mailboxAddress:data.get('mailboxAddress'),mode:'test',secretReference:null,callbackReady:false})); event.currentTarget.reset(); }}>
      <label>Email service<select name="provider" required><option value="sendgrid">SendGrid</option><option value="imap">Standard email mailbox</option><option value="google">Google Workspace</option><option value="microsoft">Microsoft 365</option></select></label>
      <label>Connection name<input name="label" required minLength={2} placeholder="Facilities inbox" /></label>
      <label>Mailbox address<input name="mailboxAddress" type="email" placeholder="facilities@example.org" /></label>
      <label>Availability<input value="Sample only — no external email" readOnly /></label>
      <button disabled={busy}>Add sample connection</button>
    </form>}
    <div className="pdc-grid">{connectors.length===0?<p className="pdc-empty">No mailbox connections are set up. Use the protected request form or create requests directly.</p>:connectors.map(connector=><article key={connector.id}><div><b>{connector.label}</b><span>{emailServiceName(connector.provider)} · {connectionStatus(connector.status)}</span><small>{connector.mode === 'test' ? 'Sample only - nothing is sent outside OperatorOS' : connector.mode==='live'&&capabilities.liveMailboxAdapters ? 'Provider authorization and saved import activity determine connection status.' : 'Saved from an earlier setup - external email is unavailable'}</small><details><summary>Technical details</summary><code>{connector.provider} · {connector.mode} · {connector.status}{connector.last_error_code ? ` · ${connector.last_error_code}` : ''}</code></details></div><nav aria-label={`${connector.label} actions`}>{connector.mode==='live'&&capabilities.liveMailboxAdapters&&capabilities.canManageMailboxes&&<><button disabled={busy} onClick={()=>void authorize(connector)}>{connector.status==='pending'?'Authorize mailbox':'Reconnect mailbox'}</button>{['active','degraded'].includes(connector.status)&&<button disabled={busy} onClick={()=>void queueImport(connector.id)}>Import new requests</button>}</>}{capabilities.deterministicTestAdapter&&connector.mode==='test'&&<><button disabled={busy} onClick={()=>void run('Connection check',()=>moduleShellApi.pulsedesk.pollConnector(connector.id))}>Check connection</button><button disabled={busy} onClick={()=>void run('Sample request',()=>moduleShellApi.pulsedesk.testIngestConnector(connector.id,{messageId:`ui-${Date.now()}`,from:'requester@example.invalid',subject:'Operational equipment support request',attachmentsClean:true}))}>Try sample request</button></>}<button className="danger" disabled={busy} onClick={()=>void run('Disconnect',()=>moduleShellApi.pulsedesk.revokeConnector(connector.id))}>Disconnect</button></nav></article>)}</div>
    <style>{`.pdc{padding:20px;border-radius:22px;background:#f7fbff;color:#102a43;border:1px solid #c9e2f4}.pdc header{display:flex;justify-content:space-between;gap:20px}.pdc header span{font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#1677a7}.pdc h2{margin:4px 0}.pdc header p{max-width:760px;color:#526b7d}.pdc header strong{color:#8b3a3a}.pdc-boundary{padding:12px 14px;border:1px solid #e0bd76;background:#fff8e8;border-radius:12px;color:#694b15}.pdc form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:18px 0}.pdc label{display:grid;gap:5px;font-size:12px;font-weight:700}.pdc input,.pdc select,.pdc button{padding:10px;border-radius:10px;border:1px solid #a9c8dc;background:#fff;color:#102a43}.pdc-check{display:flex!important;align-items:center;min-height:24px}.pdc-check input{width:auto}.pdc button{cursor:pointer;background:#0d6f9c;color:#fff;font-weight:700}.pdc-grid{display:grid;gap:10px}.pdc article{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px;background:#fff;border:1px solid #d6e7f2;border-radius:14px}.pdc article div{display:grid;gap:3px}.pdc article span,.pdc article small{color:#4d6476}.pdc nav{display:flex;gap:7px}.pdc .danger{background:#9f3434}.pdc-notice{padding:10px;background:#e7f4fb;border-radius:10px}.pdc-empty{color:#4d6476}@media(max-width:800px){.pdc header,.pdc article{align-items:stretch;flex-direction:column}.pdc form{grid-template-columns:1fr}.pdc nav{flex-wrap:wrap}}`}</style>
  </section>;
}
