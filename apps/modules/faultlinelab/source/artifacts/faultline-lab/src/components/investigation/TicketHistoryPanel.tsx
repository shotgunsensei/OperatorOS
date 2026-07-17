import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '@/stores/useAppStore';
import { MessageSquare, User, Unlock } from 'lucide-react';

export default function TicketHistoryPanel() {
  const currentCaseDef = useAppStore(s => s.currentCaseDef);
  const currentCaseState = useAppStore(s => s.currentCaseState);
  const viewTicketNote = useAppStore(s => s.viewTicketNote);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!currentCaseDef || !currentCaseState) return null;

  const handleExpand = (noteId: string) => {
    setExpandedId(expandedId === noteId ? null : noteId);
    viewTicketNote(noteId);
  };

  return (
    <div className="flex flex-col h-full bg-[#0c1017] rounded-lg border border-zinc-800/50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 bg-[#111822] border-b border-zinc-800/50">
        <MessageSquare size={14} className="text-cyan-400" />
        <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
          Ticket History
        </span>
        <span className="text-xs font-mono text-zinc-600 ml-auto">
          {currentCaseDef.ticketHistory.length} notes
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {currentCaseDef.ticketHistory.map(note => {
          const isExpanded = expandedId === note.id;
          const hasNewEvidence = note.revealsEvidence?.some(
            eId => !currentCaseState.unlockedEvidence.includes(eId)
          );
          const hasRevealedEvidence = note.revealsEvidence?.some(
            eId => currentCaseState.unlockedEvidence.includes(eId)
          );

          return (
            <motion.button
              key={note.id}
              onClick={() => handleExpand(note.id)}
              className={`w-full text-left border rounded-lg p-4 bg-[#111822]/50 transition-colors ${
                isExpanded
                  ? 'border-cyan-500/30'
                  : 'border-zinc-800/40 hover:border-zinc-700/60'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded bg-zinc-800/60">
                  <User size={12} className="text-zinc-400" />
                </div>
                <div>
                  <span className="text-sm font-medium text-zinc-200">
                    {note.author}
                  </span>
                  <span className="text-xs text-zinc-600 ml-2">
                    {note.role}
                  </span>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {hasNewEvidence && (
                    <span className="text-xs px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded font-mono">
                      new
                    </span>
                  )}
                  {hasRevealedEvidence && !hasNewEvidence && (
                    <Unlock size={10} className="text-emerald-400/50" />
                  )}
                  <span className="text-xs font-mono text-zinc-600">
                    {note.timestamp}
                  </span>
                </div>
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed pl-8">
                {note.content}
              </p>
              {isExpanded && note.revealsEvidence && note.revealsEvidence.length > 0 && (
                <div className="pl-8 mt-2 py-1 px-2 bg-emerald-500/10 border border-emerald-500/20 rounded text-emerald-400 text-xs font-mono inline-block">
                  Evidence reviewed
                </div>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
