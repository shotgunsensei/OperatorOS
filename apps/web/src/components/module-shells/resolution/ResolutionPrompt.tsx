'use client';
import { useEffect, useState } from 'react';
import { resolutionBase, saveText } from './resolution-client';
import styles from './Resolution.module.css';

const artifacts = [['prompt', 'Full ticket completion prompt'], ['shortcut', 'Shortcut trigger'], ['template', 'JSON template'], ['schema', 'JSON Schema']] as const;
export default function ResolutionPrompt({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<Record<string, string> | null>(null), [sha, setSha] = useState(''), [error, setError] = useState(''), [status, setStatus] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError('');
    void Promise.all(artifacts.map(async ([key]) => {
      const response = await fetch(`${resolutionBase}/${key}?version=1.0`, { credentials: 'include', cache: 'no-store', headers: { 'X-Tenant-Id': tenantId }, signal: controller.signal });
      if (!response.ok) throw new Error(response.status === 403 ? 'Your current access does not permit this prompt workspace.' : 'Prompt assets could not be loaded.');
      return { key, text: await response.text(), sha: response.headers.get('x-resolution-prompt-sha256') ?? '' };
    })).then(results => { if (!controller.signal.aborted) { setData(Object.fromEntries(results.map(result => [result.key, result.text]))); setSha(results[0].sha); } }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [tenantId, retry]);
  async function copy(key: string, title: string) { try { await navigator.clipboard.writeText(data![key]); setStatus(`${title} copied.`); } catch { setStatus('Clipboard access is unavailable. Use Download or select the text below.'); } }
  return <>
    <section className={styles.panel}><h2>One canonical closeout format</h2><p>Use the full prompt in your existing troubleshooting conversation. The shortcut invokes that prompt; the JSON template is the export shape, and JSON Schema is the validation contract.</p><p className={styles.muted}>Schema version 1.0 · Exact and full-text search and evidence-derived document drafts are available. AI research and embeddings are not enabled.</p>{sha && <small className={styles.source}>Canonical prompt SHA-256: {sha}</small>}</section>
    {error && <div className={styles.error} role="alert">{error} <button onClick={() => setRetry(value => value + 1)}>Retry</button></div>}
    {!data && !error && <p role="status">Loading canonical prompt assets…</p>}
    <p role="status" aria-live="polite">{status}</p>
    {data && artifacts.map(([key, title]) => <section className={styles.panel} key={key}><h2>{title}</h2><div className={styles.inline}><button onClick={() => void copy(key, title)}>Copy {title === 'Full ticket completion prompt' ? 'full prompt' : title === 'Shortcut trigger' ? 'shortcut' : title}</button><button onClick={() => { saveText(data[key], `techdeck-resolution-${key}.${key === 'template' || key === 'schema' ? 'json' : 'txt'}`, key === 'template' || key === 'schema' ? 'application/json' : 'text/plain'); setStatus(`${title} downloaded.`); }}>Download {title === 'Full ticket completion prompt' ? 'full prompt' : title === 'Shortcut trigger' ? 'shortcut' : title}</button></div><details className={styles.section}><summary>Read {title}</summary><div><pre className={styles.command}>{data[key]}</pre></div></details></section>)}
  </>;
}
