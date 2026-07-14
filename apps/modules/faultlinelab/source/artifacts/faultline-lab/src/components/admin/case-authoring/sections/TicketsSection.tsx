import { Plus, Trash2 } from 'lucide-react';
import type { AuthoringIssue, CaseDraft } from '@/data/cases/authoring';
import type { TicketNote } from '@/types';
import { FieldIssues, Section, inputCls } from '../primitives';

export function TicketsSection({
  draft,
  issues,
  updateTicket,
  addTicket,
  removeTicket,
}: {
  draft: CaseDraft;
  issues: AuthoringIssue[];
  updateTicket: (idx: number, patch: Partial<TicketNote>) => void;
  addTicket: () => void;
  removeTicket: (idx: number) => void;
}) {
  return (
    <Section
      title="Ticket history"
      action={
        <button
          onClick={addTicket}
          className="flex items-center gap-1 text-xs text-emerald-300 hover:text-emerald-200"
        >
          <Plus size={12} /> Add
        </button>
      }
    >
      {draft.ticketHistory.map((t, idx) => {
        const itemIssues = issues.filter((i) => i.path?.startsWith(`ticket:${t.id}`));
        return (
          <div
            key={idx}
            className="border border-zinc-800/60 rounded-lg p-3 bg-zinc-950/40 space-y-2"
          >
            <div className="grid sm:grid-cols-[100px_1fr_1fr_180px_auto] gap-2">
              <input
                value={t.id}
                onChange={(e) => updateTicket(idx, { id: e.target.value })}
                placeholder="id"
                className={inputCls + ' font-mono text-xs'}
              />
              <input
                value={t.author}
                onChange={(e) => updateTicket(idx, { author: e.target.value })}
                placeholder="Author"
                className={inputCls}
              />
              <input
                value={t.role}
                onChange={(e) => updateTicket(idx, { role: e.target.value })}
                placeholder="Role"
                className={inputCls}
              />
              <input
                value={t.timestamp}
                onChange={(e) => updateTicket(idx, { timestamp: e.target.value })}
                placeholder="Timestamp"
                className={inputCls + ' font-mono text-xs'}
              />
              <button
                onClick={() => removeTicket(idx)}
                className="p-1.5 rounded hover:bg-zinc-800 text-red-400"
                title="Remove ticket"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <textarea
              rows={2}
              value={t.content}
              onChange={(e) => updateTicket(idx, { content: e.target.value })}
              placeholder="Ticket content"
              className={inputCls}
            />
            <input
              value={(t.revealsEvidence || []).join(', ')}
              onChange={(e) =>
                updateTicket(idx, {
                  revealsEvidence: e.target.value
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
