import {
  History,
  Pencil,
  Power,
  PowerOff,
  Save,
  Star,
  StarOff,
  Undo2,
  X,
} from 'lucide-react';
import { CATALOG, formatPrice, type CatalogProduct } from '@/data/catalog';
import type { CatalogOverridePayload } from '@/lib/api';
import { formatRelativeTime } from './formatRelativeTime';

type CatalogOverride = CatalogOverridePayload;

export type CatalogOverrideEditor = {
  id: string;
  displayName: string | null;
  email: string | null;
};

export type CatalogOverrideMeta = {
  updatedAt: string | null;
  editor: CatalogOverrideEditor | null;
};

interface Props {
  overrides: Record<string, CatalogOverride>;
  overrideMeta: Record<string, CatalogOverrideMeta>;
  editing: string | null;
  draft: CatalogOverride;
  setDraft: (d: CatalogOverride) => void;
  setEditing: (id: string | null) => void;
  startEdit: (p: CatalogProduct) => void;
  saveEdit: (id: string) => void;
  updateOverride: (id: string, patch: CatalogOverride) => void;
  revert: (id: string) => void;
  openHistory: (productId: string) => void;
}

export function CatalogTab({
  overrides,
  overrideMeta,
  editing,
  draft,
  setDraft,
  setEditing,
  startEdit,
  saveEdit,
  updateOverride,
  revert,
  openHistory,
}: Props) {
  return (
    <div className="space-y-3">
      {CATALOG.map((p) => {
        const o = overrides[p.id] || {};
        const status = o.status ?? p.status;
        const featured = o.featured ?? p.featured;
        const isEditing = editing === p.id;
        return (
          <div
            key={p.id}
            className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-4"
          >
            <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-zinc-100">{p.name}</h3>
                  <span className="text-[11px] font-mono text-zinc-500 uppercase">
                    {p.id}
                  </span>
                  <span
                    className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${
                      status === 'available'
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                        : status === 'coming-soon'
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                          : 'bg-zinc-700/40 text-zinc-400 border-zinc-700/40'
                    }`}
                  >
                    {status}
                  </span>
                  {featured && (
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded border bg-cyan-500/10 text-cyan-300 border-cyan-500/30">
                      Featured
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  {(o.shortDescription ?? p.shortDescription)} •{' '}
                  <span className="font-mono text-zinc-500">
                    {p.pricingType === 'free' ? 'Free' : formatPrice(p.priceAmountCents)}
                    {p.pricingType === 'subscription-monthly' ? '/mo' : ''}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  title={status === 'disabled' ? 'Enable' : 'Disable'}
                  onClick={() =>
                    updateOverride(p.id, {
                      status: status === 'disabled' ? 'available' : 'disabled',
                    })
                  }
                  className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400"
                >
                  {status === 'disabled' ? <Power size={14} /> : <PowerOff size={14} />}
                </button>
                <button
                  title="Toggle featured"
                  onClick={() => updateOverride(p.id, { featured: !featured })}
                  className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400"
                >
                  {featured ? <StarOff size={14} /> : <Star size={14} />}
                </button>
                <button
                  title="Edit"
                  onClick={() => (isEditing ? setEditing(null) : startEdit(p))}
                  className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400"
                >
                  {isEditing ? <X size={14} /> : <Pencil size={14} />}
                </button>
                <button
                  title="View edit history"
                  onClick={() => openHistory(p.id)}
                  className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400"
                >
                  <History size={14} />
                </button>
                {overrides[p.id] && (
                  <button
                    title="Revert to original"
                    onClick={() => revert(p.id)}
                    className="p-1.5 rounded hover:bg-zinc-800 text-amber-400"
                  >
                    <Undo2 size={14} />
                  </button>
                )}
              </div>
            </div>
            {overrideMeta[p.id]?.updatedAt && (
              <p className="text-[11px] text-zinc-500 font-mono mt-1">
                edited by{' '}
                <span className="text-zinc-300">
                  {overrideMeta[p.id]?.editor?.displayName ||
                    overrideMeta[p.id]?.editor?.email ||
                    overrideMeta[p.id]?.editor?.id ||
                    'unknown'}
                </span>{' '}
                · {formatRelativeTime(overrideMeta[p.id]?.updatedAt)}
              </p>
            )}
            {isEditing && (
              <div className="mt-3 space-y-2">
                <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                  Short description
                </label>
                <input
                  value={draft.shortDescription ?? ''}
                  onChange={(e) =>
                    setDraft({ ...draft, shortDescription: e.target.value })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100"
                />
                <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                  Long description
                </label>
                <textarea
                  rows={3}
                  value={draft.longDescription ?? ''}
                  onChange={(e) =>
                    setDraft({ ...draft, longDescription: e.target.value })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100"
                />
                <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                  Tags (comma separated)
                </label>
                <input
                  value={(draft.tags || []).join(', ')}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      tags: e.target.value
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean),
                    })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100"
                />
                <div className="flex justify-end">
                  <button
                    onClick={() => saveEdit(p.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono uppercase tracking-wider hover:bg-emerald-500/20"
                  >
                    <Save size={12} /> Save
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <p className="text-[11px] text-zinc-600 mt-3">
        Catalog overrides are saved to the server and applied for every user on load. Edits to
        status, featured flag, copy, and tags take effect immediately across all sessions.
      </p>
    </div>
  );
}
