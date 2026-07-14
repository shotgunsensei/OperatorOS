import { RotateCcw, X } from 'lucide-react';
import type {
  CatalogOverrideHistoryEntry,
  CatalogOverridePayload,
} from '@/lib/api';
import { formatRelativeTime } from './formatRelativeTime';

interface Props {
  productId: string;
  entries: CatalogOverrideHistoryEntry[] | null;
  loading: boolean;
  onClose: () => void;
  onRollback: (entry: CatalogOverrideHistoryEntry) => void;
}

function tagsStr(val: CatalogOverridePayload | null): string {
  return val
    ? [
        val.status ? `status: ${val.status}` : null,
        typeof val.featured === 'boolean' ? `featured: ${val.featured}` : null,
        val.shortDescription ? `short: "${val.shortDescription}"` : null,
        val.longDescription
          ? `long: "${val.longDescription.slice(0, 60)}${val.longDescription.length > 60 ? '…' : ''}"`
          : null,
        val.tags ? `tags: [${val.tags.join(', ')}]` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '(reverted to defaults)';
}

export function CatalogHistoryDrawer({
  productId,
  entries,
  loading,
  onClose,
  onRollback,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex justify-end"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md h-full bg-zinc-950 border-l border-zinc-800 shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-zinc-950/95 border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-emerald-300 font-mono uppercase tracking-wider">
              Edit history
            </h2>
            <p className="text-[11px] text-zinc-500 font-mono truncate">{productId}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400"
          >
            <X size={14} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {loading && <p className="text-xs text-zinc-500">Loading history…</p>}
          {!loading && entries && entries.length === 0 && (
            <p className="text-xs text-zinc-500">No edits recorded for this entry yet.</p>
          )}
          {entries?.map((h, idx) => {
            const isCurrent = idx === 0;
            const editorLabel =
              h.editor?.displayName || h.editor?.email || h.editor?.id || 'unknown';
            return (
              <div
                key={h.id}
                className="border border-zinc-800 rounded-lg p-3 bg-zinc-900/40"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border ${
                        h.action === 'revert' || h.action === 'rollback'
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                          : h.action === 'create'
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                            : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                      }`}
                    >
                      {h.action}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border bg-zinc-800 text-zinc-300 border-zinc-700">
                        current
                      </span>
                    )}
                  </div>
                  {!isCurrent && (
                    <button
                      onClick={() => onRollback(h)}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-mono uppercase tracking-wider hover:bg-amber-500/20"
                    >
                      <RotateCcw size={11} /> Roll back
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400 font-mono break-words">
                  {tagsStr(h.overrides)}
                </p>
                <p className="text-[11px] text-zinc-500 font-mono mt-1">
                  <span className="text-zinc-300">{editorLabel}</span>
                  {' · '}
                  {formatRelativeTime(h.changedAt)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
