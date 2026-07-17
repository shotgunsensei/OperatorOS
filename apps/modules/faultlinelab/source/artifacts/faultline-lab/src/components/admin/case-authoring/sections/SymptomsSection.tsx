import { Plus, Trash2 } from 'lucide-react';
import type { AuthoringIssue, CaseDraft } from '@/data/cases/authoring';
import type { Symptom } from '@/types';
import { FieldIssues, Section, inputCls } from '../primitives';

export function SymptomsSection({
  draft,
  issues,
  updateSymptom,
  addSymptom,
  removeSymptom,
}: {
  draft: CaseDraft;
  issues: AuthoringIssue[];
  updateSymptom: (idx: number, patch: Partial<Symptom>) => void;
  addSymptom: () => void;
  removeSymptom: (idx: number) => void;
}) {
  return (
    <Section
      title="Symptoms"
      description="At least 2 required."
      action={
        <button
          onClick={addSymptom}
          className="flex items-center gap-1 text-xs text-emerald-300 hover:text-emerald-200"
        >
          <Plus size={12} /> Add
        </button>
      }
    >
      <FieldIssues issues={issues.filter((i) => i.code === 'too-few-symptoms')} />
      {draft.symptoms.map((s, idx) => (
        <div
          key={idx}
          className="border border-zinc-800/60 rounded-lg p-3 bg-zinc-950/40 space-y-2"
        >
          <div className="grid sm:grid-cols-[120px_1fr_140px_auto] gap-2">
            <input
              value={s.id}
              onChange={(e) => updateSymptom(idx, { id: e.target.value })}
              placeholder="id"
              className={inputCls + ' font-mono text-xs'}
            />
            <input
              value={s.description}
              onChange={(e) => updateSymptom(idx, { description: e.target.value })}
              placeholder="What the user/system observes"
              className={inputCls}
            />
            <select
              value={s.severity}
              onChange={(e) =>
                updateSymptom(idx, { severity: e.target.value as Symptom['severity'] })
              }
              className={inputCls}
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="critical">critical</option>
            </select>
            <button
              onClick={() => removeSymptom(idx)}
              className="p-1.5 rounded hover:bg-zinc-800 text-red-400"
              title="Remove symptom"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
    </Section>
  );
}
