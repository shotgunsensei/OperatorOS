'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertOctagon, AlertTriangle, Building2, CheckCircle2, ClipboardCheck,
  FileKey2, Fingerprint, Headset, KeyRound, Link2, Loader2, Network, Phone,
  PlugZap, RefreshCw, ScrollText, ShieldCheck, Siren, UserRoundCheck, Wrench,
} from 'lucide-react';
import { moduleShellApi } from '@/lib/auth';
import { cardStyle, fontSize, radius, semantic, space } from '@/lib/design-tokens';

type Row = Record<string, any>;
type MspWorkspace = {
  contract: string;
  phases: Row[];
  settings: Row;
  organizations: Row[];
  directoryContacts: Row[];
  trustedLines: Row[];
  contacts: Row[];
  supportLinks: Row[];
  integrations: Row[];
  actionCatalog: Row[];
  activeCalls: Row[];
  cases: Row[];
  outbox: Row[];
  audit: Row[];
  readiness: Row;
};

const panel: React.CSSProperties = {
  ...cardStyle,
  background: 'linear-gradient(150deg,rgba(7,20,29,.99),rgba(6,32,33,.97))',
  borderColor: 'rgba(45,212,191,.2)',
  boxShadow: '0 18px 55px rgba(0,0,0,.24)',
};
const field: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', color: semantic.text, background: '#041116',
  border: '1px solid rgba(94,234,212,.25)', borderRadius: radius.sm, padding: '10px 11px', colorScheme: 'dark',
};
const primaryButton: React.CSSProperties = {
  border: 0, borderRadius: radius.sm, padding: '10px 14px', background: 'linear-gradient(135deg,#0f766e,#10b981)',
  color: '#fff', fontWeight: 850, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
};
const quietButton: React.CSSProperties = { ...primaryButton, background: '#102630', border: '1px solid rgba(94,234,212,.22)' };

function errorMessage(error: unknown, fallback: string) {
  return (error as any)?.error || (error as any)?.message || fallback;
}

function Label({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return <label style={{ display: 'grid', gap: 5, color: semantic.textMuted, fontSize: fontSize.sm }}>
    <span>{title}</span>{children}{hint && <small>{hint}</small>}
  </label>;
}

function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'good' | 'warn' | 'bad' | 'neutral' }) {
  const color = tone === 'good' ? '#34d399' : tone === 'warn' ? '#fbbf24' : tone === 'bad' ? '#fb7185' : '#94a3b8';
  return <span style={{ border: `1px solid ${color}55`, background: `${color}10`, color, padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 850, whiteSpace: 'nowrap' }}>{children}</span>;
}

function SectionHeading({ icon, title, subtitle, badge }: { icon: React.ReactNode; title: string; subtitle: string; badge?: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', marginBottom: 15 }}>
    <div style={{ color: '#2dd4bf', marginTop: 2 }}>{icon}</div>
    <div style={{ flex: 1 }}><h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2><p style={{ color: semantic.textMuted, margin: '4px 0 0', fontSize: 13, lineHeight: 1.5 }}>{subtitle}</p></div>
    {badge}
  </div>;
}

function IntegrationCard({ item, onKill, busy }: { item: Row; onKill: (item: Row) => void; busy: string }) {
  const ready = item.status === 'READY'; const disabled = item.mode === 'DISABLED';
  return <article style={{ padding: 13, border: '1px solid rgba(94,234,212,.14)', borderRadius: 11, background: '#07151c' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}><strong>{item.label}</strong><Badge tone={ready ? 'good' : disabled ? 'neutral' : 'warn'}>{item.status}</Badge></div>
    <div style={{ color: semantic.textMuted, fontSize: 12, marginTop: 7 }}>{item.providerType} · {item.mode}</div>
    <div style={{ color: item.killSwitch ? '#fb7185' : '#fbbf24', fontSize: 12, marginTop: 5 }}>{item.healthReasonCode}</div>
    <button style={{ ...quietButton, marginTop: 10, padding: '7px 10px', background: item.killSwitch ? '#18372d' : '#3a1520' }} disabled={!!busy} onClick={() => onKill(item)}>
      <Siren size={13}/>{item.killSwitch ? 'Request revalidation' : 'Activate kill switch'}
    </button>
  </article>;
}

export default function CallCommandMspWorkspace() {
  const [data, setData] = useState<MspWorkspace | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revealedSupportLink, setRevealedSupportLink] = useState('');
  const [org, setOrg] = useState({ organizationId: '', supportTier: 'Managed Support', bmsAccountExternalId: '', automationMode: 'TICKET_ONLY' });
  const [line, setLine] = useState({ organizationId: '', phone: '', lineType: 'MAIN', trustMode: 'STRICT' });
  const [contact, setContact] = useState({ organizationId: '', contactId: '', bmsContactExternalId: '' });
  const [link, setLink] = useState({ organizationId: '', contactId: '' });
  const [integration, setIntegration] = useState({ providerType: 'BMS', label: 'Kaseya BMS', mode: 'DISABLED', organizationId: '', schemaDocument: '' });
  const [simulation, setSimulation] = useState({ organizationId: '', contactId: '', description: 'The user cannot print to the office printer and needs technician assistance.' });

  const refresh = useCallback(async () => {
    try { setData(await moduleShellApi.callcommand.mspWorkspace() as MspWorkspace); setError(''); }
    catch (caught) { setError(errorMessage(caught, 'The MSP intake workspace could not be loaded.')); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const run = useCallback(async (key: string, operation: () => Promise<any>, success: string) => {
    setBusy(key); setError(''); setNotice('');
    try {
      const result = await operation();
      if (result?.supportLinkId) setRevealedSupportLink(String(result.supportLinkId));
      setNotice(success); await refresh(); return result;
    } catch (caught) { setError(errorMessage(caught, 'The request failed.')); return null; }
    finally { setBusy(''); }
  }, [refresh]);

  const profileContacts = useMemo(() => data?.contacts.filter(item => !link.organizationId || item.organizationId === link.organizationId) ?? [], [data, link.organizationId]);
  const activeCases = data?.cases.filter(item => !['RESOLVED', 'CLOSED'].includes(item.status)) ?? [];
  const blockedOutbox = data?.outbox.filter(item => ['BLOCKED', 'DEAD_LETTER', 'RETRY'].includes(item.status)) ?? [];

  const loading = !data && !error;

  return <section aria-label="CallCommand MSP intake and automation fabric" aria-busy={loading} style={{ marginBottom: space.xxl, position: 'relative' }}>
    {loading && <div role="status" style={{ ...panel, position: 'absolute', inset: '12px 12px auto', zIndex: 2, display: 'flex', gap: 10, alignItems: 'center', color: semantic.textMuted, boxShadow: '0 18px 55px rgba(0,0,0,.42)' }}>
      <Loader2 size={18} aria-hidden="true"/>Loading the MSP intake command center…
    </div>}
    <div inert={loading ? true : undefined} aria-hidden={loading || undefined} style={{ pointerEvents: loading ? 'none' : 'auto' }}>
    <div style={{ ...panel, padding: 0, overflow: 'hidden', marginBottom: space.lg, borderColor: 'rgba(52,211,153,.36)' }}>
      <div style={{ padding: '22px 24px', background: 'radial-gradient(circle at 88% 0,rgba(16,185,129,.22),transparent 38%),linear-gradient(135deg,rgba(6,78,59,.3),rgba(5,15,22,.2))' }}>
        <div style={{ display: 'flex', gap: 15, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 47, height: 47, display: 'grid', placeItems: 'center', borderRadius: 15, background: 'linear-gradient(145deg,#0f766e,#34d399)', color: '#02110d' }}><Headset size={25}/></div>
          <div style={{ flex: 1, minWidth: 240 }}><h2 style={{ margin: 0, fontSize: 22 }}>MSP Intake Command Center</h2><p style={{ color: '#a7c7c5', margin: '5px 0 0', fontSize: 13 }}>Authenticated support association, ticket-first safety, operator screen-pop, and policy-gated automation.</p></div>
          <Badge tone="good">Phase 1 active locally</Badge><Badge tone="warn">privileged actions gated</Badge>
          <button style={quietButton} disabled={!!busy} onClick={() => void refresh()}><RefreshCw size={14}/>Refresh</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', borderTop: '1px solid rgba(94,234,212,.13)' }}>
        {[
          ['Active calls', data?.activeCalls.length ?? 0, Activity], ['Open cases', activeCases.length, ClipboardCheck],
          ['Trusted lines', data?.trustedLines.filter(item => item.status === 'ACTIVE').length ?? 0, Phone],
          ['SupportLinks', data?.supportLinks.filter(item => item.status === 'ACTIVE').length ?? 0, Fingerprint],
          ['Provider exceptions', blockedOutbox.length, AlertTriangle],
        ].map(([label, value, Icon]: any) => <div key={label} style={{ padding: '16px 18px', borderRight: '1px solid rgba(94,234,212,.1)' }}><Icon size={16} color="#2dd4bf"/><div style={{ fontSize: 25, fontWeight: 900, marginTop: 6 }}>{value}</div><div style={{ color: semantic.textMuted, fontSize: 12 }}>{label}</div></div>)}
      </div>
    </div>

    {error && <div role="alert" style={{ ...panel, color: '#fda4af', borderColor: 'rgba(251,113,133,.5)', marginBottom: space.md }}><AlertTriangle size={16} style={{ verticalAlign: -3, marginRight: 8 }}/>{error}</div>}
    {notice && <div role="status" style={{ ...panel, color: '#6ee7b7', borderColor: 'rgba(52,211,153,.45)', marginBottom: space.md }}><CheckCircle2 size={16} style={{ verticalAlign: -3, marginRight: 8 }}/>{notice}</div>}
    {revealedSupportLink && <div role="status" style={{ ...panel, borderColor: 'rgba(251,191,36,.55)', marginBottom: space.md }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}><FileKey2 color="#fbbf24"/><div style={{ flex: 1 }}><strong>SupportLink ID — display once</strong><div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 25, letterSpacing: 4, marginTop: 5 }}>{revealedSupportLink}</div><small style={{ color: semantic.textMuted }}>Deliver it using an approved channel. It cannot be recovered from this screen; rotate it if lost.</small></div><button style={quietButton} onClick={() => setRevealedSupportLink('')}>I recorded it</button></div>
    </div>}

    <nav aria-label="MSP workspace sections" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: space.lg }}>
      {[
        ['callcommand-msp-operations','Operations'],['callcommand-msp-organizations','Organizations'],['callcommand-msp-contacts','Contacts'],
        ['callcommand-msp-integrations','Integrations'],['callcommand-msp-policy','Policy'],['callcommand-msp-audit','Audit'],['callcommand-msp-onboarding','Onboarding'],
      ].map(([id,label])=><a key={id} href={`#${id}`} style={{ color:'#99f6e4',textDecoration:'none',padding:'7px 10px',borderRadius:8,background:'rgba(15,118,110,.12)',fontSize:12,fontWeight:800 }}>{label}</a>)}
    </nav>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,390px),1fr))', gap: space.lg, marginBottom: space.lg }}>
      <section id="callcommand-msp-operations" style={panel}>
        <SectionHeading icon={<Activity/>} title="Live intake operations" subtitle="Screen-pop only after trusted-line and SupportLink association. A phone number alone never authenticates a caller." badge={<Badge tone={data?.activeCalls.length ? 'good' : 'neutral'}>{data?.activeCalls.length ?? 0} live</Badge>}/>
        <div style={{ display: 'grid', gap: 9 }}>
          {data?.activeCalls.length ? data.activeCalls.map(item=><div key={item.id} style={{ padding: 11, borderRadius: 10, background:'#07151c',border:'1px solid rgba(94,234,212,.14)' }}>
            <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><strong style={{flex:1}}>{item.organizationName || 'Unrecognized line'}</strong><Badge tone={item.assuranceLevel==='A1'?'good':'warn'}>{item.assuranceLevel}</Badge><Badge>{item.state}</Badge></div>
            <div style={{color:semantic.textMuted,fontSize:12,marginTop:5}}>{item.firstName ? `${item.firstName} ${item.lastName || ''}` : item.phoneMasked} · {item.caseReference || 'case pending'}</div>
          </div>) : <div style={{color:semantic.textMuted,fontSize:13,padding:12,border:'1px dashed rgba(94,234,212,.2)',borderRadius:10}}>No call is currently in the MSP intake state machine.</div>}
        </div>
      </section>

      <section style={panel}>
        <SectionHeading icon={<Siren/>} title="Global safety controls" subtitle="Ticket-only is the safe default. Incident mode immediately narrows the product to human-reviewed intake." badge={<Badge tone={data?.settings.incidentMode?'bad':'good'}>{data?.settings.incidentMode?'incident mode':'normal mode'}</Badge>}/>
        <div style={{display:'grid',gap:11}}>
          <Label title="Automation mode"><select style={field} value={data?.settings.automationMode || 'TICKET_ONLY'} onChange={event=>setData(current=>current?{...current,settings:{...current.settings,automationMode:event.target.value}}:current)}><option value="TICKET_ONLY">Ticket only</option><option value="READ_ONLY">Read-only health</option><option value="STANDARD">Standard policy-gated</option><option value="MANUAL_ONLY">Manual only</option></select></Label>
          <label style={{display:'flex',gap:9,alignItems:'center',minHeight:24,fontSize:13,color:semantic.textMuted}}><input type="checkbox" checked={Boolean(data?.settings.incidentMode)} onChange={event=>setData(current=>current?{...current,settings:{...current.settings,incidentMode:event.target.checked}}:current)}/>Incident mode / automation kill switch</label>
          <button style={data?.settings.incidentMode?quietButton:primaryButton} disabled={!!busy||!data} onClick={()=>void run('settings',()=>moduleShellApi.callcommand.mspUpdateSettings({automationMode:data?.settings.automationMode,incidentMode:data?.settings.incidentMode,recordingDefault:data?.settings.recordingDefault,transcriptRetentionHours:data?.settings.transcriptRetentionHours}),'MSP safety settings updated.')}>{busy==='settings'?<Loader2 size={15}/>:<ShieldCheck size={15}/>}Save safety controls</button>
        </div>
      </section>
    </div>

    <section id="callcommand-msp-organizations" style={{ ...panel, marginBottom: space.lg }}>
      <SectionHeading icon={<Building2/>} title="Organizations and trusted originating lines" subtitle="The OperatorOS Business Directory stays authoritative. CallCommand adds the service contract, BMS mapping, approved-line trust and cooldown evidence."/>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,280px),1fr))',gap:space.md}}>
        <div style={{display:'grid',gap:9}}><strong>Service profile</strong>
          <Label title="Directory organization"><select style={field} value={org.organizationId} onChange={event=>setOrg({...org,organizationId:event.target.value})}><option value="">Choose organization</option>{data?.organizations.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></Label>
          <Label title="Support tier"><input style={field} value={org.supportTier} onChange={event=>setOrg({...org,supportTier:event.target.value})}/></Label>
          <Label title="BMS account ID" hint="Stored as a mapping, never inferred from caller speech."><input style={field} value={org.bmsAccountExternalId} onChange={event=>setOrg({...org,bmsAccountExternalId:event.target.value})}/></Label>
          <button style={primaryButton} disabled={!!busy||!org.organizationId} onClick={()=>void run('org',()=>moduleShellApi.callcommand.mspConfigureOrganization(org),'Organization support profile saved.')}><Building2 size={15}/>Save organization profile</button>
        </div>
        <div style={{display:'grid',gap:9}}><strong>Trusted line</strong>
          <Label title="Organization"><select style={field} value={line.organizationId} onChange={event=>setLine({...line,organizationId:event.target.value})}><option value="">Choose organization</option>{data?.organizations.filter(item=>item.profileId).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></Label>
          <Label title="Originating line (E.164)" hint="Encrypted at rest; the workspace retains only the last four digits."><input style={field} placeholder="+15551234567" value={line.phone} onChange={event=>setLine({...line,phone:event.target.value})}/></Label>
          <Label title="Line type"><select style={field} value={line.lineType} onChange={event=>setLine({...line,lineType:event.target.value})}><option value="MAIN">Main</option><option value="BRANCH">Branch</option><option value="PBX_OUTBOUND">PBX outbound</option><option value="DIRECT_DID">Direct DID</option><option value="SIP_TRUNK">SIP trunk</option></select></Label>
          <button style={primaryButton} disabled={!!busy||!line.organizationId||!/^\+[1-9]\d{7,14}$/.test(line.phone)} onClick={()=>void run('line',()=>moduleShellApi.callcommand.mspConfigureTrustedLine(line),'Line stored in pending verification with a 24-hour cooldown.')}><Phone size={15}/>Add pending trusted line</button>
        </div>
      </div>
      <div style={{display:'grid',gap:8,marginTop:16}}>{data?.trustedLines.map(item=><div key={item.id} style={{display:'flex',gap:9,alignItems:'center',padding:10,border:'1px solid rgba(94,234,212,.13)',borderRadius:9,flexWrap:'wrap'}}><Phone size={14}/><span style={{flex:1,minWidth:180}}>•••• {item.displayLast4} · {item.lineType} · {item.trustMode}</span><Badge tone={item.status==='ACTIVE'?'good':item.status==='PENDING'||item.status==='SUSPENDED'?'warn':'bad'}>{item.status}</Badge>{['PENDING','SUSPENDED'].includes(item.status)&&<button style={{...quietButton,padding:'7px 9px'}} disabled={!!busy} onClick={()=>void run(`verify:${item.id}`,()=>moduleShellApi.callcommand.mspVerifyTrustedLine(item.id,{verificationMethod:'CALLBACK_TEST',verificationEvidence:'Administrator completed documented provider callback and number ownership review.',allowsAutomation:false}),'Line verified for intake. Automation remains disabled during onboarding.')}><CheckCircle2 size={13}/>Verify intake line</button>}{item.status==='ACTIVE'&&<button style={{...quietButton,padding:'7px 9px'}} disabled={!!busy} onClick={()=>void run(`line-suspend:${item.id}`,()=>moduleShellApi.callcommand.mspSetTrustedLineStatus(item.id,{status:'SUSPENDED',reason:'Suspended by an OperatorOS tenant administrator.'}),'Trusted line suspended.')}><AlertTriangle size={13}/>Suspend</button>}{item.status!=='REVOKED'&&<button style={{...quietButton,padding:'7px 9px',background:'#3a1520'}} disabled={!!busy} onClick={()=>{if(window.confirm('Permanently revoke this trusted originating line?'))void run(`line-revoke:${item.id}`,()=>moduleShellApi.callcommand.mspSetTrustedLineStatus(item.id,{status:'REVOKED',reason:'Revoked by an OperatorOS tenant administrator.'}),'Trusted line revoked.');}}><AlertOctagon size={13}/>Revoke</button>}</div>)}</div>
    </section>

    <section id="callcommand-msp-contacts" style={{ ...panel, marginBottom: space.lg }}>
      <SectionHeading icon={<UserRoundCheck/>} title="Support contacts and SupportLink" subtitle="Contacts remain Directory records. SupportLink is a rotatable 10-digit association identifier with checksum, retry limits, encrypted storage, and display-once issuance."/>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,280px),1fr))',gap:space.md}}>
        <div style={{display:'grid',gap:9}}><strong>Contact mapping</strong>
          <Label title="Organization"><select style={field} value={contact.organizationId} onChange={event=>setContact({...contact,organizationId:event.target.value})}><option value="">Choose organization</option>{data?.organizations.filter(item=>item.profileId).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></Label>
          <Label title="Directory contact"><select style={field} value={contact.contactId} onChange={event=>setContact({...contact,contactId:event.target.value})}><option value="">Choose contact</option>{data?.directoryContacts.map(item=><option key={item.id} value={item.id}>{item.firstName} {item.lastName} {item.email?`· ${item.email}`:''}</option>)}</select></Label>
          <Label title="BMS contact ID"><input style={field} value={contact.bmsContactExternalId} onChange={event=>setContact({...contact,bmsContactExternalId:event.target.value})}/></Label>
          <button style={primaryButton} disabled={!!busy||!contact.organizationId||!contact.contactId} onClick={()=>void run('contact',()=>moduleShellApi.callcommand.mspConfigureContact({...contact,supportEligible:true,status:'ACTIVE'}),'Support contact mapped.')}><Link2 size={15}/>Map support contact</button>
        </div>
        <div style={{display:'grid',gap:9}}><strong>Issue or rotate SupportLink</strong>
          <Label title="Organization"><select style={field} value={link.organizationId} onChange={event=>setLink({organizationId:event.target.value,contactId:''})}><option value="">Choose organization</option>{data?.organizations.filter(item=>item.profileId).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></Label>
          <Label title="Mapped contact"><select style={field} value={link.contactId} onChange={event=>setLink({...link,contactId:event.target.value})}><option value="">Choose mapped contact</option>{profileContacts.map(item=><option key={item.contactId} value={item.contactId}>{item.firstName} {item.lastName} · {item.organizationName}</option>)}</select></Label>
          <div style={{padding:11,borderRadius:9,background:'rgba(251,191,36,.08)',border:'1px solid rgba(251,191,36,.2)',fontSize:12,color:'#fde68a'}}>Issuing a new value immediately replaces the current active SupportLink. The raw value is returned once.</div>
          <button style={primaryButton} disabled={!!busy||!link.organizationId||!link.contactId} onClick={()=>void run('support-link',()=>moduleShellApi.callcommand.mspIssueSupportLink({...link,expiresInDays:365}),'SupportLink issued. Record the display-once value now.')}><KeyRound size={15}/>Issue / rotate SupportLink</button>
        </div>
      </div>
      <div style={{display:'grid',gap:8,marginTop:16}}>{data?.supportLinks.map(item=><div key={item.id} style={{display:'flex',gap:9,alignItems:'center',padding:10,border:'1px solid rgba(94,234,212,.13)',borderRadius:9,flexWrap:'wrap'}}><Fingerprint size={14}/><span style={{flex:1,minWidth:180}}>SupportLink ending {item.last4} · {item.expiresAt?`expires ${new Date(item.expiresAt).toLocaleDateString()}`:'no expiry'}</span><Badge tone={item.status==='ACTIVE'?'good':item.status==='SUSPENDED'?'warn':'neutral'}>{item.status}</Badge>{item.status==='ACTIVE'&&<button style={{...quietButton,padding:'7px 9px'}} disabled={!!busy} onClick={()=>void run(`link-suspend:${item.id}`,()=>moduleShellApi.callcommand.mspSetSupportLinkStatus(item.id,{status:'SUSPENDED',reason:'Suspended by an OperatorOS tenant administrator.'}),'SupportLink suspended.')}><AlertTriangle size={13}/>Suspend</button>}{['ACTIVE','SUSPENDED'].includes(item.status)&&<button style={{...quietButton,padding:'7px 9px',background:'#3a1520'}} disabled={!!busy} onClick={()=>{if(window.confirm('Permanently revoke this SupportLink? The caller will need a newly issued value.'))void run(`link-revoke:${item.id}`,()=>moduleShellApi.callcommand.mspSetSupportLinkStatus(item.id,{status:'REVOKED',reason:'Revoked by an OperatorOS tenant administrator.'}),'SupportLink revoked.');}}><AlertOctagon size={13}/>Revoke</button>}</div>)}</div>
    </section>

    <section id="callcommand-msp-integrations" style={{ ...panel, marginBottom: space.lg }}>
      <SectionHeading icon={<PlugZap/>} title="MSP Automation Fabric integrations" subtitle="Credentials are sealed in the shared OperatorOS vault. Live adapters stay degraded until tenant-specific contracts, mappings, scopes, rate limits, and provider acceptance have passed."/>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,240px),1fr))',gap:space.md}}>
        <Label title="Provider"><select style={field} value={integration.providerType} onChange={event=>setIntegration({...integration,providerType:event.target.value,label:event.target.options[event.target.selectedIndex].text})}><option value="BMS">Kaseya BMS</option><option value="DATTO_RMM">Datto RMM</option><option value="MICROSOFT_GRAPH">Microsoft Graph</option><option value="AD_BROKER">On-prem AD broker</option><option value="TWILIO_VERIFY">Twilio Verify</option></select></Label>
        <Label title="Mode"><select style={field} value={integration.mode} onChange={event=>setIntegration({...integration,mode:event.target.value})}><option value="DISABLED">Disabled</option><option value="TEST">Test</option><option value="LIVE">Live onboarding</option></select></Label>
        <Label title="Organization scope"><select style={field} value={integration.organizationId} onChange={event=>setIntegration({...integration,organizationId:event.target.value})}><option value="">Tenant-wide</option>{data?.organizations.filter(item=>item.profileId).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></Label>
        <Label title="Accepted schema / Swagger document" hint="Hashed for contract drift detection; not treated as a credential."><textarea style={{...field,minHeight:76}} value={integration.schemaDocument} onChange={event=>setIntegration({...integration,schemaDocument:event.target.value})}/></Label>
      </div>
      <button style={{...primaryButton,marginTop:12}} disabled={!!busy} onClick={()=>void run('integration',()=>moduleShellApi.callcommand.mspConfigureIntegration({...integration,publicConfig:{onboardingRequested:true}}),'Integration onboarding record saved without asserting provider readiness.')}><Network size={15}/>Save onboarding record</button>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:10,marginTop:15}}>{data?.integrations.map(item=><IntegrationCard key={item.id} item={item} busy={busy} onKill={selected=>void run(`kill:${selected.id}`,()=>moduleShellApi.callcommand.mspIntegrationKillSwitch(selected.id,!selected.killSwitch),selected.killSwitch?'Integration moved to revalidation required.':'Integration kill switch activated.')}/>)}</div>
    </section>

    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,390px),1fr))',gap:space.lg,marginBottom:space.lg}}>
      <section id="callcommand-msp-policy" style={panel}>
        <SectionHeading icon={<ShieldCheck/>} title="Assurance and action policy" subtitle="A0 intake, A1 SupportLink association, A2 independent verification, A3 approval, and A4 security-administrator oversight."/>
        <div style={{display:'grid',gap:7}}>{data?.phases.map(item=><div key={item.phase} style={{display:'flex',gap:8,alignItems:'center',padding:9,borderRadius:8,background:'#07151c'}}><strong style={{minWidth:58}}>Phase {item.phase}</strong><span style={{flex:1,fontSize:12,color:semantic.textMuted}}>{item.label}</span><Badge tone={item.status==='ACTIVE_LOCAL'?'good':'warn'}>{item.status}</Badge></div>)}</div>
        <div style={{marginTop:12,padding:11,border:'1px solid rgba(251,113,133,.25)',borderRadius:9,color:'#fecdd3',fontSize:12}}><AlertOctagon size={14} style={{verticalAlign:-2,marginRight:6}}/>Arbitrary commands, server actions, endpoint-security changes, BitLocker operations, local-admin creation, and privileged/shared/service/break-glass/unknown-account resets are prohibited.</div>
      </section>
      <section style={panel}>
        <SectionHeading icon={<Wrench/>} title="Deterministic intake lab" subtitle="Creates a local test case and exercises the real classification, audit, outbox, and provider-truth paths. It never simulates a successful live provider action."/>
        <div style={{display:'grid',gap:9}}>
          <Label title="Organization"><select style={field} value={simulation.organizationId} onChange={event=>setSimulation({...simulation,organizationId:event.target.value,contactId:''})}><option value="">Choose organization</option>{data?.organizations.filter(item=>item.profileId).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></Label>
          <Label title="Mapped contact"><select style={field} value={simulation.contactId} onChange={event=>setSimulation({...simulation,contactId:event.target.value})}><option value="">Choose contact</option>{data?.contacts.filter(item=>item.organizationId===simulation.organizationId).map(item=><option key={item.contactId} value={item.contactId}>{item.firstName} {item.lastName}</option>)}</select></Label>
          <Label title="Issue description" hint="Use no password, passcode, customer secret, or regulated data."><textarea style={{...field,minHeight:92}} value={simulation.description} onChange={event=>setSimulation({...simulation,description:event.target.value})}/></Label>
          <button style={primaryButton} disabled={!!busy||!simulation.organizationId||!simulation.contactId||simulation.description.trim().length<5} onClick={()=>void run('simulate-msp',()=>moduleShellApi.callcommand.mspSimulateIntake(simulation),'Deterministic MSP intake created a local case and evaluated BMS provider truth.')}><Wrench size={15}/>Run intake lab</button>
        </div>
      </section>
    </div>

    <section id="callcommand-msp-audit" style={{...panel,marginBottom:space.lg}}>
      <SectionHeading icon={<ScrollText/>} title="Hash-linked call evidence" subtitle="Each call context has a monotonic, previous-hash-linked event ledger. Sensitive raw associations and provider credentials are excluded from browser responses." badge={<Badge>{data?.audit.length ?? 0} recent events</Badge>}/>
      <div role="region" aria-label="CallCommand audit events" tabIndex={0} style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:720}}><thead><tr>{['Time','Event','Actor','Outcome','Sequence','Event hash'].map(item=><th key={item} style={{textAlign:'left',padding:8,color:semantic.textMuted,borderBottom:'1px solid rgba(94,234,212,.2)'}}>{item}</th>)}</tr></thead><tbody>{data?.audit.slice(0,40).map(item=><tr key={item.id}><td style={{padding:8,borderBottom:'1px solid rgba(94,234,212,.08)',whiteSpace:'nowrap'}}>{new Date(item.createdAt).toLocaleString()}</td><td style={{padding:8,borderBottom:'1px solid rgba(94,234,212,.08)'}}>{item.eventType}</td><td style={{padding:8,borderBottom:'1px solid rgba(94,234,212,.08)'}}>{item.actorType}</td><td style={{padding:8,borderBottom:'1px solid rgba(94,234,212,.08)'}}>{item.outcome}</td><td style={{padding:8,borderBottom:'1px solid rgba(94,234,212,.08)'}}>{item.sequence}</td><td style={{padding:8,borderBottom:'1px solid rgba(94,234,212,.08)',fontFamily:'monospace'}}>{String(item.eventHash).slice(0,16)}…</td></tr>)}</tbody></table></div>
    </section>

    <section id="callcommand-msp-onboarding" style={panel}>
      <SectionHeading icon={<ClipboardCheck/>} title="Production onboarding gates" subtitle="Local completeness is not deployment acceptance. These gates must be satisfied per tenant and target environment before the corresponding capability can be advertised as live."/>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:10}}>{[
        ['1. Telephony boundary','Dedicated MSP product-mode number, public exact URL, Twilio signature fixture, status callback and transfer target.'],
        ['2. Customer mapping','Active support contract, exact approved originating lines, independently verified contacts, SupportLink delivery and rotation runbook.'],
        ['3. BMS adapter','Tenant Swagger fingerprint, auth contract, account/contact/queue/type/status/priority mappings, idempotency and reconciliation proof.'],
        ['4. Datto read-only','API v2 credentials, site/device sync, rate-limit behavior, component catalog review and device-affinity evidence.'],
        ['5. Privileged automation','Independent A2 challenge, confirmation wording, approval, expiry, unknown-result response, incident drill and rollback.'],
        ['6. Identity reset','Cloud-only standard account, secure browser flow, prohibited-account tests, provider audit and emergency disable control.'],
      ].map(([title,text])=><article key={title} style={{padding:12,border:'1px solid rgba(94,234,212,.13)',borderRadius:10,background:'#07151c'}}><strong>{title}</strong><p style={{color:semantic.textMuted,fontSize:12,lineHeight:1.5,margin:'6px 0 0'}}>{text}</p></article>)}</div>
      <p style={{color:semantic.textMuted,fontSize:11,margin:'14px 0 0'}}>Contract: {data?.contract || 'loading'} · Password reset and RMM action toggles are server-forced off in this delivery.</p>
    </section>
    </div>
  </section>;
}
