import { useAppStore } from '@/stores/useAppStore';
import { List, Terminal, FileText, MessageSquare } from 'lucide-react';

const toolIcons: Record<string, React.ReactNode> = {
  terminal: <Terminal size={10} />,
  'event-log': <FileText size={10} />,
  'ticket-history': <MessageSquare size={10} />,
};

export default function ActionLog() {
  const currentCaseState = useAppStore(s => s.currentCaseState);

  if (!currentCaseState) return null;

  const recentActions = [...currentCaseState.actionLog].reverse().slice(0, 50);

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <List size={14} className="text-cyan-400" />
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
            Action Log
          </span>
        </div>
        <span className="text-xs font-mono text-zinc-600">
          {currentCaseState.totalCommands} actions
        </span>
      </div>

      <div className="space-y-1 max-h-48 overflow-y-auto">
        {recentActions.length === 0 && (
          <p className="text-xs text-zinc-700">No actions recorded yet.</p>
        )}
        {recentActions.map((action, i) => (
          <div
            key={i}
            className="flex items-center gap-2 text-xs py-0.5"
          >
            <span className="text-zinc-600 flex-shrink-0">
              {toolIcons[action.toolType] || <Terminal size={10} />}
            </span>
            <span className="text-zinc-500 truncate font-mono">
              {action.command}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
