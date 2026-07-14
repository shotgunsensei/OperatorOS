import type { AuthoringIssue, CaseDraft } from '@/data/cases/authoring';
import type { ToolType } from '@/types';
import { FieldIssues, Labeled, Section, inputCls } from '../primitives';
import { TOOL_OPTIONS } from '../draftStorage';

interface Props {
  draft: CaseDraft;
  issues: AuthoringIssue[];
  toggleTool: (tool: ToolType) => void;
  update: <K extends keyof CaseDraft>(key: K, value: CaseDraft[K]) => void;
}

export function ToolsOutcomeSection({ draft, issues, toggleTool, update }: Props) {
  return (
    <>
      <Section title="Available tools">
        <FieldIssues
          issues={issues.filter(
            (i) => i.code === 'no-tools' || i.code === 'single-tool-advanced'
          )}
        />
        <div className="flex flex-wrap gap-1.5">
          {TOOL_OPTIONS.map((t) => {
            const active = draft.availableTools.includes(t);
            return (
              <button
                key={t}
                onClick={() => toggleTool(t)}
                className={`text-[11px] font-mono uppercase px-2 py-1 rounded border transition-colors ${
                  active
                    ? 'bg-cyan-500/10 text-cyan-200 border-cyan-500/40'
                    : 'bg-zinc-950 text-zinc-500 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Outcome">
        <div>
          <Labeled label="Remediation">
            <textarea
              rows={2}
              value={draft.remediation}
              onChange={(e) => update('remediation', e.target.value)}
              className={inputCls}
            />
          </Labeled>
          <FieldIssues issues={issues.filter((i) => i.code === 'missing-remediation')} />
        </div>
        <div>
          <Labeled label="Preventative measures" hint="One per line.">
            <textarea
              rows={3}
              value={draft.preventativeMeasures.join('\n')}
              onChange={(e) =>
                update(
                  'preventativeMeasures',
                  e.target.value
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean)
                )
              }
              className={inputCls}
            />
          </Labeled>
          <FieldIssues issues={issues.filter((i) => i.code === 'no-preventatives')} />
        </div>
        <div>
          <Labeled label="Max score" hint="Engine normalized scale — must be 100.">
            <input
              type="number"
              value={draft.maxScore ?? 100}
              onChange={(e) =>
                update('maxScore', e.target.value === '' ? undefined : Number(e.target.value))
              }
              className={inputCls + ' font-mono text-xs'}
            />
          </Labeled>
          <FieldIssues issues={issues.filter((i) => i.code === 'invalid-max-score')} />
        </div>
        <Labeled label="Red herrings (one per line)">
          <textarea
            rows={2}
            value={draft.redHerrings.join('\n')}
            onChange={(e) =>
              update(
                'redHerrings',
                e.target.value
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            }
            className={inputCls}
          />
        </Labeled>
      </Section>
    </>
  );
}
