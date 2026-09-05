'use client';

import { useEffect, useState } from 'react';
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
  const [capabilities, setCapabilities] = useState<{ deterministicTestAdapter: boolean; liveMailboxAdapters: boolean; liveMailboxSetupReason?: string }>({ deterministicTestAdapter: false, liveMailboxAdapters: false });
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const response = await moduleShellApi.pulsedesk.listConnectors();
    setConnectors(response.connectors ?? []);
    setCapabilities(response.capabilities ?? { deterministicTestAdapter: false, liveMailboxAdapters: false });
  };
  useEffect(() => { void load(); }, []);
  const run = async (label: string, action: () => Promise<unknown>) => { setBusy(true); setNotice(''); try { await action(); setNotice(`${label} completed.`); await load(); } catch (error) { setNotice(error instanceof Error ? error.message : `${label} failed.`); } finally { setBusy(false); } };
  return <section id="pulsedesk-connectors" className="pdc" data-testid="pulsedesk-connector-console" data-connector-view={mode}>
    <header><div><span>{mode === 'inbound' ? 'Incoming requests' : 'Email connections'}</span><h2>{mode === 'inbound' ? 'Operations request intake' : 'Mailbox connection status'}</h2><p>{mode === 'inbound' ? 'Use the protected operations request form today and review earlier mailbox activity here. Mailbox import is not connected yet; requests can still be created directly.' : 'See which supported email services can turn incoming operational messages into requests. Mailbox import is not connected yet; use the protected request form or create requests directly.'}</p></div><strong>Operations only · no patient or clinical data</strong></header>
    {!capabilities.liveMailboxAdapters && <p role="status" className="pdc-boundary"><b>Email connections are not available yet.</b> {capabilities.liveMailboxSetupReason || 'This screen will not change an external mailbox.'}</p>}
    {notice && <p role="status" className="pdc-notice">{notice}</p>}
    {mode === 'integrations' && capabilities.deterministicTestAdapter && <form onSubmit={event => { event.preventDefault(); const data=new FormData(event.currentTarget); void run('Sample connection setup',()=>moduleShellApi.pulsedesk.createConnector({provider:data.get('provider'),label:data.get('label'),mailboxAddress:data.get('mailboxAddress'),mode:'test',secretReference:null,callbackReady:false})); event.currentTarget.reset(); }}>
      <label>Email service<select name="provider" required><option value="sendgrid">SendGrid</option><option value="imap">Standard email mailbox</option><option value="google">Google Workspace</option><option value="microsoft">Microsoft 365</option></select></label>
      <label>Connection name<input name="label" required minLength={2} placeholder="Facilities inbox" /></label>
      <label>Mailbox address<input name="mailboxAddress" type="email" placeholder="facilities@example.org" /></label>
      <label>Availability<input value="Sample only — no external email" readOnly /></label>
      <button disabled={busy}>Add sample connection</button>
    </form>}
    <div className="pdc-grid">{connectors.length===0?<p className="pdc-empty">No mailbox connections are set up. Use the protected request form or create requests directly.</p>:connectors.map(connector=><article key={connector.id}><div><b>{connector.label}</b><span>{emailServiceName(connector.provider)} · {connectionStatus(connector.status)}</span><small>{connector.mode === 'test' ? 'Sample only — nothing is sent outside OperatorOS' : 'Saved from an earlier setup — external email is unavailable'}</small><details><summary>Technical details</summary><code>{connector.provider} · {connector.mode} · {connector.status}{connector.last_error_code ? ` · ${connector.last_error_code}` : ''}</code></details></div><nav aria-label={`${connector.label} actions`}>{capabilities.deterministicTestAdapter&&connector.mode==='test'&&<><button disabled={busy} onClick={()=>void run('Connection check',()=>moduleShellApi.pulsedesk.pollConnector(connector.id))}>Check connection</button><button disabled={busy} onClick={()=>void run('Sample request',()=>moduleShellApi.pulsedesk.testIngestConnector(connector.id,{messageId:`ui-${Date.now()}`,from:'requester@example.invalid',subject:'Operational equipment support request',attachmentsClean:true}))}>Try sample request</button></>}<button className="danger" disabled={busy} onClick={()=>void run('Disconnect',()=>moduleShellApi.pulsedesk.revokeConnector(connector.id))}>Disconnect</button></nav></article>)}</div>
    <style>{`.pdc{padding:20px;border-radius:22px;background:#f7fbff;color:#102a43;border:1px solid #c9e2f4}.pdc header{display:flex;justify-content:space-between;gap:20px}.pdc header span{font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#1677a7}.pdc h2{margin:4px 0}.pdc header p{max-width:760px;color:#526b7d}.pdc header strong{color:#8b3a3a}.pdc-boundary{padding:12px 14px;border:1px solid #e0bd76;background:#fff8e8;border-radius:12px;color:#694b15}.pdc form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:18px 0}.pdc label{display:grid;gap:5px;font-size:12px;font-weight:700}.pdc input,.pdc select,.pdc button{padding:10px;border-radius:10px;border:1px solid #a9c8dc;background:#fff;color:#102a43}.pdc-check{display:flex!important;align-items:center;min-height:24px}.pdc-check input{width:auto}.pdc button{cursor:pointer;background:#0d6f9c;color:#fff;font-weight:700}.pdc-grid{display:grid;gap:10px}.pdc article{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px;background:#fff;border:1px solid #d6e7f2;border-radius:14px}.pdc article div{display:grid;gap:3px}.pdc article span,.pdc article small{color:#4d6476}.pdc nav{display:flex;gap:7px}.pdc .danger{background:#9f3434}.pdc-notice{padding:10px;background:#e7f4fb;border-radius:10px}.pdc-empty{color:#4d6476}@media(max-width:800px){.pdc header,.pdc article{align-items:stretch;flex-direction:column}.pdc form{grid-template-columns:1fr}.pdc nav{flex-wrap:wrap}}`}</style>
  </section>;
}
