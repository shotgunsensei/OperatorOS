import { AlertCircle, Plus, Trash2 } from 'lucide-react';
import type {
  AuthorEvidence,
  AuthoringIssue,
  CaseDraft,
} from '@/data/cases/authoring';
import { FieldIssues, Section, inputCls, issuesForPath } from '../primitives';

export function EvidenceSection({
  draft,
  issues,
  updateEvidence,
  addEvidence,
  removeEvidence,
}: {
  draft: CaseDraft;
  issues: AuthoringIssue[];
  updateEvidence: (idx: number, patch: Partial<AuthorEvidence>) => void;
  addEvidence: () => void;
  removeEvidence: (idx: number) => void;
}) {
  return (
    <Section
      title="Evidence"
      description="At least 4 items. Every clue/critical entry must be revealed by a command, event, or ticket."
      action={
        <button
          onClick={addEvidence}
          className="flex items-center gap-1 text-xs text-emerald-300 hover:text-emerald-200"
        >
          <Plus size={12} /> Add
        </button>
      }
    >
      <FieldIssues issues={issues.filter((i) => i.code === 'too-few-evidence')} />
      {draft.evidence.map((e, idx) => {
        const itemIssues = issuesForPath(issues, `evidence.${e.id}`);
        const missingId =
          !e.id && issues.some((i) => i.code === 'missing-evidence-id');
        return (
          <div
            key={idx}
            className="border border-zinc-800/60 rounded-lg p-3 bg-zinc-950/40 space-y-2"
          >
            <div className="grid sm:grid-cols-[120px_1fr_140px_140px_auto] gap-2">
              <div>
                <input
                  value={e.id}
                  onChange={(ev) => updateEvidence(idx, { id: ev.target.value })}
                  placeholder="id"
                  className={
                    inputCls +
                    ' font-mono text-xs' +
                    (missingId ? ' border-red-500/60' : '')
                  }
                />
                {missingId && (
                  <p className="text-[11px] font-mono text-red-400 mt-1 flex items-center gap-1">
                    <AlertCircle size={11} /> id is required
                  </p>
                )}
              </div>
              <input
                value={e.title}
                onChange={(ev) => updateEvidence(idx, { title: ev.target.value })}
                placeholder="Title"
                className={inputCls}
              />
              <select
                value={e.category}
                onChange={(ev) =>
                  updateEvidence(idx, {
                    category: ev.target.value as AuthorEvidence['category'],
                  })
                }
                className={inputCls}
              >
                <option value="clue">clue</option>
                <option value="red-herring">red-herring</option>
                <option value="contextual">contextual</option>
              </select>
              <select
                value={e.importance}
                onChange={(ev) =>
                  updateEvidence(idx, {
                    importance: ev.target.value as AuthorEvidence['importance'],
                  })
                }
                className={inputCls}
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="critical">critical</option>
              </select>
              <button
                onClick={() => removeEvidence(idx)}
                className="p-1.5 rounded hover:bg-zinc-800 text-red-400"
                title="Remove evidence"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <textarea
              rows={2}
              value={e.description}
              onChange={(ev) => updateEvidence(idx, { description: ev.target.value })}
              placeholder="Description"
              className={inputCls}
            />
            <FieldIssues issues={itemIssues} />
          </div>
        );
      })}
    </Section>
  );
}
