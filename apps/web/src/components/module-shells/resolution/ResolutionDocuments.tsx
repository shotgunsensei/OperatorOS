'use client';
import Link from 'next/link';
import { useState } from 'react';
import { resolutionRequest, useResolution, type RecordRow, type Page } from './resolution-client';
import { LoadState } from './ResolutionShared';
import styles from './Resolution.module.css';

type Preview = { kind: string; title: string; content: string; minimumRole: string; sourceRevision: number; sourceVersion: number; previewSha256: string; abbreviated: boolean };
export default function ResolutionDocuments({ tenantId, hrefFor, incident, canWrite = false }: { tenantId: string; hrefFor: (path: string) => string; incident?: RecordRow; canWrite?: boolean }) {
  const [kind, setKind] = useState('knowledge_base'), [preview, setPreview] = useState<Preview | null>(null), [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState<{ documentId: string; existing?: boolean } | null>(null), [key, setKey] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [showExisting, setShowExisting] = useState(false), [selected, setSelected] = useState('');
  const candidates = useResolution<Page>(tenantId, showExisting && incident && canWrite ? '/documents?limit=100' : null);
  const documents = useResolution<Page>(tenantId, `/documents?${new URLSearchParams({ ...(incident ? { incidentId: incident.id } : {}), ...(cursor ? { cursor } : {}) })}`);
  async function prepare() {
    if (!incident || busy) return;
    setBusy(true); setError(''); setPreview(null); setReviewed(false); setSaved(null);
    try { const result = await resolutionRequest<Preview>(tenantId, `/incidents/${incident.id}/document-drafts/preview`, { method: 'POST', body: JSON.stringify({ kind, expectedVersion: incident.version }) }); setPreview(result); setKey(crypto.randomUUID()); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!incident || !preview || !reviewed || busy) return;
    setBusy(true); setError('');
    try { setSaved(await resolutionRequest(tenantId, `/incidents/${incident.id}/document-drafts`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ kind: preview.kind, expectedVersion: preview.sourceVersion, previewSha256: preview.previewSha256, privacyReviewed: true }) })); setPreview(null); setReviewed(false); documents.reload(); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  async function linkExisting() {
    const document = candidates.data?.items.find(row => row.id === selected);
    if (!incident || !document || busy) return;
    setBusy(true); setError('');
    try { setSaved(await resolutionRequest(tenantId, `/incidents/${incident.id}/document-links`, { method: 'POST', body: JSON.stringify({ documentId: selected, expectedVersion: incident.version, expectedDocumentVersion: document.version }) })); setSelected(''); candidates.reload(); documents.reload(); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  return <section className={styles.panel} aria-label="Evidence-derived documents">
    <h2>{incident ? 'Turn evidence into a reviewed document' : 'Evidence-derived knowledge'}</h2>
    <p>Build a KB or runbook draft from recorded observations. Warnings, failed attempts, missing information and source citations stay with the draft. Review, approval and publication use TechDeck’s document workflow.</p>
    {incident && canWrite && <>
      <label>Draft type<select value={kind} disabled={busy} onChange={event => { setKind(event.target.value); setPreview(null); setReviewed(false); setSaved(null); }}><option value="knowledge_base">Knowledge base</option><option value="runbook">Runbook</option></select></label>
      <div><button className={styles.primary} disabled={busy} onClick={() => void prepare()}>{busy ? 'Preparing…' : 'Preview evidence draft'}</button></div>
      {preview && <section className={styles.panel} aria-label="Draft privacy preview"><h3>{preview.title}</h3>
        <p className={styles.caution}>Internal use only · {preview.minimumRole} access or higher, plus access to the source incident. Customer names and paths may remain. This is not a de-identified or approved procedure. Preview has not saved a document.</p>
        {preview.abbreviated && <p className={styles.caution}>Some evidence exceeds the preview limits. Review the complete incident before approval.</p>}
        <pre className={styles.draftPreview} tabIndex={0} aria-label="Draft content preview">{preview.content}</pre>
        <label className={styles.check}><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I reviewed the draft, source warnings and customer details for this internal audience.</label>
        <button className={styles.primary} disabled={busy || !reviewed} onClick={() => void save()}>Save linked draft</button>
      </section>}
      <details className={styles.section} onToggle={event => setShowExisting(event.currentTarget.open)}><summary>Link this incident to an existing draft</summary><div>
        <p>Add an attributed source reference to a draft without replacing its edited content. The draft must already have an audience at least as restrictive as this incident. All linked sources must remain accessible.</p>
        <LoadState loading={candidates.loading} error={candidates.error} retry={candidates.reload} />
        <label>Existing evidence draft<select value={selected} disabled={busy} onChange={event => setSelected(event.target.value)}><option value="">Choose a draft</option>{candidates.data?.items.filter(row => row.status === 'draft' && !row.sources?.some((source: RecordRow) => source.incidentId === incident.id)).map(row => <option key={row.id} value={row.id}>{row.title} · {row.minimum_role}</option>)}</select></label>
        {candidates.data?.nextCursor && <p>Showing the first 100 accessible documents. Open Linked knowledge for the complete paginated list.</p>}
        <button disabled={busy || !selected} onClick={() => void linkExisting()}>Link source to draft</button>
      </div></details>
    </>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {saved && <p className={styles.notice} role="status">{saved.existing ? 'This source is already linked. Existing document edits were preserved.' : 'Draft saved. It still requires review and approval.'} <Link href={hrefFor(`/documentation/${saved.documentId}`)}>Open document editor →</Link></p>}
    <LoadState loading={documents.loading} error={documents.error} retry={documents.reload} />
    {documents.data?.items.length === 0 && <p className={styles.muted}>No linked documents are available for your current access. Create one from an incident’s evidence.</p>}
    <div className={styles.cards}>{documents.data?.items.map(document => <article key={document.id} className={styles.card}>
      <h3><Link href={hrefFor(`/${document.page_type === 'runbook' ? 'runbooks' : 'documentation'}/${document.id}`)}>{document.title}</Link></h3>
      <p>{document.page_type === 'runbook' ? 'Runbook' : 'Knowledge base'} · {document.status.replaceAll('_', ' ')} · Document version {document.version}</p>
      {!document.source_current && <p className={styles.caution}>Source changed. This document retains its earlier evidence and cannot advance through approval. Open the current incident to prepare a new draft.</p>}
      {(document.sources ?? []).map((source: RecordRow) => <p key={`${source.incidentId}-${source.sourceRevision}`}><Link href={hrefFor(`/resolution-intelligence/incidents/${source.incidentId}`)}>Source incident · revision {source.sourceRevision}</Link>{source.sourceRevision !== source.currentRevision ? ` (current: ${source.currentRevision})` : ''}</p>)}
    </article>)}</div>
    <div className={styles.inline}>{cursor && <button onClick={() => setCursor(null)}>First documents</button>}{documents.data?.nextCursor && <button onClick={() => setCursor(documents.data!.nextCursor!)}>More documents</button>}</div>
  </section>;
}
