'use client';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { resolutionRequest, type RecordRow } from './resolution-client';
import { LinkPicker } from './ResolutionShared';
import styles from './Resolution.module.css';

export default function ResolutionImport({ tenantId, hrefFor, reprocess }: { tenantId: string; hrefFor: (path: string) => string; reprocess?: { id: string; version: number } }) {
  const [rawText, setRawText] = useState(''), [humanReport, setHumanReport] = useState('');
  const [client, setClient] = useState(''), [site, setSite] = useState(''), [ticket, setTicket] = useState('');
  const [assetIndex, setAssetIndex] = useState(''), [assets, setAssets] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<RecordRow | null>(null), [receipt, setReceipt] = useState<RecordRow | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirmed, setConfirmed] = useState(false);
  const requestKey = useRef<string | null>(null), errorRef = useRef<HTMLDivElement>(null);
  const observations = useMemo(() => { try { const source = JSON.parse(rawText); return Array.isArray(source.affected_assets) ? source.affected_assets.slice(0, 100).map((asset: RecordRow, index: number) => ({ index, name: String(asset?.hostname || asset?.device_name || `Observation ${index + 1}`) })) : []; } catch { return []; } }, [rawText]);
  function changed() { setPreview(null); setReceipt(null); setConfirmed(false); setError(''); requestKey.current = null; }
  const links = { ...(client ? { directoryOrganizationId: client } : {}), ...(site ? { directorySiteId: site } : {}), ...(ticket ? { ticketId: ticket } : {}), assets: Object.entries(assets).filter(([, value]) => value).map(([index, assetId]) => ({ index: Number(index), assetId })) };
  async function submit(importNow: boolean) {
    setBusy(true); setError('');
    try {
      if (!importNow) {
        const result = await resolutionRequest(tenantId, '/exports/validate', { method: 'POST', body: JSON.stringify({ rawText, humanReport: humanReport || null, links }) });
        setPreview(result); setConfirmed(false);
      } else {
        requestKey.current ??= crypto.randomUUID();
        const result = await resolutionRequest(tenantId, reprocess ? `/incidents/${reprocess.id}/reprocess` : '/exports', { method: 'POST', headers: { 'Idempotency-Key': requestKey.current }, body: JSON.stringify({ rawText, humanReport: humanReport || null, links, ...(reprocess ? { expectedVersion: reprocess.version } : {}) }) });
        setReceipt(result); setPreview(null); setRawText(''); setHumanReport('');
      }
    } catch (failure) { setError((failure as Error).message); requestAnimationFrame(() => errorRef.current?.focus()); }
    finally { setBusy(false); }
  }
  return <section className={styles.panel} aria-label={reprocess ? 'Reprocess source' : 'Import closeout pack'}>
    <div><h2>{reprocess ? 'Add a corrected source revision' : 'Bring a closeout pack into TechDeck'}</h2><p>Paste the Machine Evidence Export produced by the <Link href={hrefFor('/settings/ai-integration/ticket-completion-prompt')}>ticket completion prompt</Link>. Redact credentials and review the source before importing. Accepted source is retained unchanged.</p></div>
    {reprocess && <p className={styles.caution}>This creates a new revision and resets review status. Earlier source revisions remain in history. Omitted client and ticket links are retained; device mappings must be supplied for the new revision.</p>}
    {error && <div className={styles.error} role="alert" tabIndex={-1} ref={errorRef}>{error}</div>}
    {receipt && <div className={styles.notice} role="status"><strong>{receipt.status === 'duplicate' ? 'Already imported' : 'Evidence saved'}</strong><p>Revision {receipt.activeRevision}. {receipt.warnings?.length ? `${receipt.warnings.length} source warnings retained for review.` : 'Ready for technician review.'}</p><Link href={hrefFor(`/resolution-intelligence/incidents/${receipt.incidentId}`)}>Open incident evidence →</Link></div>}
    <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 16, minWidth: 0 }}>
      <label>Machine Evidence Export JSON<textarea rows={13} spellCheck={false} value={rawText} onChange={event => { changed(); setRawText(event.target.value); setAssets({}); setAssetIndex(''); }} placeholder="Paste the JSON object, without Markdown fences" /></label>
      <small>Maximum 1 MiB. Secret screening rejects likely credentials; it cannot replace your review. Edit the pasted text to redact sensitive values before validating again.</small>
      <label>Human closeout report (optional)<textarea rows={4} value={humanReport} onChange={event => { changed(); setHumanReport(event.target.value); }} /></label>
      <details className={styles.section}><summary>Link existing client, site, ticket, and devices</summary><div>
        <p>Source labels are preserved as observations. Choose native records explicitly; names are never automatically matched.</p>
        <div className={styles.filters}>
          <LinkPicker tenantId={tenantId} kind="client" value={client} onChange={value => { changed(); setClient(value); setSite(''); }} />
          <LinkPicker tenantId={tenantId} kind="site" clientId={client} value={site} onChange={value => { changed(); setSite(value); }} />
          <LinkPicker tenantId={tenantId} kind="ticket" value={ticket} onChange={value => { changed(); setTicket(value); }} />
        </div>
        {observations.length > 0 && <div className={styles.assetMap}><label>Source device observation<select value={assetIndex} onChange={event => setAssetIndex(event.target.value)}><option value="">Choose observation</option>{observations.map((asset: { index: number; name: string }) => <option key={asset.index} value={asset.index}>{asset.index + 1}. {asset.name}</option>)}</select></label>{assetIndex !== '' && <LinkPicker tenantId={tenantId} kind="asset" value={assets[assetIndex] ?? ''} onChange={value => { changed(); setAssets(previous => ({ ...previous, [assetIndex]: value })); }} />}</div>}
        {Object.values(assets).filter(Boolean).length > 0 && <p>{Object.values(assets).filter(Boolean).length} device mappings selected.</p>}
      </div></details>
      <div><button className={styles.primary} type="button" disabled={!rawText.trim()} onClick={() => void submit(false)}>{busy ? 'Checking…' : 'Validate and preview'}</button></div>
    </fieldset>
    {preview && <div className={styles.panel} aria-label="Validated import preview">
      <h3>Validated preview</h3><p>Review the source above and the records below. Validation has not saved an incident.</p>
      <div className={styles.tags}>{Object.entries(preview.counts).filter(([, count]) => Number(count) > 0).map(([name, count]) => <span key={name}>{String(count)} {name.replaceAll('_', ' ')}</span>)}</div>
      {preview.warnings.length > 0 && <div className={styles.caution}><strong>Partial observations need review</strong><ul>{preview.warnings.slice(0, 12).map((warning: RecordRow, index: number) => <li key={index}>{warning.path}: {warning.expected}</li>)}</ul>{preview.warnings.length > 12 && <p>{preview.warnings.length - 12} more warnings will remain in source history.</p>}</div>}
      <label className={styles.check}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I reviewed the source, redacted credentials, and confirmed the native record links.</label>
      <div><button className={styles.primary} disabled={!confirmed || busy} onClick={() => void submit(true)}>{busy ? 'Saving…' : reprocess ? 'Confirm new revision' : 'Confirm import'}</button></div>
    </div>}
  </section>;
}
