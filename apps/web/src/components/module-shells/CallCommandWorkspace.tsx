'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity, AlertTriangle, Bot, CheckCircle2, Download, GitBranch, Headphones,
  Inbox, Loader2, PhoneCall, Plus, Radio, Route, ShieldCheck, TicketCheck,
  Users, Workflow, Zap,
} from 'lucide-react';
import { moduleShellApi } from '@/lib/auth';
import { cardStyle, fontSize, radius, semantic, space } from '@/lib/design-tokens';
import CallCommandMspWorkspace from './CallCommandMspWorkspace';
import CallCommandCommercialWorkspace from './CallCommandCommercialWorkspace';
import type { CallCommandRouteArea } from './CallCommandRoute.contract';

type Row = Record<string, any>;
type Workspace = {
  source: Row;
  channels: Row[];
  profiles: Row[];
  targets: Row[];
  flows: Row[];
  rules: Row[];
  calls: Row[];
  tickets: Row[];
  leads: Row[];
  tasks: Row[];
  sessions: Row[];
  actionRuns: Row[];
  activity: Row[];
  analytics: Row;
  usage: Row[];
  providers: { telephony: Row; shared: Row[]; webhookEndpoints: Row[] };
};

const card: React.CSSProperties = {
  ...cardStyle,
  background: 'linear-gradient(145deg,rgba(9,18,28,.98),rgba(12,28,33,.96))',
  borderColor: 'rgba(45,212,191,.18)',
  boxShadow: '0 16px 45px rgba(0,0,0,.2)',
};
const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', color: semantic.text, background: '#071017',
  border: '1px solid rgba(94,234,212,.25)', borderRadius: radius.sm, padding: '10px 11px', colorScheme: 'dark',
};
const button: React.CSSProperties = {
  border: 0, borderRadius: radius.sm, padding: '9px 13px', background: 'linear-gradient(135deg,#0f766e,#10b981)',
  color: '#fff', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7,
};
const quietButton: React.CSSProperties = { ...button, background: '#13232d', border: '1px solid rgba(94,234,212,.2)' };
const commercialViews: CallCommandRouteArea[] = ['overview', 'setup', 'numbers', 'agents', 'workflows', 'calls', 'actions', 'usage', 'health'];

function message(error: unknown, fallback: string) {
  return (error as any)?.error || (error as any)?.message || fallback;
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label style={{ display: 'grid', gap: 5, color: semantic.textMuted, fontSize: fontSize.sm }}>
    <span>{label}</span>{children}{hint && <small>{hint}</small>}
  </label>;
}

function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'good' | 'warn' | 'bad' | 'neutral' }) {
  const color = tone === 'good' ? '#34d399' : tone === 'warn' ? '#fbbf24' : tone === 'bad' ? '#fb7185' : '#94a3b8';
  return <span style={{ border: `1px solid ${color}55`, color, padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 800 }}>{children}</span>;
}

export default function CallCommandWorkspace({
  view,
  recordId,
  hrefFor = path => path,
  canWriteModule,
  canManageModule,
}: {
  view: CallCommandRouteArea;
  recordId?: string;
  hrefFor?: (path: string) => string;
  canWriteModule: boolean;
  canManageModule: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<Workspace | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedCallId, setSelectedCallId] = useState(recordId ?? '');
  const [channel, setChannel] = useState({ name: 'Primary operations line', phone: '', timezone: 'America/New_York', behavior: 'ai_receptionist', afterHours: 'voicemail' });
  const [profile, setProfile] = useState({ name: 'Operations receptionist', greeting: 'Thank you for calling. I can capture your request and route it to the right team.', mode: 'general' });
  const [flowName, setFlowName] = useState('Priority intake and dispatch');
  const [ruleName, setRuleName] = useState('Urgent calls create tickets');
  const [transcript, setTranscript] = useState('Caller reports an active service outage and needs an urgent technician callback.');
  const [target, setTarget] = useState({ label: 'On-call operator', phone: '' });

  const refresh = useCallback(async () => {
    if (['organizations', 'compliance'].includes(view)) return;
    if (commercialViews.includes(view)) return;
    try {
      const workspace = await moduleShellApi.callcommand.productWorkspace() as Workspace;
      setData(workspace);
      setSelectedCallId(current => current || workspace.calls?.[0]?.id || '');
      setError('');
    } catch (caught) {
      setError(message(caught, 'CallCommand workspace could not be loaded.'));
    }
  }, [view]);

  useEffect(() => { void refresh(); }, [refresh]);

  const selectedCall = useMemo(() => data?.calls.find(item => item.id === selectedCallId) ?? data?.calls[0] ?? null, [data, selectedCallId]);
  const activeSession = data?.sessions.find(item => !item.endedAt) ?? null;
  const activeChannel = data?.channels.find(item => item.status === 'active') ?? null;
  const activeProfile = data?.profiles.find(item => item.status === 'active') ?? null;
  const telephonyReady = data?.providers.telephony?.configured === true;

  if (commercialViews.includes(view)) {
    return <CallCommandCommercialWorkspace view={view} recordId={recordId} hrefFor={hrefFor} allowWrite={canWriteModule}/>;
  }

  async function run(name: string, work: () => Promise<unknown>, success: string) {
    if (busy || !canWriteModule) return;
    setBusy(name); setError(''); setNotice('');
    try { await work(); setNotice(success); await refresh(); }
    catch (caught) { setError(message(caught, 'The operation could not be completed.')); }
    finally { setBusy(''); }
  }

  async function downloadReport() {
    if (!selectedCall || busy) return;
    setBusy('report'); setError('');
    try {
      const blob = await moduleShellApi.callcommand.productReport(selectedCall.id);
      const url = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = url; link.download = `callcommand-${selectedCall.id}.pdf`; link.click(); URL.revokeObjectURL(url);
      setNotice('Validated call intelligence PDF downloaded.'); await refresh();
    } catch (caught) { setError(message(caught, 'The report could not be generated.')); }
    finally { setBusy(''); }
  }

  const flowGraph = {
    start: 'priority_check',
    nodes: [
      { key: 'priority_check', type: 'condition', config: { field: 'priority', operator: 'in', value: ['high', 'urgent'] }, yes: 'create_ticket', no: 'create_task' },
      { key: 'create_ticket', type: 'action', config: { actionType: 'ticket', title: 'Urgent call response' } },
      { key: 'create_task', type: 'action', config: { actionType: 'task', title: 'Review caller request' } },
    ],
  };

  return <section data-testid={`callcommand-${view}-route`} data-callcommand-view={view} style={{ minWidth: 0, color: semantic.text }}>
      {!['organizations', 'compliance'].includes(view) && <section data-testid="banner-callcommand-provider" style={{ ...card, display: 'flex', gap: 12, alignItems: 'center', marginBottom: space.lg, borderColor: telephonyReady ? 'rgba(52,211,153,.45)' : 'rgba(251,191,36,.45)' }}>
        <Radio size={18} color={telephonyReady ? '#34d399' : '#fbbf24'} />
        <div style={{ flex: 1 }}><strong>{telephonyReady ? 'Twilio is connected' : 'Twilio setup needed'}</strong><div style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>{telephonyReady ? `Check this organization's business number, call routing, and receptionist workflow under Health and readiness before going live.` : 'Configuration, workflows, simulations, and call review remain available. Live calls and transfers remain unavailable until an administrator connects Twilio.'}</div></div>
        <Pill tone={telephonyReady ? 'warn' : 'warn'}>{telephonyReady ? 'credential only' : 'setup required'}</Pill>
      </section>}

      {error && <div role="alert" data-testid="text-callcommand-error" style={{ ...card, borderColor: 'rgba(251,113,133,.5)', color: '#fda4af', marginBottom: space.md }}><AlertTriangle size={16} style={{ verticalAlign: -3, marginRight: 8 }}/>{error}</div>}
      {notice && <div role="status" style={{ ...card, borderColor: 'rgba(52,211,153,.45)', color: '#6ee7b7', marginBottom: space.md }}><CheckCircle2 size={16} style={{ verticalAlign: -3, marginRight: 8 }}/>{notice}</div>}
      {!canWriteModule && !['organizations', 'compliance'].includes(view) && <div role="status" data-testid="text-callcommand-viewer-access" style={{ ...card, borderColor: 'rgba(96,165,250,.45)', color: '#bfdbfe', marginBottom: space.md }}><ShieldCheck size={16} style={{ verticalAlign: -3, marginRight: 8 }}/>Viewer access: review calls, transcripts, reports, and follow-up work. A contributor can change call operations, and an administrator can publish routing changes.</div>}

      {['organizations', 'providers', 'compliance', 'settings'].includes(view) && <CallCommandMspWorkspace view={view} canWrite={canWriteModule} canManage={canManageModule} />}

      {view === 'overview' && <section id="callcommand-dashboard" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: space.md, marginBottom: space.xl }}>
        {[
          ['Total calls', data?.analytics?.totalCalls ?? 0, PhoneCall],
          ['Calls today', data?.analytics?.callsToday ?? 0, Activity],
          ['High priority', data?.analytics?.highPriorityCalls ?? 0, AlertTriangle],
          ['Live sessions', data?.sessions.filter(item => !item.endedAt).length ?? 0, Radio],
          ['Actions dispatched', data?.actionRuns.length ?? 0, Zap],
        ].map(([label,value,Icon]: any) => <article key={label} style={card}><Icon size={18} color="#2dd4bf"/><div style={{ fontSize: 27, fontWeight: 900, marginTop: 8 }}>{value}</div><div style={{ color: semantic.textMuted, fontSize: 12 }}>{label}</div></article>)}
      </section>}

      {view === 'numbers' && <section id="callcommand-configuration" style={{ ...card, marginBottom: space.xl }}>
        <SectionTitle icon={<PhoneCall/>} title="Channels and phone lines" subtitle="Business hours, live behavior, consent policy, receptionist assignment, after-hours routing, and connection health." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: space.md }}>
          <Field label="Line name"><input data-testid="input-callcommand-channel-name" style={input} value={channel.name} onChange={event=>setChannel({...channel,name:event.target.value})}/></Field>
          <Field label="Business phone number"><input data-testid="input-callcommand-channel-phone" style={input} value={channel.phone} placeholder="+1 555 123 4567" onChange={event=>setChannel({...channel,phone:event.target.value.replace(/[\s()-]/g,'')})}/></Field>
          <Field label="Timezone"><input data-testid="input-callcommand-channel-timezone" style={input} value={channel.timezone} onChange={event=>setChannel({...channel,timezone:event.target.value})}/></Field>
          <Field label="Live behavior"><select style={input} value={channel.behavior} onChange={event=>setChannel({...channel,behavior:event.target.value})}><option value="ai_receptionist">AI receptionist</option><option value="ai_screen_then_transfer">AI screen then transfer</option><option value="record_only">Record only</option><option value="forward_only">Forward only</option><option value="voicemail_only">Voicemail only</option><option value="ai_after_hours_intake">AI after-hours intake</option></select></Field>
          <Field label="After-hours behavior"><select style={input} value={channel.afterHours} onChange={event=>setChannel({...channel,afterHours:event.target.value})}><option value="voicemail">Voicemail</option><option value="ai_intake">AI intake</option><option value="forward">Forward</option><option value="hangup">Hang up</option></select></Field>
        </div>
        <button data-testid="button-callcommand-create-channel" disabled={!canWriteModule || !!busy || !activeProfile || !/^\+[1-9]\d{7,14}$/.test(channel.phone)} style={{ ...button, marginTop: 14, opacity: canWriteModule && activeProfile ? 1 : .55 }} onClick={()=>run('channel',()=>moduleShellApi.callcommand.productCreateChannel({ name:channel.name,phone:channel.phone,timezone:channel.timezone,profileId:activeProfile?.id,liveBehavior:channel.behavior,afterHoursBehavior:channel.afterHours,recordingEnabled:true,requireRecordingConsent:true,consentScript:'This call may be recorded and processed after your explicit consent.',businessHours:{always:true},productMode:profile.mode }),'Channel created with signed-webhook and consent controls.')}><Plus size={15}/>{busy==='channel'?'Saving…':'Create channel'}</button>
        {!activeProfile && <p style={{ color:'#fbbf24',fontSize:12 }}>Create a receptionist profile first so the line has a real intake owner.</p>}
        <div style={{ display:'grid',gap:8,marginTop:14 }}>{data?.channels.map(item=><RecordRow key={item.id} title={item.name} detail={`${item.timezone} · ${item.liveBehavior} · after hours ${item.afterHoursBehavior}`} status={item.status} />)}</div>
      </section>}

      {view === 'automations' && <section id="callcommand-receptionists" style={{ ...card, marginBottom:space.xl }}>
        <SectionTitle icon={<Bot/>} title="Receptionist profiles" subtitle="Receptionist modes, greeting and script, structured intake, and a safe fallback when AI is unavailable." />
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:space.md}}>
          <Field label="Profile name"><input style={input} value={profile.name} onChange={event=>setProfile({...profile,name:event.target.value})}/></Field>
          <Field label="Product mode"><select style={input} value={profile.mode} onChange={event=>setProfile({...profile,mode:event.target.value})}><option value="general">General</option><option value="msp">MSP</option><option value="sales">Sales</option><option value="field_service">Field service</option><option value="medical">Medical administrative</option></select></Field>
          <Field label="Greeting"><textarea style={{...input,minHeight:78}} value={profile.greeting} onChange={event=>setProfile({...profile,greeting:event.target.value})}/></Field>
        </div>
        <button data-testid="button-callcommand-create-profile" disabled={!canWriteModule || !!busy} style={{...button,marginTop:14}} onClick={()=>run('profile',()=>moduleShellApi.callcommand.productCreateProfile({name:profile.name,mode:'receptionist',productMode:profile.mode,greeting:profile.greeting,tone:'professional',script:'Collect the request, urgency, callback details, and route it without inventing provider outcomes.',intakeSchema:[{key:'caller_name',label:'your name',required:true},{key:'request',label:'the reason for your call',required:true},{key:'urgency',label:'the urgency',type:'choice',options:['low','normal','high','emergency'],required:true}]}),'Receptionist profile created.')}><Plus size={15}/>Create receptionist</button>
        <div style={{display:'grid',gap:8,marginTop:14}}>{data?.profiles.map(item=><RecordRow key={item.id} title={item.name} detail={`${item.productMode} · ${(item.intakeFields||[]).length} intake fields`} status={item.status}/>)}</div>
      </section>}

      {view === 'automations' && <section id="callcommand-flows" style={{...card,marginBottom:space.xl}}>
        <SectionTitle icon={<GitBranch/>} title="Versioned call flows" subtitle="Validated conditions, actions, AI decisions, routes, execution trace, and a 50-step loop guard." />
        <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'end'}}><Field label="Workflow name"><input style={{...input,minWidth:280}} value={flowName} onChange={event=>setFlowName(event.target.value)}/></Field><button disabled={!canWriteModule || !!busy} style={button} onClick={()=>run('flow',()=>moduleShellApi.callcommand.productCreateFlow({name:flowName,description:'Routes high-priority intelligence into an urgent ticket and standard requests into a task.',productMode:'general',graph:flowGraph}),'Workflow created and ready for review.')}><Workflow size={15}/>Create workflow</button></div>
        <div style={{display:'grid',gap:8,marginTop:14}}>{data?.flows.map(item=><div key={item.id} style={{display:'flex',gap:10,alignItems:'center',padding:11,border:'1px solid rgba(94,234,212,.15)',borderRadius:9}}><Route size={15}/><div style={{flex:1}}><strong>{item.name}</strong><div style={{color:semantic.textMuted,fontSize:12}}>Revision {item.version}{item.activeVersion ? ` · live revision ${item.activeVersion}` : ''}</div></div><Pill tone={item.status==='active'?'good':'neutral'}>{item.status}</Pill>{item.status!=='active'&&<button disabled={!canManageModule || !!busy} style={quietButton} onClick={()=>run(`publish:${item.id}`,()=>moduleShellApi.callcommand.productPublishFlow(item.id),'Flow published and ready for channel assignment.')}>Publish</button>}</div>)}</div>
      </section>}

      {view === 'overview' && <section id="callcommand-switchboard" style={{...card,marginBottom:space.xl}}>
        <SectionTitle icon={<Radio/>} title="Live switchboard" subtitle="Saved call timeline, operator notes, urgency, quick actions, and confirmed transfer results." />
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:space.md}}>
          <Field label="Verified external transfer target"><input style={input} placeholder="+15551234567" value={target.phone} onChange={event=>setTarget({...target,phone:event.target.value})}/></Field>
          <Field label="Target label"><input style={input} value={target.label} onChange={event=>setTarget({...target,label:event.target.value})}/></Field>
          <button disabled={!canWriteModule || !!busy||!/^\+[1-9]\d{7,14}$/.test(target.phone)} style={{...button,alignSelf:'end'}} onClick={()=>run('target',()=>moduleShellApi.callcommand.productCreateTarget({kind:'external',label:target.label,phone:target.phone}),'Transfer target saved as pending verification.')}><Plus size={15}/>Add pending target</button>
        </div>
        {!activeSession ? <Empty icon={<Radio/>} text="No live call is active. Run the setup simulator below or finish connecting Twilio."/> : <div style={{marginTop:14,padding:14,border:'1px solid rgba(45,212,191,.3)',borderRadius:10}}><div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}><Pill tone="good">{activeSession.state}</Pill><strong>{activeSession.callerPhoneMasked}</strong><span style={{color:semantic.textMuted}}>sequence {activeSession.sequence}</span><button disabled={!canWriteModule || !!busy} style={quietButton} onClick={()=>run('urgent',()=>moduleShellApi.callcommand.productUpdateSession(activeSession.id,{urgent:!activeSession.urgent,note:'Operator reviewed the live session.'}),'Switchboard state updated.')}>{activeSession.urgent?'Clear urgent':'Mark urgent'}</button><button disabled={!canWriteModule || !!busy} style={quietButton} onClick={()=>run('end',()=>moduleShellApi.callcommand.productEndSession(activeSession.id),'Live session ended.')}>End</button>{data?.targets[0]&&<button disabled={!canWriteModule || !!busy} style={button} onClick={()=>run('transfer',()=>moduleShellApi.callcommand.productTransfer(activeSession.id,data.targets[0].id),'Twilio accepted the live redirect.')}>Transfer</button>}</div></div>}
      </section>}

      {['calls', 'recordings', 'transcripts', 'analysis'].includes(view) && <section id="callcommand-calls" style={{...card,marginBottom:space.xl}}>
        <SectionTitle icon={<Inbox/>} title="Call intelligence and simulation" subtitle="Transcript, structured call summary, preserved caller number, workflow trace, service details, and downloadable PDF reports." />
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,300px),1fr))',gap:space.lg}}>
          <div><div style={{display:'grid',gap:8}}>{data?.calls.length ? data.calls.map(item=><button key={item.id} data-call-id={item.id} onClick={()=>{setSelectedCallId(item.id);router.push(hrefFor(`/calls/${item.id}`));}} style={{textAlign:'left',padding:11,borderRadius:9,border:`1px solid ${selectedCall?.id===item.id?'rgba(52,211,153,.5)':'rgba(94,234,212,.14)'}`,background:selectedCall?.id===item.id?'rgba(16,185,129,.1)':'#0b151d',color:semantic.text,cursor:'pointer'}}><div style={{display:'flex',justifyContent:'space-between',gap:8}}><strong>{item.subjectName||item.phoneMasked}</strong><Pill tone={item.priority==='urgent'?'bad':item.status==='completed'?'good':'neutral'}>{item.priority||item.status}</Pill></div><small style={{color:semantic.textMuted}}>{item.direction} · {item.provider} · {item.status}</small></button>) : <Empty icon={<PhoneCall/>} text="No calls yet."/>}</div></div>
          <div>{selectedCall ? <><div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}><h3 style={{margin:0,flex:1}}>{selectedCall.subjectName||selectedCall.phoneMasked}</h3><Pill>{selectedCall.sentiment||'not analyzed'}</Pill><button style={quietButton} disabled={!!busy} onClick={downloadReport}><Download size={14}/>PDF</button></div><p style={{color:semantic.textMuted}}>{selectedCall.summary||'Analysis has not run yet.'}</p><Field label="Saved transcript"><pre style={{...input,minHeight:120,whiteSpace:'pre-wrap',fontFamily:'inherit',margin:0}}>{selectedCall.transcript||'No transcript was retained for this call.'}</pre></Field></> : <><Field label="Simulation transcript"><textarea style={{...input,minHeight:120}} value={transcript} onChange={event=>setTranscript(event.target.value)}/></Field><button data-testid="button-callcommand-place-test-call" style={{...button,marginTop:10}} disabled={!canWriteModule || !!busy||!activeChannel||!activeProfile} onClick={()=>{ if (!activeChannel || !activeProfile) return; void run('simulate',()=>moduleShellApi.callcommand.productSimulate({channelId:activeChannel.id,profileId:activeProfile.id,callerName:'Acceptance caller',callerPhone:'+15555550100',transcript,idempotencyKey:`ui-sim-${Date.now()}`}),'Setup simulation created and processed. No external call was placed.'); }}><PhoneCall size={15}/>Run setup simulation</button></>}</div>
        </div>
      </section>}

      {view === 'automations' && <section id="callcommand-automation" style={{...card,marginBottom:space.xl}}>
        <SectionTitle icon={<Zap/>} title="Rules and action dispatch" subtitle="Ticket, lead, task, webhook, Slack, email, assignment, and priority actions with duplicate protection and a complete action history." />
        <div style={{display:'flex',gap:10,alignItems:'end',flexWrap:'wrap'}}><Field label="Rule name"><input style={{...input,minWidth:280}} value={ruleName} onChange={event=>setRuleName(event.target.value)}/></Field><button style={button} disabled={!canWriteModule || !!busy} onClick={()=>run('rule',()=>moduleShellApi.callcommand.productCreateRule({name:ruleName,priority:10,conditions:{priority:'urgent'},actions:[{actionType:'ticket',title:'Urgent caller response'}]}),'Automation rule created.')}><Plus size={15}/>Create urgent rule</button></div>
        <div style={{display:'grid',gap:8,marginTop:14}}>{data?.rules.map(item=><RecordRow key={item.id} title={item.name} detail={`${item.actionsJson?.length||0} actions · priority ${item.priority}`} status={item.enabled?'enabled':'disabled'}/>)}</div>
      </section>}

      {view === 'actions' && <section id="callcommand-work" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(290px,1fr))',gap:space.md,marginBottom:space.xl}}>
        <WorkList title="Tickets" icon={<TicketCheck/>} items={data?.tickets||[]} type="tickets" onRun={run} canWrite={canWriteModule}/>
        <WorkList title="Leads" icon={<Users/>} items={data?.leads||[]} type="leads" onRun={run} canWrite={canWriteModule}/>
        <WorkList title="Tasks" icon={<CheckCircle2/>} items={data?.tasks||[]} type="tasks" onRun={run} canWrite={canWriteModule}/>
      </section>}

      {['providers', 'settings'].includes(view) && <section id="callcommand-settings" style={{...card}}>
        <SectionTitle icon={<ShieldCheck/>} title="Connections, usage, and access" subtitle="Manage organization access, plan features, service connections, protected credentials, usage, and activity history in OperatorOS." />
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:space.md}}>
          {[{kind:'voice',name:'Twilio',state:telephonyReady?'configured':'disabled'},...(data?.providers.shared||[])].map((provider,index)=><div key={`${provider.kind}-${index}`} style={{padding:12,border:'1px solid rgba(94,234,212,.14)',borderRadius:9}}><strong>{provider.name}</strong><div style={{display:'flex',justifyContent:'space-between',gap:8,marginTop:6}}><span style={{color:semantic.textMuted}}>{provider.kind === 'voice' ? 'Phone service' : 'Connected service'}</span><Pill tone={provider.state==='configured'?'good':provider.state==='test'?'warn':'neutral'}>{provider.state==='configured'?'Ready':provider.state==='test'?'Test mode':'Setup needed'}</Pill></div><details style={{color:semantic.textMuted,fontSize:11,marginTop:7}}><summary>Technical details</summary>{provider.kind} · {provider.state}</details></div>)}
        </div>
        <p style={{color:semantic.textMuted,fontSize:12,marginBottom:0}}>Connection credentials are protected and never shown here.</p>
      </section>}
  </section>;
}

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return <div style={{display:'flex',gap:10,alignItems:'flex-start',marginBottom:14}}><span style={{color:'#2dd4bf'}}>{icon}</span><div><h2 style={{fontSize:19,margin:0}}>{title}</h2><p style={{color:semantic.textMuted,margin:'4px 0 0',fontSize:12}}>{subtitle}</p></div></div>;
}

function RecordRow({ title, detail, status }: { title: string; detail: string; status: string }) {
  return <div style={{display:'flex',gap:10,alignItems:'center',padding:11,border:'1px solid rgba(94,234,212,.14)',borderRadius:9}}><div style={{flex:1}}><strong>{title}</strong><div style={{color:semantic.textMuted,fontSize:12}}>{detail}</div></div><Pill tone={['active','enabled','completed'].includes(status)?'good':'neutral'}>{status}</Pill></div>;
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div style={{padding:18,textAlign:'center',color:semantic.textMuted}}><span style={{display:'block',marginBottom:7}}>{icon}</span>{text}</div>;
}

function WorkList({ title, icon, items, type, onRun, canWrite }: { title: string; icon: React.ReactNode; items: Row[]; type: 'tickets'|'leads'|'tasks'; onRun: (name:string,work:()=>Promise<unknown>,success:string)=>Promise<void>; canWrite: boolean }) {
  return <section style={card}><SectionTitle icon={icon} title={title} subtitle="Follow-up work created from reviewed calls and routing rules." />{items.length===0?<Empty icon={icon} text={`No ${title.toLowerCase()} yet.`}/>:<div style={{display:'grid',gap:8}}>{items.slice(0,8).map(item=><div key={item.id} style={{padding:10,border:'1px solid rgba(94,234,212,.14)',borderRadius:9}}><div style={{display:'flex',gap:8,justifyContent:'space-between'}}><strong>{item.title||item.name||item.company||'Call follow-up'}</strong><Pill>{item.status}</Pill></div>{!['completed','won','lost','canceled'].includes(item.status)&&<button disabled={!canWrite} style={{...quietButton,marginTop:8}} onClick={()=>onRun(`work:${item.id}`,()=>moduleShellApi.callcommand.productUpdateObject(type,item.id,{status:type==='leads'?'contacted':'completed'}),`${title.slice(0,-1)} updated.`)}>Advance</button>}</div>)}</div>}</section>;
}
