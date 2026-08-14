import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Eye,
  FileDown,
  FolderOpen,
  Hammer,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react';
import type { AuthoringIssue, CaseDraft } from '@/data/cases/authoring';
import { categoryLabels, difficultyColors } from '@/data/cases';
import { topLevelIssues } from './primitives';
import { editorLabel, type StoredDraft } from './draftStorage';

interface Props {
  draft: CaseDraft;
  issues: AuthoringIssue[];
  validation: { errorCount: number; warningCount: number };
  storedDrafts: Record<string, StoredDraft>;
  draftsLoading: boolean;
  savingDraft: boolean;
  showPreview: boolean;
  setShowPreview: (next: boolean | ((v: boolean) => boolean)) => void;
  refreshDrafts: () => void;
  saveDraft: () => void;
  exportDraft: () => void;
  promote: () => void;
  loadDraft: (id: string) => void;
  deleteDraft: (id: string) => void;
}

export function AuthoringSidebar({
  draft,
  issues,
  validation,
  storedDrafts,
  draftsLoading,
  savingDraft,
  showPreview,
  setShowPreview,
  refreshDrafts,
  saveDraft,
  exportDraft,
  promote,
  loadDraft,
  deleteDraft,
}: Props) {
  const evidenceIds = draft.evidence.map((e) => e.id).filter(Boolean);
  const storedKeys = Object.keys(storedDrafts).sort(
    (a, b) => (storedDrafts[b]?.savedAt ?? 0) - (storedDrafts[a]?.savedAt ?? 0)
  );

  return (
    <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
      <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zinc-100">Validation</h3>
          {validation.errorCount === 0 ? (
            <span className="flex items-center gap-1 text-xs text-emerald-300">
              <CheckCircle2 size={12} /> Ready
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-red-400">
              <AlertCircle size={12} /> {validation.errorCount} error
              {validation.errorCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <p className="text-[11px] text-zinc-500 mb-2">
          {validation.errorCount} error{validation.errorCount === 1 ? '' : 's'},{' '}
          {validation.warningCount} warning{validation.warningCount === 1 ? '' : 's'}.
        </p>
        {topLevelIssues(issues).length > 0 ? (
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {topLevelIssues(issues).map((i, idx) => (
              <li
                key={`tl-${idx}`}
                className={`text-[11px] font-mono flex items-start gap-1 ${
                  i.level === 'error' ? 'text-red-400' : 'text-amber-300'
                }`}
              >
                {i.level === 'error' ? (
                  <AlertCircle size={11} className="mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                )}
                <span>
                  [{i.code}] {i.message}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-zinc-500">No top-level issues.</p>
        )}
        <div className="flex flex-col gap-2 mt-3">
          <button
            onClick={saveDraft}
            disabled={savingDraft}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono uppercase tracking-wider hover:bg-emerald-500/20 disabled:opacity-50"
          >
            <Save size={12} /> {savingDraft ? 'Saving...' : 'Save draft'}
          </button>
          <button
            onClick={exportDraft}
            disabled={validation.errorCount > 0}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-mono uppercase tracking-wider hover:bg-zinc-700 disabled:opacity-50"
            title="Compose and copy JSON"
          >
            <Copy size={12} /> Export JSON
          </button>
          <button
            onClick={promote}
            disabled={validation.errorCount > 0}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono uppercase tracking-wider hover:bg-amber-500/20 disabled:opacity-50"
            title="Promote to live registry (manual deploy)"
          >
            <Hammer size={12} /> Promote
          </button>
        </div>
      </div>

      <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5">
            <Eye size={13} /> Preview
          </h3>
          <button
            onClick={() => setShowPreview((v) => !v)}
            className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 hover:text-zinc-200"
          >
            {showPreview ? 'Hide' : 'Show'}
          </button>
        </div>
        {showPreview && (
          <div className="bg-[#111822] border border-zinc-800/60 rounded-lg p-4">
            <div className="text-xs text-zinc-500 uppercase tracking-wider">
              {categoryLabels[draft.category] || draft.category}
            </div>
            <h4 className="text-base font-semibold text-zinc-100 mt-1">
              {draft.title || 'Untitled Case'}
            </h4>
            <p className="text-sm text-zinc-400 mt-2 line-clamp-3">
              {draft.description || 'No description set.'}
            </p>
            <div className="flex items-center gap-3 mt-3">
              <span
                className={`text-xs font-medium uppercase tracking-wider ${
                  difficultyColors[draft.difficulty] || 'text-zinc-400'
                }`}
              >
                {draft.difficulty}
              </span>
              <span className="text-xs text-zinc-600">|</span>
              <span className="text-xs text-zinc-500">
                {draft.symptoms.length} symptom{draft.symptoms.length === 1 ? '' : 's'}
              </span>
              <span className="text-xs text-zinc-600">|</span>
              <span className="text-xs text-zinc-500">
                {draft.evidence.length} evidence
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-zinc-800/60 space-y-1">
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-mono">
                Briefing
              </p>
              <p className="text-[11px] text-zinc-400 whitespace-pre-wrap line-clamp-6 font-mono">
                {draft.briefing || '—'}
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-zinc-800/60">
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-mono mb-1">
                Tools
              </p>
              <div className="flex flex-wrap gap-1">
                {draft.availableTools.length === 0 ? (
                  <span className="text-[11px] text-zinc-600">none</span>
                ) : (
                  draft.availableTools.map((t) => (
                    <span
                      key={t}
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30"
                    >
                      {t}
                    </span>
                  ))
                )}
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-zinc-800/60">
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-mono mb-1">
                Evidence reachable from {evidenceIds.length} item
                {evidenceIds.length === 1 ? '' : 's'}
              </p>
              <p className="text-[11px] text-zinc-400 font-mono break-words">
                {evidenceIds.join(', ') || '—'}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5">
            <FolderOpen size={13} /> Team drafts
          </h3>
          <button
            onClick={refreshDrafts}
            disabled={draftsLoading}
            className="flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider text-zinc-500 hover:text-zinc-200 disabled:opacity-50"
            title="Refresh drafts"
          >
            <RefreshCw size={11} className={draftsLoading ? 'animate-spin' : ''} />
            {draftsLoading ? 'Loading' : 'Refresh'}
          </button>
        </div>
        <p className="text-[11px] text-zinc-500 mb-2">
          Drafts are shared across all admins.
        </p>
        {storedKeys.length === 0 ? (
          <p className="text-[11px] text-zinc-500">
            {draftsLoading ? 'Loading drafts…' : 'No drafts saved yet.'}
          </p>
        ) : (
          <ul className="space-y-1 max-h-72 overflow-y-auto">
            {storedKeys.map((id) => {
              const stored = storedDrafts[id];
              return (
                <li
                  key={id}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 border border-zinc-800/60 rounded-lg"
                >
                  <button
                    onClick={() => loadDraft(id)}
                    className="flex-1 min-w-0 text-left"
                    title="Load draft"
                  >
                    <p className="text-xs text-zinc-100 truncate">{id}</p>
                    <p className="text-[10px] text-zinc-500 font-mono truncate">
                      {stored.draft.title || '—'} ·{' '}
                      {new Date(stored.savedAt).toLocaleString()}
                    </p>
                    <p className="text-[10px] text-zinc-600 font-mono truncate">
                      edited by {editorLabel(stored.editor)}
                    </p>
                  </button>
                  <button
                    onClick={() => loadDraft(id)}
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-400"
                    title="Load"
                  >
                    <FileDown size={12} />
                  </button>
                  <button
                    onClick={() => deleteDraft(id)}
                    className="p-1 rounded hover:bg-zinc-800 text-red-400"
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
