'use client';
import { useState } from 'react';
import { useResolution, resolutionRequest, type RecordRow } from './resolution-client';
import { LoadState } from './ResolutionShared';
import styles from './Resolution.module.css';

export const semanticMessages:Record<string,string> = {
  not_requested:'Semantic matching was not requested.',
  provider_disabled:'Semantic search is off. An administrator must finish provider setup before enabling it.',
  vector_unavailable:'Semantic search is unavailable on this database. Exact and text search remain available.',
  organization_disabled:'Semantic search is off for this organization.',
  not_indexed:'No current, reviewed semantic index matches your access and filters.',
  narrow_filters:'Narrow the client or device filters to use semantic matching with this collection.',
  query_too_long:'This search is too long for semantic matching. Try a shorter symptom description.',
  daily_limit:'The organization’s daily semantic request limit has been reached.',
  provider_unavailable:'The semantic provider is unavailable. Exact and text results are shown.',
  available:'Semantic matching is available for reviewed incidents. Exact identifiers rank first.',
};
export function SemanticSettings({ tenantId,canManage,onChange }: { tenantId:string;canManage:boolean;onChange?:()=>void }) {
  const state=useResolution(tenantId,'/semantic');
  const [limit,setLimit]=useState('100'),[reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function save(enabled:boolean) {
    setBusy(true);setError('');
    try { await resolutionRequest(tenantId,'/semantic',{ method:'PUT',body:JSON.stringify({ enabled,dailyRequestLimit:Number(limit),expectedVersion:state.data?.version,egressReviewed:reviewed }) });state.reload();onChange?.();setReviewed(false); }
    catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <details className={styles.section}><summary>Semantic search availability</summary><div>
    <LoadState loading={state.loading} error={state.error} retry={state.reload}/>
    {state.data && <><p>{semanticMessages[state.data.state]??'Semantic search is unavailable.'}</p><p>Saved daily limit: {state.data.dailyRequestLimit} requests. Indexing chunks, searches, and failed attempts each count. This is a usage limit, not a fixed dollar budget.</p>
      {state.data.provider && <p>Provider: {state.data.provider.provider} · Model: {state.data.provider.model}{state.data.provider.state==='test'?' · Test adapter; no external acceptance':''}</p>}
      {canManage && <><label>Daily request limit<input type="number" min="1" max="1000" value={limit} onChange={e=>setLimit(e.target.value)}/></label>
        <p>Enabling permits reviewed incident excerpts and explicitly selected search text to be sent to the configured provider. Masking can miss private details. Review your organization’s data-sharing, retention and spending requirements first. Changing settings requires incident indexes to be reviewed again.</p>
        <label className={styles.check}><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/> I approve this organization’s provider use and request limit.</label>
        <div className={styles.inline}><button disabled={busy||!reviewed||!state.data.provider||state.data.state==='vector_unavailable'||!Number.isInteger(Number(limit))||Number(limit)<1||Number(limit)>1000} onClick={()=>void save(true)}>{busy?'Saving…':'Enable or update semantic search'}</button>{state.data.enabled&&<button disabled={busy} onClick={()=>void save(false)}>Disable semantic search</button>}</div>
      </>}
    </>}{error&&<p role="alert" className={styles.error}>{error}</p>}
  </div></details>;
}
export default function ResolutionSemantic({ tenantId,incident,canManage }: { tenantId:string;incident:RecordRow;canManage:boolean }) {
  const state=useResolution(tenantId,`/incidents/${incident.id}/semantic`), availability=useResolution(tenantId,'/semantic');
  const [preview,setPreview]=useState<RecordRow|null>(null),[reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  async function action(queue:boolean) {
    setBusy(true);setError('');setMessage('');
    try {
      const result=await resolutionRequest(tenantId,`/incidents/${incident.id}/semantic/${queue?'index':'preview'}`,{ method:'POST',body:JSON.stringify({ expectedVersion:incident.version,...(queue?{ previewSha256:preview?.previewSha256,privacyReviewed:reviewed }:{}) }) });
      if(queue) { setMessage(`${result.queued} excerpts queued for indexing. Refresh status to check progress. Failed attempts retry up to three times; re-review after the cause is corrected.`);setPreview(null);state.reload(); }
      else { setPreview(result);setReviewed(false); }
    } catch(e) { setError((e as Error).message);setPreview(null); } finally { setBusy(false); }
  }
  return <details className={styles.section}><summary>Semantic index for this incident</summary><div>
    <p>{semanticMessages[availability.data?.state??'provider_disabled']}</p>
    <LoadState loading={state.loading} error={state.error} retry={state.reload}/>
    {state.data&&<p>{state.data.items?.length?state.data.items.map((item:RecordRow)=>`${item.count} ${item.status}${item.last_error_code?` (${item.last_error_code})`:''}`).join(' · '):'No current index is recorded.'}</p>}
    <div className={styles.inline}><button onClick={state.reload}>Refresh index status</button>{canManage&&<button disabled={busy||availability.data?.state!=='available'} onClick={()=>void action(false)}>{busy?'Preparing…':'Review excerpts for semantic indexing'}</button>}</div>
    {preview&&<><p>{preview.requestCount} excerpts will be sent to {preview.provider.provider} ({preview.provider.model}). Review every excerpt. Names and other private details may remain; correct the source and reprocess it if needed. This preview does not send data.</p>
      {preview.chunks.map((part:RecordRow,index:number)=><details key={index}><summary>Excerpt {index+1} · {part.sourcePointer||'Incident'}</summary><pre className={styles.draftPreview}>{part.text}</pre></details>)}
      <label className={styles.check}><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/> I reviewed these exact excerpts and approve sending them to this provider.</label>
      <button disabled={busy||!reviewed} onClick={()=>void action(true)}>Queue reviewed excerpts</button>
    </>}{message&&<p role="status">{message}</p>}{error&&<p role="alert" className={styles.error}>{error}</p>}
  </div></details>;
}
