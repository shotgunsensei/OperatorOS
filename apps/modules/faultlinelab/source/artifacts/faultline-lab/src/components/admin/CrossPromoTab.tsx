import { useEffect, useState } from 'react';
import {
  adminDownloadCrossPromoClicksCsv,
  adminFetchCrossPromoClicks,
  type CrossPromoDashboard,
  type CrossPromoExportWindow,
} from '@/lib/api';
import { formatRelativeTime } from './formatRelativeTime';
import { Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

type Window = '7d' | '30d';
const EXPORT_WINDOWS: CrossPromoExportWindow[] = ['7d', '30d', '90d'];

function CountTable({
  rows,
  labelKey,
  emptyLabel,
}: {
  rows: Array<{ clicks: number } & Record<string, unknown>>;
  labelKey: string;
  emptyLabel: string;
}) {
  if (!rows.length) {
    return <p className="text-xs text-zinc-500 px-3 py-4">{emptyLabel}</p>;
  }
  const max = rows[0]?.clicks || 1;
  return (
    <ul className="divide-y divide-zinc-800/60">
      {rows.map((r, i) => {
        const label = String(r[labelKey] ?? '—');
        const pct = Math.max(2, Math.round((r.clicks / max) * 100));
        return (
          <li key={`${label}-${i}`} className="px-3 py-2 flex items-center gap-3">
            <span className="font-mono text-xs text-zinc-300 truncate flex-1" title={label}>
              {label}
            </span>
            <div className="w-24 h-1.5 bg-zinc-800 rounded overflow-hidden">
              <div className="h-full bg-emerald-500/70" style={{ width: `${pct}%` }} />
            </div>
            <span className="font-mono text-xs text-emerald-300 tabular-nums w-10 text-right">
              {r.clicks}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default function CrossPromoTab() {
  const [data, setData] = useState<CrossPromoDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [win, setWin] = useState<Window>('7d');
  const [exportWin, setExportWin] = useState<CrossPromoExportWindow>('7d');
  const [exporting, setExporting] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    adminFetchCrossPromoClicks()
      .then((r) => setData(r))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Failed to load cross-promo data')
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { blob, filename } = await adminDownloadCrossPromoClicksCsv(exportWin);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported cross-promo clicks (${exportWin}).`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to export CSV';
      toast.error(message);
    } finally {
      setExporting(false);
    }
  };

  const placements = win === '7d' ? data?.topPlacements7d ?? [] : data?.topPlacements30d ?? [];
  const targets = win === '7d' ? data?.topTargets7d ?? [] : data?.topTargets30d ?? [];
  const total = win === '7d' ? data?.totals.total7d ?? 0 : data?.totals.total30d ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex bg-zinc-900 border border-zinc-800 rounded overflow-hidden text-xs">
          {(['7d', '30d'] as Window[]).map((w) => (
            <button
              key={w}
              onClick={() => setWin(w)}
              className={`px-3 py-1.5 font-mono uppercase tracking-wider ${
                win === w
                  ? 'bg-zinc-800 text-emerald-300'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Last {w}
            </button>
          ))}
        </div>
        <span className="text-xs text-zinc-500 font-mono">
          {loading ? 'Loading…' : `${total} clicks in window`}
        </span>
        <button
          onClick={load}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-zinc-800 text-zinc-200 hover:bg-zinc-700 text-xs disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-zinc-500 font-mono uppercase tracking-wider">
          Export raw clicks
        </span>
        <div className="flex bg-zinc-900 border border-zinc-800 rounded overflow-hidden text-xs">
          {EXPORT_WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setExportWin(w)}
              className={`px-3 py-1.5 font-mono uppercase tracking-wider ${
                exportWin === w
                  ? 'bg-zinc-800 text-emerald-300'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {w}
            </button>
          ))}
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-emerald-600/80 text-zinc-50 hover:bg-emerald-600 text-xs disabled:opacity-50"
        >
          <Download size={12} className={exporting ? 'animate-pulse' : ''} />
          {exporting ? 'Preparing…' : 'Download CSV'}
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-900/60 bg-red-950/30 text-red-300 text-xs px-3 py-2">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="rounded border border-zinc-800 bg-zinc-900/40">
          <header className="px-3 py-2 border-b border-zinc-800/60 text-xs font-mono uppercase tracking-wider text-zinc-400">
            Top placements
          </header>
          <CountTable rows={placements} labelKey="placementId" emptyLabel="No clicks in this window." />
        </section>
        <section className="rounded border border-zinc-800 bg-zinc-900/40">
          <header className="px-3 py-2 border-b border-zinc-800/60 text-xs font-mono uppercase tracking-wider text-zinc-400">
            Top target products
          </header>
          <CountTable rows={targets} labelKey="targetProduct" emptyLabel="No clicks in this window." />
        </section>
      </div>

      <section className="rounded border border-zinc-800 bg-zinc-900/40">
        <header className="px-3 py-2 border-b border-zinc-800/60 text-xs font-mono uppercase tracking-wider text-zinc-400">
          Recent activity (last 50)
        </header>
        {data && data.recent.length === 0 ? (
          <p className="text-xs text-zinc-500 px-3 py-4">No cross-promo clicks recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead className="text-zinc-500 text-left">
                <tr>
                  <th className="px-3 py-2 font-normal">When</th>
                  <th className="px-3 py-2 font-normal">Placement</th>
                  <th className="px-3 py-2 font-normal">Target</th>
                  <th className="px-3 py-2 font-normal">Tier</th>
                  <th className="px-3 py-2 font-normal">Route</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {(data?.recent ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap" title={r.createdAt ?? ''}>
                      {formatRelativeTime(r.createdAt)}
                    </td>
                    <td className="px-3 py-2 truncate max-w-[200px]" title={r.placementId}>
                      {r.placementId}
                    </td>
                    <td className="px-3 py-2">
                      <a
                        href={r.targetUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-400 hover:underline"
                        title={r.targetUrl}
                      >
                        {r.targetProduct}
                      </a>
                    </td>
                    <td className="px-3 py-2 text-zinc-400">{r.userTier}</td>
                    <td className="px-3 py-2 text-zinc-500 truncate max-w-[200px]" title={r.route ?? ''}>
                      {r.route ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
