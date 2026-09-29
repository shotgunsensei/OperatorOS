'use client';
import Link from 'next/link';
import { useState } from 'react';
import { display, label, resolutionRequest, resolutionBase, saveText, useResolution, type RecordRow, type Page } from './resolution-client';
import { Fields, IncidentCards, LinkPicker, LoadState, Status } from './ResolutionShared';
import ResolutionImport from './ResolutionImport';
import ResolutionDocuments from './ResolutionDocuments';
import ResolutionSemantic from './ResolutionSemantic';
import styles from './Resolution.module.css';

const names: Record<string, string> = { actions: 'Timeline and attempts', side_effects: 'Side effects and recovery', validations: 'Validation evidence', commands: 'Commands and scripts', evidence_links: 'Evidence and measurements', incident_assets: 'Affected devices', root_causes: 'Root cause claims', followups: 'Follow-up work', quality_notes: 'Missing or conflicting information' };
function EvidenceSection({ tenantId, id, name, count, revision, open = false }: { tenantId: string; id: string; name: string; count: number; revision: number; open?: boolean }) {
  const [expanded, setExpanded] = useState(open), [cursor, setCursor] = useState<string | null>(null), [copied, setCopied] = useState('');
  const source = useResolution<Page>(tenantId, expanded ? `/incidents/${id}/sections/${name}?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}` : null);
  async function copy(text: string) { try { await navigator.clipboard.writeText(text); setCopied('Command copied as text. Review risk, elevation, warnings, and actual results before using it.'); } catch { setCopied('Clipboard unavailable. Select the command text to copy it.'); } }
  return <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)} className={styles.section} id={`resolution-${name}`}>
    <summary>{names[name] ?? label(name)} <span className={styles.muted}>({count})</span></summary><div>
      {name === 'commands' && <p className={styles.caution}>Source commands are evidence, not approved procedures. Check the <a href="#resolution-warnings">warnings</a> and side effects first. Copying does not execute or approve a command.</p>}
      <LoadState loading={source.loading} error={source.error} retry={source.reload} />
      {source.data && <div className={styles.records}>{source.data.items.map(row => <article className={styles.record} key={row.id}>
        {name === 'commands' ? <><div className={styles.tags}><span>{row.language || 'Language not recorded'}</span><span>Elevation: {display(row.requires_elevation)}</span><span>Risk: {row.reviewed_risk_level || row.risk_level || 'Not assessed'}</span><span>Destructive: {display(row.destructive)}</span></div><pre className={styles.command}>{row.command_text}</pre><button onClick={() => void copy(row.command_text)}>Copy command as text</button><Fields row={row} omit={['command_text']} /></> : <Fields row={row} />}
        {row.kind === 'successful' && <p className={styles.caution}>Reported success is a source assertion. Check remaining validation before treating this as a repeatable fix.</p>}
        <a className={styles.source} href={`#resolution-${name}`}>Source revision {row.revision ?? revision} · {row.source_pointer}</a>
      </article>)}</div>}
      <p role="status">{copied}</p>
      <div className={styles.inline}>{cursor && <button onClick={() => setCursor(null)}>First page</button>}{source.data?.nextCursor && <button onClick={() => setCursor(source.data!.nextCursor!)}>Next 20 records</button>}</div>
    </div>
  </details>;
}
function ReviewEditor({ tenantId, row, canManage, canSetOwnerVisibility, onArchived, reload }: { tenantId: string; row: RecordRow; canManage: boolean; canSetOwnerVisibility: boolean; onArchived: () => void; reload: () => void }) {
  const [review, setReview] = useState(row.review_status), [minimum, setMinimum] = useState(row.minimum_role);
  const [client, setClient] = useState(row.directory_organization_id ?? ''), [site, setSite] = useState(row.directory_site_id ?? ''), [ticket, setTicket] = useState(row.ticket_id ?? '');
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function save(archive: boolean) {
    setBusy(true); setMessage('');
    try { await resolutionRequest(tenantId, `/incidents/${row.id}${archive ? '/archive' : ''}`, { method: archive ? 'POST' : 'PATCH', body: JSON.stringify(archive ? { expectedVersion: row.version } : { expectedVersion: row.version, reviewStatus: review, ...(canManage ? { minimumRole: minimum } : {}), links: { ...(client ? { directoryOrganizationId: client } : {}), ...(site ? { directorySiteId: site } : {}), ...(ticket ? { ticketId: ticket } : {}) } }) }); if (archive) onArchived(); else reload(); }
    catch (failure) { setMessage((failure as Error).message); } finally { setBusy(false); }
  }
  return <details className={styles.section}><summary>Review and correct native links</summary><div><p>Review status records human review; it does not certify source claims or complete pending validation. Device observations and accepted source require a new source revision.</p><fieldset disabled={busy} className={styles.panel}>
    <div className={styles.filters}><label>Review status<select value={review} onChange={event => setReview(event.target.value)}><option value="unreviewed">Unreviewed</option><option value="reviewed">Reviewed</option></select></label>{canManage && <label>Minimum role<select value={minimum} onChange={event => setMinimum(event.target.value)}><option value="member">Technicians and readers</option><option value="admin">Administrators</option>{canSetOwnerVisibility && <option value="owner">Owners</option>}</select></label>}</div>
    <div className={styles.filters}><LinkPicker tenantId={tenantId} kind="client" value={client} onChange={value => { setClient(value); setSite(''); }} /><LinkPicker tenantId={tenantId} kind="site" value={site} clientId={client} onChange={setSite} /><LinkPicker tenantId={tenantId} kind="ticket" value={ticket} onChange={setTicket} /></div>
    <button onClick={() => void save(false)}>Save reviewed metadata</button>
    {canManage && <><label className={styles.check}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Archive this incident and remove it from active retrieval.</label><button disabled={!confirmed} onClick={() => void save(true)}>Archive incident</button></>}
  </fieldset>{message && <p className={styles.error} role="alert">{message}</p>}</div></details>;
}
export default function ResolutionDetail({ tenantId, id, history, canWrite, canManage, canDownloadRaw, canSetOwnerVisibility, hrefFor }: { tenantId: string; id: string; history: boolean; canWrite: boolean; canManage: boolean; canDownloadRaw: boolean; canSetOwnerVisibility: boolean; hrefFor: (path: string) => string }) {
  const detail = useResolution(tenantId, `/incidents/${id}`), related = useResolution<Page>(tenantId, history ? null : `/incidents/${id}/related`);
  const [archived, setArchived] = useState(false);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null), [message, setMessage] = useState('');
  const revisions = useResolution<Page>(tenantId, history ? `/incidents/${id}/history${historyCursor ? `?cursor=${encodeURIComponent(historyCursor)}` : ''}` : null);
  async function download(revision: number) {
    try { const response = await fetch(`${resolutionBase}/incidents/${id}/raw/${revision}`, { credentials: 'include', cache: 'no-store', headers: { 'X-Tenant-Id': tenantId } }); if (!response.ok) throw new Error('The source download is unavailable for your current access.'); saveText(await response.text(), `resolution-${id}-revision-${revision}.json`, 'application/json'); setMessage('Source downloaded. The access was recorded in the activity history.'); } catch (failure) { setMessage((failure as Error).message); }
  }
  const row = detail.data;
  if (archived) return <div className={styles.notice} role="status"><p>Incident archived. It is now excluded from active retrieval.</p><Link href={hrefFor('/resolution-intelligence')}>Return to recent incidents</Link></div>;
  return <><LoadState loading={detail.loading} error={detail.error} retry={detail.reload} />{row && <>
    <section className={styles.panel}><Status row={row} /><h2>{row.title ?? 'Untitled incident'}</h2><p>{row.issue_summary ?? 'Issue summary not recorded.'}</p>
      <div className={styles.fields}><div><strong>Current validation</strong><p>{display(row.validation_status)}</p></div><div><strong>Functionality</strong><p>{display(row.user_functionality)}</p></div><div><strong>Monitoring required</strong><p>{display(row.monitoring_required)}</p></div><div><strong>Follow-up required</strong><p>{display(row.follow_up_required)}</p></div></div>
      <p className={styles.caution}>Source confidence: {display(row.root_cause_confidence)} · Data quality: {display(row.data_quality_confidence)}. Pending validation and recorded failures remain relevant even when a source reports success.</p>
      <div className={styles.inline}><Link href={hrefFor(`/resolution-intelligence/incidents/${id}${history ? '' : '/history'}`)}>{history ? 'Return to incident' : `Source history · active revision ${row.active_revision}`}</Link>{row.directory_organization_id && <Link href={hrefFor(`/resolution-intelligence?clientId=${row.directory_organization_id}`)}>Client incident history</Link>}</div>
    </section>
    {history ? <><LoadState loading={revisions.loading} error={revisions.error} retry={revisions.reload} /><p role="status">{message}</p>{revisions.data?.items.map(revision => <article className={styles.panel} key={revision.revision}><h3>Revision {revision.revision}{revision.revision === row.active_revision ? ' · Active' : ''}</h3><p>Imported {new Date(revision.created_at).toLocaleString()} · Schema {revision.schema_version}</p><small>{revision.normalizer_version} · {revision.redactor_version}</small><details><summary>Normalization warnings and record counts</summary><pre className={styles.command}>{JSON.stringify(revision.validation_report, null, 2)}</pre></details>{canDownloadRaw && <button onClick={() => void download(revision.revision)}>Download raw revision {revision.revision}</button>}</article>)}<div className={styles.inline}>{historyCursor && <button onClick={() => setHistoryCursor(null)}>First revisions</button>}{revisions.data?.nextCursor && <button onClick={() => setHistoryCursor(revisions.data!.nextCursor!)}>Older revisions</button>}</div>{canManage && <ResolutionImport tenantId={tenantId} hrefFor={hrefFor} reprocess={{ id, version: row.version }} />}</> : <>
      <EvidenceSection key={`${row.version}-warnings`} tenantId={tenantId} id={id} name="warnings" count={row.section_counts.warnings} revision={row.active_revision} open />
      <EvidenceSection key={`${row.version}-validations`} tenantId={tenantId} id={id} name="validations" count={row.section_counts.validations} revision={row.active_revision} open />
      <section className={styles.panel}><h2>Reported resolution</h2><p>{row.resolution_summary || row.one_line_resolution || 'No resolution summary recorded.'}</p><Fields row={row} omit={Object.keys(row).filter(key => !['permanent_fix', 'temporary_workaround', 'primary_remediation', 'recommended_ticket_state'].includes(key))} /><span className={styles.source}>Source revision {row.active_revision} · /resolution and /current_status</span></section>
      <EvidenceSection key={`${row.version}-actions`} tenantId={tenantId} id={id} name="actions" count={row.section_counts.actions} revision={row.active_revision} open />
      <EvidenceSection key={`${row.version}-side_effects`} tenantId={tenantId} id={id} name="side_effects" count={row.section_counts.side_effects} revision={row.active_revision} open />
      {Object.entries(row.section_counts).filter(([name, count]) => !['warnings', 'validations', 'actions', 'side_effects'].includes(name) && Number(count) > 0).map(([name, count]) => <EvidenceSection key={`${row.version}-${name}`} tenantId={tenantId} id={id} name={name} count={Number(count)} revision={row.active_revision} />)}
      <details className={styles.section}><summary>Incident classification and native record links</summary><div><Fields row={row} omit={['section_counts']} /></div></details>
      <ResolutionDocuments key={`documents-${row.version}`} tenantId={tenantId} incident={row} canWrite={canWrite} hrefFor={hrefFor} />
      <ResolutionSemantic key={`semantic-${row.version}`} tenantId={tenantId} incident={row} canManage={canManage}/>
      <section className={styles.panel}><h2>Related incidents</h2><p className={styles.muted}>Shared exact identifiers explain these matches. Relevance is not a probability of successful repair.</p><LoadState loading={related.loading} error={related.error} retry={related.reload} />{related.data && <IncidentCards items={related.data.items} hrefFor={hrefFor} />}</section>
      {canWrite && <ReviewEditor key={row.version} tenantId={tenantId} row={row} canManage={canManage} canSetOwnerVisibility={canSetOwnerVisibility} onArchived={() => setArchived(true)} reload={detail.reload} />}
    </>}
  </>}</>;
}
