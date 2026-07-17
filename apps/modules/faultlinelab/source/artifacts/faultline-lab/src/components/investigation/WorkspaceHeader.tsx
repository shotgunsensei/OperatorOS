import { ArrowLeft, Briefcase, Clock, Save, Send, Zap } from 'lucide-react';
import { categoryLabels, difficultyColors } from '@/data/cases';
import type { CaseDefinition } from '@/types';
import type { Countdown } from './useCaseTimer';

type Props = {
  currentCaseDef: CaseDefinition;
  elapsed: string;
  countdown: Countdown | null;
  onExit: () => void;
  onShowBriefing: () => void;
  onToggleDiagnosis: () => void;
};

export function WorkspaceHeader({
  currentCaseDef,
  elapsed,
  countdown,
  onExit,
  onShowBriefing,
  onToggleDiagnosis,
}: Props) {
  return (
    <header className="flex items-center justify-between px-3 sm:px-4 py-2 bg-[#111822] border-b border-zinc-800/50 gap-2">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <button
          onClick={onExit}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
        >
          <ArrowLeft size={14} />
          <span className="hidden sm:inline">Exit</span>
        </button>

        <div className="h-4 w-px bg-zinc-800 hidden sm:block" />

        <div className="min-w-0">
          <h1 className="text-xs sm:text-sm font-semibold text-zinc-100 truncate">
            {currentCaseDef.title}
          </h1>
          <div className="hidden sm:flex items-center gap-2 text-xs">
            <span className="text-zinc-500">
              {categoryLabels[currentCaseDef.category]}
            </span>
            <span className="text-zinc-700">|</span>
            <span
              className={`uppercase tracking-wider ${difficultyColors[currentCaseDef.difficulty]}`}
            >
              {currentCaseDef.difficulty}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        <button
          onClick={onShowBriefing}
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <Briefcase size={12} />
          <span className="hidden md:inline">Briefing</span>
        </button>

        <div className="flex items-center gap-1 text-xs font-mono text-zinc-500">
          <Clock size={12} />
          {elapsed}
        </div>

        {countdown && (
          <div
            className={`flex items-center gap-1 px-2 py-0.5 text-xs font-mono rounded border ${
              countdown.overtime
                ? 'border-red-500/40 bg-red-500/10 text-red-300'
                : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
            }`}
            title={
              countdown.overtime
                ? 'Overtime — losing efficiency points'
                : 'Chaos Mode time pressure'
            }
          >
            <Zap size={12} />
            {countdown.label}
          </div>
        )}

        <div className="hidden sm:flex items-center gap-1 text-xs font-mono text-zinc-600">
          <Save size={12} />
          saved
        </div>

        <button
          onClick={onToggleDiagnosis}
          className="flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono uppercase tracking-wider rounded hover:bg-cyan-500/20 transition-colors"
        >
          <Send size={12} />
          <span className="hidden sm:inline">Submit Diagnosis</span>
          <span className="sm:hidden">Submit</span>
        </button>
      </div>
    </header>
  );
}
