import { Plus, Trash2 } from 'lucide-react';
import type { AuthoringIssue, CaseDraft } from '@/data/cases/authoring';
import type { EventLogEntry } from '@/types';
import { FieldIssues, Section, inputCls } from '../primitives';

export function EventsSection({
  draft,
  issues,
  updateEvent,
  addEvent,
  removeEvent,
}: {
  draft: CaseDraft;
  issues: AuthoringIssue[];
  updateEvent: (idx: number, patch: Partial<EventLogEntry>) => void;
  addEvent: () => void;
  removeEvent: (idx: number) => void;
}) {
  return (
    <Section
      title="Event log entries"
      action={
        <button
          onClick={addEvent}
          className="flex items-center gap-1 text-xs text-emerald-300 hover:text-emerald-200"
        >
          <Plus size={12} /> Add
        </button>
      }
    >
      {draft.eventLogs.map((e, idx) => {
        const itemIssues = issues.filter((i) => i.path?.startsWith(`eventLog:${e.id}`));
        return (
          <div
            key={idx}
            className="border border-zinc-800/60 rounded-lg p-3 bg-zinc-950/40 space-y-2"
          >
            <div className="grid sm:grid-cols-[120px_180px_120px_120px_auto] gap-2">
              <input
                value={e.id}
                onChange={(ev) => updateEvent(idx, { id: ev.target.value })}
                placeholder="id"
                className={inputCls + ' font-mono text-xs'}
              />
              <input
                value={e.timestamp}
                onChange={(ev) => updateEvent(idx, { timestamp: ev.target.value })}
                placeholder="YYYY-MM-DD HH:MM:SS"
                className={inputCls + ' font-mono text-xs'}
              />
              <input
                value={e.source}
                onChange={(ev) => updateEvent(idx, { source: ev.target.value })}
                placeholder="source"
                className={inputCls + ' font-mono text-xs'}
              />
              <select
                value={e.level}
                onChange={(ev) =>
                  updateEvent(idx, { level: ev.target.value as EventLogEntry['level'] })
                }
                className={inputCls}
              >
                <option value="info">info</option>
                <option value="warning">warning</option>
                <option value="error">error</option>
                <option value="critical">critical</option>
              </select>
              <button
                onClick={() => removeEvent(idx)}
                className="p-1.5 rounded hover:bg-zinc-800 text-red-400"
                title="Remove event"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <input
              value={e.message}
              onChange={(ev) => updateEvent(idx, { message: ev.target.value })}
              placeholder="Message"
              className={inputCls}
            />
            <input
              value={(e.revealsEvidence || []).join(', ')}
              onChange={(ev) =>
                updateEvent(idx, {
                  revealsEvidence: ev.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="Reveals evidence ids (comma separated)"
              className={inputCls + ' font-mono text-xs'}
            />
            <FieldIssues issues={itemIssues} />
          </div>
        );
      })}
    </Section>
  );
}
