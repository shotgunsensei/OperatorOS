'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useResolution, type Page, type RecordRow, label, display } from './resolution-client';
import styles from './Resolution.module.css';

export function LoadState({ loading, error, retry }: { loading: boolean; error: string | null; retry: () => void }) {
  return loading ? <p role="status" aria-busy="true">Loading saved evidence…</p> : error ? <div className={styles.error} role="alert"><p>{error}</p><button type="button" onClick={retry}>Retry</button></div> : null;
}
export function Status({ row }: { row: RecordRow }) {
  return <div className={styles.tags}><span>{display(row.validation_status)}</span><span>{label(row.review_status ?? 'unreviewed')}</span>{row.root_cause_confidence && <span>Source confidence: {row.root_cause_confidence}</span>}</div>;
}
export function IncidentCards({ items, hrefFor }: { items: RecordRow[]; hrefFor: (path: string) => string }) {
  if (!items.length) return <div className={styles.empty}><h3>No saved incidents match</h3><p>Try another identifier, remove filters, or import a completed closeout pack.</p></div>;
  return <div className={styles.cards}>{items.map(row => <article className={styles.card} key={row.id}>
    <Status row={row} /><h3><Link href={hrefFor(`/resolution-intelligence/incidents/${row.id}`)}>{row.title ?? 'Untitled incident'}</Link></h3>
    <p>{row.one_line_resolution || row.issue_summary || 'Open the incident to review its source evidence.'}</p>
    {row.exact_score !== undefined && <p className={styles.muted}>{row.exact_score > 0 ? `${row.exact_score} exact identifier match${row.exact_score === 1 ? '' : 'es'}` : 'Full-text evidence match'}{row.text_score > 0 ? ` · Text score ${Number(row.text_score).toFixed(3)}` : ''}</p>}
    {row.match_reasons?.length > 0 && <ul className={styles.reasons}>{row.match_reasons.slice(0, 6).map((reason: RecordRow, index: number) => <li key={index}>{label(reason.kind)}: <code>{reason.value}</code></li>)}</ul>}
    {(row.warning_count > 0 || row.failed_action_count > 0) && <p className={styles.caution}>{row.warning_count ?? 0} warnings · {row.failed_action_count ?? 0} failed attempts — review before reuse</p>}
    <Link href={hrefFor(`/resolution-intelligence/incidents/${row.id}`)}>Review evidence →</Link>
  </article>)}</div>;
}
export function LinkPicker({ tenantId, kind, value, onChange, clientId, caption }: { tenantId: string; kind: 'client' | 'site' | 'asset' | 'ticket'; value: string; onChange: (value: string) => void; clientId?: string; caption?: string }) {
  const [query, setQuery] = useState(''); const [search, setSearch] = useState('');
  const source = useResolution<Page>(tenantId, kind === 'site' && !clientId ? null : `/link-options?kind=${kind}&q=${encodeURIComponent(search)}${clientId ? `&clientId=${encodeURIComponent(clientId)}` : ''}`);
  return <div className={styles.picker}>
    <label>{caption ?? label(kind)}<select value={value} onChange={event => onChange(event.target.value)} disabled={source.loading || kind === 'site' && !clientId}><option value="">No {kind} link</option>{value && !source.data?.items.some(item => item.id === value) && <option value={value}>Selected {kind}: {value}</option>}{source.data?.items.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    <div className={styles.inline}><input aria-label={`Find ${kind}`} disabled={kind === 'site' && !clientId} placeholder={`Find ${kind} by name`} value={query} maxLength={100} onChange={event => setQuery(event.target.value)} /><button type="button" disabled={kind === 'site' && !clientId} onClick={() => setSearch(query)}>Find</button></div>
    <LoadState loading={false} error={source.error} retry={source.reload} /><small>{kind === 'site' && !clientId ? 'Choose a client before finding a site.' : 'Up to 30 matching records in this organization.'}</small>
  </div>;
}
export function Fields({ row, omit = [] }: { row: RecordRow; omit?: string[] }) {
  const hidden = new Set(['id', 'incident_id', 'revision', 'source_pointer', 'created_at', ...omit]);
  return <dl className={styles.fields}>{Object.entries(row).filter(([key, value]) => !hidden.has(key) && value !== null && value !== '' && (!Array.isArray(value) || value.length > 0)).map(([key, value]) => <div key={key}><dt>{label(key)}</dt><dd>{display(value)}</dd></div>)}</dl>;
}
