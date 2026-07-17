import { AlertCircle } from 'lucide-react';
import type { AuthoringIssue, CaseDraft } from '@/data/cases/authoring';
import type { HintTier } from '@/types';
import { FieldIssues, Section, inputCls, issuesForPath } from '../primitives';

export function HintsSection({
  draft,
  issues,
  updateHint,
}: {
  draft: CaseDraft;
  issues: AuthoringIssue[];
  updateHint: (idx: number, patch: Partial<HintTier>) => void;
}) {
  return (
    <Section
      title="Hint ladder"
      description="Exactly 4 tiers (levels 1–4) with strictly increasing penalties."
    >
      {issues
        .filter(
          (i) => i.code === 'hint-ladder-length' || i.code === 'hint-penalty-monotonic'
        )
        .map((i, idx) => (
          <div
            key={`hint-issue-${idx}`}
            className="text-[11px] font-mono text-red-400 flex items-center gap-1"
          >
            <AlertCircle size={11} /> {i.message}
          </div>
        ))}
      {draft.hints.map((h, idx) => {
        const itemIssues = issuesForPath(issues, `hints[${idx}]`);
        return (
          <div
            key={idx}
            className="border border-zinc-800/60 rounded-lg p-3 bg-zinc-950/40 space-y-2"
          >
            <div className="grid sm:grid-cols-[60px_1fr_120px] gap-2">
              <div className="text-xs font-mono text-zinc-500 self-center">
                L{h.level}
              </div>
              <input
                value={h.label}
                onChange={(e) => updateHint(idx, { label: e.target.value })}
                placeholder="Label"
                className={inputCls}
              />
              <input
                type="number"
                value={h.scorePenalty}
                onChange={(e) =>
                  updateHint(idx, { scorePenalty: Number(e.target.value) || 0 })
                }
                className={inputCls + ' font-mono text-xs'}
              />
            </div>
            <textarea
              rows={2}
              value={h.text}
              onChange={(e) => updateHint(idx, { text: e.target.value })}
              placeholder="Hint text"
              className={inputCls}
            />
            <FieldIssues issues={itemIssues} />
          </div>
        );
      })}
    </Section>
  );
}
