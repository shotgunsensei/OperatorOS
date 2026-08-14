import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/stores/useAppStore';
import { Lightbulb, ChevronRight, AlertTriangle, EyeOff } from 'lucide-react';

export default function HintPanel() {
  const currentCaseDef = useAppStore(s => s.currentCaseDef);
  const currentCaseState = useAppStore(s => s.currentCaseState);
  const requestHint = useAppStore(s => s.requestHint);
  const [revealedHints, setRevealedHints] = useState<Record<number, string>>({});
  const blackedOut = !!currentCaseState?.chaos?.hintBlackout;

  useEffect(() => {
    if (!currentCaseDef || !currentCaseState) return;
    const restored: Record<number, string> = {};
    for (const level of currentCaseState.hintsUsed) {
      const hint = currentCaseDef.hints.find(h => h.level === level);
      if (hint) {
        restored[level] = hint.text;
      }
    }
    setRevealedHints(restored);
  }, [currentCaseDef, currentCaseState?.caseId]);

  if (!currentCaseDef || !currentCaseState) return null;

  const handleRequestHint = (level: number) => {
    const text = requestHint(level);
    if (text) {
      setRevealedHints(prev => ({ ...prev, [level]: text }));
    }
  };

  const nextAvailableHint = currentCaseDef.hints.find(
    h => !currentCaseState.hintsUsed.includes(h.level)
  );

  return (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb size={14} className="text-amber-400" />
        <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
          Hints
        </span>
        {currentCaseState.hintsUsed.length > 0 && (
          <span className="text-xs font-mono text-amber-500 ml-auto">
            {currentCaseState.hintsUsed.length} used
          </span>
        )}
      </div>

      {blackedOut && (
        <div className="mb-2 p-2 rounded border border-red-500/40 bg-red-500/10 text-xs text-red-300 flex items-center gap-2">
          <EyeOff size={12} />
          <span>Chaos Mode: hints are blacked out for this run.</span>
        </div>
      )}

      <div className={`space-y-2 ${blackedOut ? 'opacity-40 pointer-events-none' : ''}`}>
        {currentCaseDef.hints.map(hint => {
          const isUsed = currentCaseState.hintsUsed.includes(hint.level);
          const isRevealed = !!revealedHints[hint.level];
          const isNext = !blackedOut && nextAvailableHint?.level === hint.level;

          return (
            <div key={hint.level}>
              {isRevealed ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-2 bg-amber-500/5 border border-amber-500/20 rounded text-xs"
                >
                  <div className="flex items-center gap-1 mb-1 text-amber-400 font-medium">
                    <Lightbulb size={10} />
                    Level {hint.level}: {hint.label}
                  </div>
                  <p className="text-zinc-400 leading-snug">{revealedHints[hint.level]}</p>
                  <p className="text-zinc-600 mt-1 text-[10px]">
                    Score penalty: -{hint.scorePenalty}
                  </p>
                </motion.div>
              ) : isNext ? (
                <button
                  onClick={() => handleRequestHint(hint.level)}
                  className="w-full text-left p-2 border border-zinc-800/40 rounded text-xs hover:border-amber-500/30 transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400 group-hover:text-amber-400 transition-colors">
                      Level {hint.level}: {hint.label}
                    </span>
                    <div className="flex items-center gap-1">
                      <AlertTriangle size={10} className="text-zinc-600" />
                      <span className="text-zinc-600">-{hint.scorePenalty}</span>
                      <ChevronRight size={12} className="text-zinc-600 group-hover:text-amber-400" />
                    </div>
                  </div>
                </button>
              ) : (
                <div className="p-2 border border-zinc-800/20 rounded text-xs text-zinc-700">
                  <span>Level {hint.level}: {hint.label}</span>
                  {!isUsed && (
                    <span className="ml-2 text-zinc-800">(locked)</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
