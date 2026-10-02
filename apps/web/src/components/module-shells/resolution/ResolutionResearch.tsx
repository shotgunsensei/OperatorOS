'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { ResearchResult, ResearchSource } from '../../../../../../packages/sdk/src/techdeck-research';
import { resolutionRequest, useResolution, type RecordRow } from './resolution-client';
import { LoadState } from './ResolutionShared';
import styles from './Resolution.module.css';

type Preview = { query: string; sources: ResearchSource[]; identifiers: { kind: string; value: string }[]; previewSha256: string; provider: { name: string; state: string }; egressNotice: string; status: RecordRow };
const availability: Record<string,string> = { provider_disabled: 'AI research is off. An administrator must finish provider setup before enabling it.', organization_disabled: 'AI research is off for this organization.', available: 'Reviewed evidence can be sent to the configured provider.' };
export default function ResolutionResearch({ tenantId, canWrite, canManage, hrefFor }: { tenantId: string; canWrite: boolean; canManage: boolean; hrefFor: (path: string) => string }) {
  const status = useResolution(tenantId, '/research');
  const [query,setQuery] = useState(''), [incidentId,setIncidentId] = useState(''), [preview,setPreview] = useState<Preview|null>(null), [result,setResult] = useState<ResearchResult|null>(null);
  const [reviewed,setReviewed] = useState(false), [organizationReviewed,setOrganizationReviewed] = useState(false), [limit,setLimit] = useState('20'), [busy,setBusy] = useState(false), [error,setError] = useState('');
  const inFlight = useRef<AbortController|null>(null);
  function reset() { inFlight.current?.abort(); setBusy(false); setPreview(null); setResult(null); setReviewed(false); setError(''); }
  useEffect(() => { reset(); setQuery(''); setIncidentId(''); setOrganizationReviewed(false); setLimit('20'); return () => inFlight.current?.abort(); }, [tenantId]);
  useEffect(() => { if (status.data) { setLimit(String(status.data.dailyRequestLimit)); setOrganizationReviewed(false); } }, [status.data,tenantId]);
  const sourceHref = (source: ResearchSource) => hrefFor(source.kind==='incident' ? `/resolution-intelligence/incidents/${source.recordId}` : `${source.kind==='runbook'?'/runbooks':'/documentation'}/${source.recordId}`);
  async function request(action: 'preview'|'synthesize') {
    if (busy) return;
    const controller = new AbortController(); inFlight.current = controller; setBusy(true); setError(''); setResult(null);
    if (action==='preview') { setPreview(null); setReviewed(false); }
    try {
      const input = { q: query, ...(incidentId.trim()?{ incidentId: incidentId.trim() }:{}), ...(action==='synthesize'?{ previewSha256: preview?.previewSha256, privacyReviewed: reviewed }: {}) };
      const response = await resolutionRequest<Preview|ResearchResult>(tenantId, `/research/${action}`, { method: 'POST', body: JSON.stringify(input), signal: controller.signal });
      if (!controller.signal.aborted) { if (action==='preview') setPreview(response as Preview); else { setResult(response as ResearchResult); setPreview(null); setReviewed(false); status.reload(); } }
    } catch (failure) { if (!controller.signal.aborted) { setError((failure as Error).message); if (action==='synthesize') { setPreview(null); setReviewed(false); status.reload(); } } }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function save(enabled: boolean) {
    reset(); const controller = new AbortController(); inFlight.current = controller; setBusy(true);
    try { await resolutionRequest(tenantId,'/research',{ method:'PUT',signal:controller.signal,body:JSON.stringify({ enabled,dailyRequestLimit:enabled?Number(limit):status.data?.dailyRequestLimit,expectedVersion:status.data?.version,egressReviewed:organizationReviewed }) }); if (!controller.signal.aborted) { status.reload();setOrganizationReviewed(false); } }
    catch(failure) { if (!controller.signal.aborted) setError((failure as Error).message); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <section className={`${styles.panel} ${styles.research}`} aria-label="Grounded technician research">
    <h2>Research a problem using internal evidence</h2>
    <p>Enter a problem, ticket notes, error, event log, command output, or troubleshooting observations. Research retrieves authorized incidents and linked knowledge before synthesis. Source observations may conflict or remain unvalidated.</p>
    <p>Commands remain plain text for technician review. This assistant does not run them. Results are temporary; refresh or navigation requires a new review.</p>
    <LoadState loading={status.loading} error={status.error} retry={status.reload}/>
    {status.data&&<><p role="status">{availability[status.data.state]??'AI research is unavailable.'}</p><p>Provider: {status.data.provider.name}{status.data.provider.state==='test'?' · Synthetic test adapter; no external acceptance':''}. {status.data.usedToday} of {status.data.dailyRequestLimit} attempts used today. Failed and canceled requests count. This is a request limit, not a fixed dollar budget.</p></>}
    {canManage&&status.data&&<details className={styles.section}><summary>Research availability and organization approval</summary><div>
      <label>Daily research request limit<input type="number" min="1" max="100" value={limit} onChange={event=>setLimit(event.target.value)}/></label>
      <p>Enabling allows technicians to send reviewed normalized evidence to the shared provider. Review your organization's data sharing, retention and spending requirements first. Semantic indexing has separate consent.</p>
      <label className={styles.check}><input type="checkbox" checked={organizationReviewed} onChange={event=>setOrganizationReviewed(event.target.checked)}/> I approve this organization's provider use and request limit for research.</label>
      <div className={styles.inline}><button disabled={busy||!organizationReviewed||status.data.state==='provider_disabled'||!Number.isInteger(Number(limit))||Number(limit)<1||Number(limit)>100} onClick={()=>void save(true)}>Enable or update AI research</button>{status.data.enabled&&<button disabled={busy} onClick={()=>void save(false)}>Disable AI research</button>}</div>
    </div></details>}
    {canWrite ? <form className={styles.panel} onSubmit={event=>{event.preventDefault();void request('preview');}}>
      <label>Problem or diagnostic observations<textarea rows={5} maxLength={6000} value={query} onChange={event=>{reset();setQuery(event.target.value);}} placeholder="Windows 11 laptop has 800 MB free, DISM 0x800f0915, WebView crashing"/></label>
      <small>Remove credentials. Input is sent in the request body and is limited to 6,000 bytes. Preview retrieval uses local exact, text, component and FixGraph search; it makes no provider request.</small>
      <label>Optional incident ID to narrow the evidence<input value={incidentId} maxLength={36} onChange={event=>{reset();setIncidentId(event.target.value);}}/></label>
      <div className={styles.inline}><button className={styles.primary} type="submit" disabled={busy||!query.trim()}>{busy?'Working…':'Retrieve evidence preview'}</button>{busy&&<button type="button" onClick={reset}>Cancel research</button>}</div>
    </form> : <p className={styles.notice}>Research requires internal technician write access. You can continue reviewing saved incident evidence.</p>}
    {error&&<p role="alert" className={styles.error}>{error} Retrieve a new preview to retry.</p>}
    {preview&&<section className={styles.panel} aria-label="Reviewed research preview"><h3>Review the exact evidence before synthesis</h3><p>{preview.egressNotice}</p><p>Query to send:</p><pre className={styles.pre}>{preview.query}</pre><p>Extracted identifiers: {preview.identifiers.map(item=>`${item.kind}: ${item.value}`).join(', ')||'No exact technical identifiers detected.'}</p>
      {!preview.sources.length&&<p className={styles.notice}>No matching authorized evidence. The response will state UNKNOWN and make no provider request.</p>}
      {preview.sources.map(source=><details key={source.id} className={styles.section}><summary>{source.kind}: {source.title} · version {source.version}</summary><div><Link href={sourceHref(source)}>Open source {source.recordId}</Link>{source.facts.map((fact,index)=><div key={index}><small>{fact.section} {fact.pointer}</small><pre className={styles.pre}>{fact.text}</pre></div>)}</div></details>)}
      <label className={styles.check}><input type="checkbox" checked={reviewed} onChange={event=>setReviewed(event.target.checked)}/> I reviewed every excerpt and approve sending this preview to {preview.provider.name} if evidence is available.</label>
      <button className={styles.primary} disabled={busy||!reviewed||Boolean(preview.sources.length)&&preview.status.state!=='available'} onClick={()=>void request('synthesize')}>Synthesize reviewed evidence</button>
    </section>}
    {result&&<section className={styles.panel} aria-label="Grounded research response"><p role="status">{result.state==='insufficient_evidence'?'Insufficient internal evidence. No provider request was made.':'Evidence-grounded draft for technician review. Confirmed labels mean a recorded source observation, not independent validation of cause or applicability.'}</p>
      {result.sections.map(section=><section className={styles.panel} key={section.title}><h3>{section.title}</h3>{section.statements.map((statement,index)=><div key={index} className={styles.card}><strong>{statement.classification}</strong><pre className={styles.pre}>{statement.text}</pre><div className={styles.inline}>{statement.citations.map(id=>{const source=result.sources.find(item=>item.id===id);return source?<Link key={id} href={sourceHref(source)}>Open {source.kind} {source.recordId}</Link>:null;})}</div>{statement.classification==='SUPPORTED INFERENCE'&&statement.evidenceQuotes.length>0&&<details><summary>Supporting recorded excerpts</summary>{statement.evidenceQuotes.map((quote,index)=><pre className={styles.pre} key={index}>{quote.quote}</pre>)}</details>}</div>)}</section>)}
    </section>}
  </section>;
}
