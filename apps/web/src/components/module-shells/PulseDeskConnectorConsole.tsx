'use client';

import { useEffect, useState } from 'react';
import { moduleShellApi } from '../../lib/auth';

export default function PulseDeskConnectorConsole() {
  const [connectors, setConnectors] = useState<any[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => setConnectors((await moduleShellApi.pulsedesk.listConnectors()).connectors ?? []);
  useEffect(() => { void load(); }, []);
  const run = async (label: string, action: () => Promise<unknown>) => { setBusy(true); setNotice(''); try { await action(); setNotice(`${label} completed.`); await load(); } catch (error) { setNotice(error instanceof Error ? error.message : `${label} failed.`); } finally { setBusy(false); } };
  return <section id="pulsedesk-connectors" className="pdc" data-testid="pulsedesk-connector-console">
    <header><div><span>Secure intake automation</span><h2>Email-to-ticket connectors</h2><p>Per-organization SendGrid, IMAP, Google Workspace, and Microsoft 365 routing with encrypted credential references, replay protection, health, and bounded worker retries.</p></div><strong>Operations only · PHI minimized</strong></header>
    {notice && <p role="status" className="pdc-notice">{notice}</p>}
    <form onSubmit={event => { event.preventDefault(); const data=new FormData(event.currentTarget); void run('Connector setup',()=>moduleShellApi.pulsedesk.createConnector({provider:data.get('provider'),label:data.get('label'),mailboxAddress:data.get('mailboxAddress'),mode:data.get('mode'),secretReference:data.get('secretReference'),callbackReady:data.get('callbackReady')==='on'})); event.currentTarget.reset(); }}>
      <label>Provider<select name="provider" required><option value="sendgrid">SendGrid Inbound Parse</option><option value="imap">IMAP</option><option value="google">Google Workspace</option><option value="microsoft">Microsoft 365 / Entra</option></select></label>
      <label>Display label<input name="label" required minLength={2} placeholder="Facilities inbox" /></label>
      <label>Mailbox address<input name="mailboxAddress" type="email" placeholder="facilities@example.org" /></label>
      <label>Mode<select name="mode"><option value="test">Deterministic test</option><option value="disabled">Disabled</option><option value="live">Live (fails closed until verified)</option></select></label>
      <label>Secret reference<input name="secretReference" type="password" autoComplete="new-password" placeholder="Stored encrypted; never displayed again" /></label>
      <label className="pdc-check"><input name="callbackReady" type="checkbox" /> Provider callback verified</label>
      <button disabled={busy}>Save connector</button>
    </form>
    <div className="pdc-grid">{connectors.length===0?<p className="pdc-empty">No inbox connectors configured.</p>:connectors.map(connector=><article key={connector.id}><div><b>{connector.label}</b><span>{connector.provider} · {connector.mode} · {connector.status}</span><small>{connector.mailbox_address || `Alias ${connector.inbound_alias}`}</small></div><nav aria-label={`${connector.label} actions`}><button disabled={busy} onClick={()=>void run('Poll queue',()=>moduleShellApi.pulsedesk.pollConnector(connector.id))}>Poll</button>{connector.mode==='test'&&<button disabled={busy} onClick={()=>void run('Deterministic ingestion',()=>moduleShellApi.pulsedesk.testIngestConnector(connector.id,{messageId:`ui-${Date.now()}`,from:'requester@example.invalid',subject:'Operational equipment support request',attachmentsClean:true}))}>Test intake</button>}<button className="danger" disabled={busy} onClick={()=>void run('Connector revocation',()=>moduleShellApi.pulsedesk.revokeConnector(connector.id))}>Revoke</button></nav>{connector.last_error_code&&<em>{connector.last_error_code}</em>}</article>)}</div>
    <style>{`.pdc{padding:20px;border-radius:22px;background:#f7fbff;color:#102a43;border:1px solid #c9e2f4}.pdc header{display:flex;justify-content:space-between;gap:20px}.pdc header span{font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#1677a7}.pdc h2{margin:4px 0}.pdc header p{max-width:760px;color:#526b7d}.pdc header strong{color:#8b3a3a}.pdc form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:18px 0}.pdc label{display:grid;gap:5px;font-size:12px;font-weight:700}.pdc input,.pdc select,.pdc button{padding:10px;border-radius:10px;border:1px solid #a9c8dc;background:#fff;color:#102a43}.pdc-check{display:flex!important;align-items:center}.pdc-check input{width:auto}.pdc button{cursor:pointer;background:#0d6f9c;color:#fff;font-weight:700}.pdc-grid{display:grid;gap:10px}.pdc article{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px;background:#fff;border:1px solid #d6e7f2;border-radius:14px}.pdc article div{display:grid;gap:3px}.pdc article span,.pdc article small{color:#60778a}.pdc nav{display:flex;gap:7px}.pdc .danger{background:#9f3434}.pdc-notice{padding:10px;background:#e7f4fb;border-radius:10px}.pdc-empty{color:#60778a}@media(max-width:800px){.pdc header,.pdc article{align-items:stretch;flex-direction:column}.pdc form{grid-template-columns:1fr}.pdc nav{flex-wrap:wrap}}`}</style>
  </section>;
}
