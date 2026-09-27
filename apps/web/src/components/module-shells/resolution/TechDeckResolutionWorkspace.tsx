'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { TechDeckRouteState } from '../TechDeckRoute.contract';
import { resolutionRequest, useResolution, type Page } from './resolution-client';
import { IncidentCards, LinkPicker, LoadState } from './ResolutionShared';
import ResolutionDetail from './ResolutionDetail';
import ResolutionImport from './ResolutionImport';
import ResolutionPrompt from './ResolutionPrompt';
import styles from './Resolution.module.css';

function SearchWorkspace({ tenantId, canWrite, hrefFor }: { tenantId: string; canWrite: boolean; hrefFor: (path: string) => string }) {
  const params = useSearchParams();
  const [client, setClient] = useState(params.get('clientId') ?? ''), [asset, setAsset] = useState(params.get('assetId') ?? ''), [review, setReview] = useState('');
  const [query, setQuery] = useState(''), [result, setResult] = useState<Page | null>(null), [cursor, setCursor] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const inFlight = useRef<AbortController | null>(null);
  useEffect(() => () => inFlight.current?.abort(), []);
  const filterQuery = new URLSearchParams({ ...(client ? { clientId: client } : {}), ...(asset ? { assetId: asset } : {}), ...(review ? { review } : {}) }).toString();
  const recent = useResolution<Page>(tenantId, `/incidents?${filterQuery}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`), summary = useResolution(tenantId, `/summary?${filterQuery}`);
  function invalidate() { inFlight.current?.abort(); setBusy(false); setResult(null); setCursor(null); setError(''); }
  async function search(nextCursor?: string | null) {
    inFlight.current?.abort(); const controller = new AbortController(); inFlight.current = controller; setBusy(true); setError('');
    const input = { q: query, ...(client ? { clientId: client } : {}), ...(asset ? { assetId: asset } : {}), ...(review ? { review } : {}), ...(nextCursor ? { cursor: nextCursor } : {}) };
    try { const response = await resolutionRequest<Page>(tenantId, canWrite ? '/search' : `/search?${new URLSearchParams(input)}`, { method: canWrite ? 'POST' : 'GET', ...(canWrite ? { body: JSON.stringify(input) } : {}), signal: controller.signal }); if (!controller.signal.aborted) setResult(response); }
    catch (failure) { if (!controller.signal.aborted) setError((failure as Error).message); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <>
    <LoadState loading={summary.loading} error={summary.error} retry={summary.reload} />
    {summary.data && <div className={styles.stats}><div className={styles.stat}><strong>{summary.data.incidents}</strong><span>Saved incidents</span></div><div className={styles.stat}><strong>{summary.data.unreviewed}</strong><span>Awaiting review</span></div><div className={styles.stat}><strong>{summary.data.needs_validation}</strong><span>Validation or follow-up needed</span></div></div>}
    <section className={styles.panel}><h2>Find the evidence behind a resolution</h2>
      <form onSubmit={event => { event.preventDefault(); void search(); }} className={styles.panel}>
        <label>{canWrite ? 'Error, service, path, or diagnostic text' : 'Short search phrase or identifier'}<textarea rows={canWrite ? 4 : 2} maxLength={canWrite ? 100000 : 200} value={query} onChange={event => { invalidate(); setQuery(event.target.value); }} placeholder="0x800f0915, service: camsvc, or a symptom description" /></label>
        <small>{canWrite ? 'Diagnostic text is sent in the request body. Remove credentials before searching.' : 'Read-only search is limited to 200 characters. Use a short identifier; do not paste diagnostic logs.'} Exact identifiers rank first. Bare numbers are not assumed to be Event IDs.</small>
        <div className={styles.inline}><button className={styles.primary} type="submit" disabled={busy || !query.trim()}>{busy ? 'Searching…' : 'Search evidence'}</button>{result && <button type="button" onClick={() => { invalidate(); setQuery(''); }}>Return to recent incidents</button>}</div>
      </form>
      <details className={styles.section}><summary>Client, device, and review filters</summary><div><div className={styles.filters}><LinkPicker tenantId={tenantId} kind="client" value={client} onChange={value => { invalidate(); setClient(value); }} /><LinkPicker tenantId={tenantId} kind="asset" value={asset} onChange={value => { invalidate(); setAsset(value); }} /><label>Review<select value={review} onChange={event => { invalidate(); setReview(event.target.value); }}><option value="">All review states</option><option value="reviewed">Reviewed</option><option value="unreviewed">Unreviewed</option></select></label></div>{(client || asset || review) && <button onClick={() => { invalidate(); setClient(''); setAsset(''); setReview(''); }}>Clear filters</button>}</div></details>
      {(client || asset) && <p className={styles.notice}>Showing {client ? 'client' : ''}{client && asset ? ' and ' : ''}{asset ? 'device' : ''} incident history. Filters use explicit native record links.</p>}
    </section>
    {error && <div role="alert" className={styles.error}>{error}<button onClick={() => void search()}>Retry search</button></div>}
    <section aria-label={result ? 'Search results' : 'Recent incidents'}><h2>{result ? 'Matching incident evidence' : 'Recent incidents'}</h2><p className={styles.muted}>Exact identifiers and full-text evidence · AI research and semantic search are not enabled. Review failures, warnings, and remaining validation before reusing a resolution.</p>
      {!result && <LoadState loading={recent.loading} error={recent.error} retry={recent.reload} />}
      {result?.fullTextTruncated && <p className={styles.notice}>Full-text ranking uses the first 8,000 characters. Exact matching checks up to 100 distinct identifiers across the submitted text.</p>}
      {result ? <IncidentCards items={result.items} hrefFor={hrefFor} /> : recent.data && <IncidentCards items={recent.data.items} hrefFor={hrefFor} />}
      <div className={styles.inline}>{result?.nextCursor ? <button disabled={busy} onClick={() => void search(result.nextCursor)}>Next matches</button> : !result && recent.data?.nextCursor ? <button onClick={() => setCursor(recent.data!.nextCursor!)}>Older incidents</button> : null}{!result && cursor && <button onClick={() => setCursor(null)}>Newest incidents</button>}</div>
    </section>
  </>;
}
export default function TechDeckResolutionWorkspace({ tenantId, route, hrefFor }: { tenantId: string; route: TechDeckRouteState; hrefFor: (path: string) => string }) {
  const access = useResolution<{ canWrite: boolean; canManage: boolean; canDownloadRaw: boolean; canSetOwnerVisibility: boolean }>(tenantId, '/capabilities');
  const view = route.resolutionView ?? 'home';
  return <div className={styles.workspace} id="techdeck-resolution" data-testid="techdeck-resolution-workspace">
    <nav className={styles.toolbar} aria-label="Resolution workspace"><Link href={hrefFor('/resolution-intelligence')} aria-current={view === 'home' ? 'page' : undefined}>Recent incidents</Link><Link href={hrefFor('/resolution-intelligence/search')} aria-current={view === 'search' ? 'page' : undefined}>Search</Link>{access.data?.canWrite && <Link href={hrefFor('/resolution-intelligence/import')} aria-current={view === 'import' ? 'page' : undefined}>Import closeout pack</Link>}<Link href={hrefFor('/settings/ai-integration/ticket-completion-prompt')} aria-current={view === 'prompt' ? 'page' : undefined}>Prompt and templates</Link></nav>
    <LoadState loading={access.loading} error={access.error} retry={access.reload} />
    {access.data && <>{!access.data.canWrite && <p className={styles.notice}>Read-only access: review saved evidence and search short identifiers. Importing and editing require technician write access.</p>}
      {view === 'prompt' ? <ResolutionPrompt tenantId={tenantId} /> : view === 'import' ? access.data.canWrite ? <ResolutionImport tenantId={tenantId} hrefFor={hrefFor} /> : <p role="alert" className={styles.error}>Your current access does not allow evidence imports.</p> : route.recordId ? <ResolutionDetail tenantId={tenantId} id={route.recordId} history={view === 'history'} canWrite={access.data.canWrite} canManage={access.data.canManage} canDownloadRaw={access.data.canDownloadRaw} canSetOwnerVisibility={access.data.canSetOwnerVisibility} hrefFor={hrefFor} /> : <SearchWorkspace tenantId={tenantId} canWrite={access.data.canWrite} hrefFor={hrefFor} />}
    </>}
  </div>;
}
