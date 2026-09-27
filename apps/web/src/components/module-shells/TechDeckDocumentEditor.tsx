'use client';
import Link from 'next/link';
import { useState } from 'react';
import { moduleShellApi, type TechDeckDocument } from '@/lib/auth';
import styles from './resolution/Resolution.module.css';

/** The existing TechDeck document workflow, shared by manual and evidence drafts. */
export default function TechDeckDocumentEditor({ document, canWrite, canApprove, hrefFor, reload }: { document: TechDeckDocument; canWrite: boolean; canApprove: boolean; hrefFor: (path: string) => string; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState(false), [title, setTitle] = useState(document.title), [content, setContent] = useState(document.content), [note, setNote] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const sources = document.resolutionSources ?? [], stale = sources.some(source => source.sourceRevision !== source.currentRevision);
  const transition = document.status === 'draft' ? 'review' : document.status === 'in_review' ? 'approve' : document.status === 'approved' ? 'publish' : null;
  const allowed = canWrite && (transition === 'review' || canApprove) && !stale;
  async function save() {
    setBusy(true); setError('');
    try { await moduleShellApi.techdeck.updateDocument(document.id, { expectedVersion: document.version, title, content, changeNote: note }); await reload(); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  async function advance() {
    if (!transition || !allowed) return;
    setBusy(true); setError('');
    try { await moduleShellApi.techdeck.transitionDocument(document.id, document.version, transition); await reload(); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  return <section className={styles.workspace} data-testid="techdeck-document-editor" aria-label="Document editor">
    <div className={styles.panel}><h2>{document.title}</h2><p>Version {document.version} · <strong>{document.status.replaceAll('_', ' ')}</strong> · {document.minimumRole} access or higher</p>
      {sources.length > 0 && <p className={styles.caution}>This document also requires access to every linked source. Publication stays inside this tenant; it does not make the document public. Evidence may contain customer details.</p>}
      {sources.map(source => <p key={`${source.incidentId}-${source.sourceRevision}`}><Link href={hrefFor(`/resolution-intelligence/incidents/${source.incidentId}`)}>Source incident · revision {source.sourceRevision}</Link> · linked at document version {source.documentVersion}</p>)}
      {stale && <p role="status" className={styles.caution}>Source changed. This document preserves earlier evidence and cannot advance through review or publication. Prepare a new draft from the current incident.</p>}
      <div className={styles.inline}>{canWrite && document.status === 'draft' && <button disabled={busy} onClick={() => setEditing(value => !value)}>{editing ? 'Cancel editing' : 'Edit draft'}</button>}{transition && allowed && <button className={styles.primary} disabled={busy || editing} onClick={() => void advance()}>{transition === 'review' ? 'Submit for review' : transition === 'approve' ? 'Approve document' : 'Publish document'}</button>}</div>
      {error && <p className={styles.error} role="alert">{error} Reload to check the current document and source state.</p>}
    </div>
    {editing ? <form className={styles.panel} onSubmit={event => { event.preventDefault(); void save(); }}><label>Draft title<input required maxLength={240} value={title} onChange={event => setTitle(event.target.value)} /></label><label>Draft content<textarea required rows={20} maxLength={100000} value={content} onChange={event => setContent(event.target.value)} /></label><label>Revision note<input required maxLength={500} value={note} onChange={event => setNote(event.target.value)} /></label><p>Keep source citations, warnings and unresolved validation clear. Saving creates a new document revision.</p><button className={styles.primary} disabled={busy || !note.trim()}>Save document revision</button></form> : <pre tabIndex={0} className={styles.draftPreview} aria-label="Document content">{document.content}</pre>}
    <details className={styles.section}><summary>Document revision history</summary><div>{document.revisions?.map(revision => <details key={revision.id}><summary>Version {revision.version} · {revision.status.replaceAll('_', ' ')}</summary><p>{revision.changeNote}</p><pre className={styles.draftPreview}>{revision.content}</pre></details>)}</div></details>
  </section>;
}
