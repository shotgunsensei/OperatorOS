import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/stores/useAppStore';
import { FileText, ChevronDown, ChevronRight, AlertCircle, AlertTriangle, Info, XCircle } from 'lucide-react';

const levelIcons = {
  info: <Info size={14} className="text-blue-400" />,
  warning: <AlertTriangle size={14} className="text-amber-400" />,
  error: <AlertCircle size={14} className="text-red-400" />,
  critical: <XCircle size={14} className="text-red-500" />,
};

const levelColors = {
  info: 'border-blue-500/20 bg-blue-500/5',
  warning: 'border-amber-500/20 bg-amber-500/5',
  error: 'border-red-500/20 bg-red-500/5',
  critical: 'border-red-600/30 bg-red-500/10',
};

export default function EventLogPanel() {
  const currentCaseDef = useAppStore(s => s.currentCaseDef);
  const viewEventLog = useAppStore(s => s.viewEventLog);
  const currentCaseState = useAppStore(s => s.currentCaseState);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  if (!currentCaseDef) return null;

  const filteredLogs = filter === 'all'
    ? currentCaseDef.eventLogs
    : currentCaseDef.eventLogs.filter(l => l.level === filter);

  const handleExpand = (logId: string) => {
    setExpandedId(expandedId === logId ? null : logId);
    viewEventLog(logId);
  };

  return (
    <div className="flex flex-col h-full bg-[#0c1017] rounded-lg border border-zinc-800/50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-[#111822] border-b border-zinc-800/50">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-cyan-400" />
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
            Event Log Viewer
          </span>
        </div>
        <div className="flex items-center gap-1">
          {['all', 'critical', 'error', 'warning', 'info'].map(level => (
            <button
              key={level}
              onClick={() => setFilter(level)}
              className={`px-2 py-0.5 text-xs font-mono rounded transition-colors ${
                filter === level
                  ? 'bg-cyan-500/20 text-cyan-400'
                  : 'text-zinc-600 hover:text-zinc-400'
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredLogs.map(log => {
          const isExpanded = expandedId === log.id;
          const hasNewEvidence = log.revealsEvidence?.some(
            eId => !currentCaseState?.unlockedEvidence.includes(eId)
          );

          return (
            <motion.div
              key={log.id}
              layout
              className={`border rounded-md overflow-hidden ${levelColors[log.level]}`}
            >
              <button
                onClick={() => handleExpand(log.id)}
                className="w-full text-left px-3 py-2 flex items-start gap-2"
              >
                <div className="flex-shrink-0 mt-0.5">
                  {levelIcons[log.level]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-zinc-500">
                      {log.timestamp}
                    </span>
                    <span className="text-xs font-mono text-zinc-600">
                      [{log.source}]
                    </span>
                    {hasNewEvidence && (
                      <span className="text-xs px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded font-mono">
                        new
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-zinc-300 mt-0.5 truncate">
                    {log.message}
                  </p>
                </div>
                <div className="flex-shrink-0 mt-1 text-zinc-600">
                  {isExpanded ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </div>
              </button>

              <AnimatePresence>
                {isExpanded && log.details && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border-t border-zinc-800/30"
                  >
                    <pre className="px-3 py-2 text-xs font-mono text-zinc-400 whitespace-pre-wrap">
                      {log.details}
                    </pre>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
