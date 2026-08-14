import { Plus, Trash2 } from 'lucide-react';
import type { AuthoringIssue, CaseDraft } from '@/data/cases/authoring';
import type { ToolCommand } from '@/types';
import { FieldIssues, Section, inputCls } from '../primitives';

export function CommandsSection({
  draft,
  issues,
  updateCommand,
  addCommand,
  removeCommand,
}: {
  draft: CaseDraft;
  issues: AuthoringIssue[];
  updateCommand: (idx: number, patch: Partial<ToolCommand>) => void;
  addCommand: () => void;
  removeCommand: (idx: number) => void;
}) {
  return (
    <Section
      title="Terminal commands"
      action={
        <button
          onClick={addCommand}
          className="flex items-center gap-1 text-xs text-emerald-300 hover:text-emerald-200"
        >
          <Plus size={12} /> Add
        </button>
      }
    >
      {draft.terminalCommands.map((c, idx) => {
        const itemIssues = issues.filter((i) =>
          i.path?.startsWith(`command:${c.command}`)
        );
        return (
          <div
            key={idx}
            className="border border-zinc-800/60 rounded-lg p-3 bg-zinc-950/40 space-y-2"
          >
            <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
              <input
                value={c.command}
                onChange={(e) => updateCommand(idx, { command: e.target.value })}
                placeholder="command"
                className={inputCls + ' font-mono text-xs'}
              />
              <input
                value={c.description}
                onChange={(e) => updateCommand(idx, { description: e.target.value })}
                placeholder="Description"
                className={inputCls}
              />
              <button
                onClick={() => removeCommand(idx)}
                className="p-1.5 rounded hover:bg-zinc-800 text-red-400"
                title="Remove command"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <textarea
              rows={3}
              value={c.output}
              onChange={(e) => updateCommand(idx, { output: e.target.value })}
              placeholder="Command output"
              className={inputCls + ' font-mono text-xs'}
            />
            <input
              value={(c.revealsEvidence || []).join(', ')}
              onChange={(e) =>
                updateCommand(idx, {
                  revealsEvidence: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="Reveals evidence ids (comma separated)"
              className={inputCls + ' font-mono text-xs'}
            />
            <label className="flex items-center gap-2 text-[11px] text-zinc-400">
              <input
                type="checkbox"
                checked={!!c.isRisky}
                onChange={(e) => updateCommand(idx, { isRisky: e.target.checked })}
              />
              Risky action (applies score penalty)
            </label>
            <FieldIssues issues={itemIssues} />
          </div>
        );
      })}
    </Section>
  );
}
