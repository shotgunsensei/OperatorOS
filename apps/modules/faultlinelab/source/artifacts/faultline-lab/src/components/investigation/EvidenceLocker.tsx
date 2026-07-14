import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/stores/useAppStore';
import { Lock, Unlock, Search, AlertTriangle, Info } from 'lucide-react';

const importanceColors = {
  low: 'text-zinc-500 border-zinc-700',
  medium: 'text-blue-400 border-blue-500/30',
  high: 'text-amber-400 border-amber-500/30',
  critical: 'text-red-400 border-red-500/30',
};

export default function EvidenceLocker() {
  const currentCaseDef = useAppStore(s => s.currentCaseDef);
  const currentCaseState = useAppStore(s => s.currentCaseState);

  if (!currentCaseDef || !currentCaseState) return null;

  const unlockedEvidence = currentCaseDef.evidence.filter(e =>
    currentCaseState.unlockedEvidence.includes(e.id)
  );
  const lockedCount =
    currentCaseDef.evidence.length - unlockedEvidence.length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 bg-[#111822] border-b border-zinc-800/50 rounded-t-lg">
        <div className="flex items-center gap-2">
          <Search size={14} className="text-cyan-400" />
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
            Evidence
          </span>
        </div>
        <span className="text-xs font-mono text-zinc-600">
          {unlockedEvidence.length}/{currentCaseDef.evidence.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        <AnimatePresence mode="popLayout">
          {unlockedEvidence.map(evidence => (
            <motion.div
              key={evidence.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className={`p-2 border rounded text-xs ${importanceColors[evidence.importance]} bg-[#0c1017]`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Unlock size={10} className="text-emerald-400 flex-shrink-0" />
                <span className="font-medium text-zinc-200 truncate">
                  {evidence.title}
                </span>
                {evidence.category === 'red-herring' && (
                  <AlertTriangle size={10} className="text-amber-500 flex-shrink-0" />
                )}
                {evidence.category === 'contextual' && (
                  <Info size={10} className="text-zinc-500 flex-shrink-0" />
                )}
              </div>
              <p className="text-zinc-500 leading-snug pl-4">
                {evidence.description}
              </p>
            </motion.div>
          ))}
        </AnimatePresence>

        {lockedCount > 0 && (
          <div className="flex items-center gap-2 p-2 text-zinc-700 text-xs">
            <Lock size={10} />
            <span>{lockedCount} evidence item(s) still locked</span>
          </div>
        )}
      </div>
    </div>
  );
}
