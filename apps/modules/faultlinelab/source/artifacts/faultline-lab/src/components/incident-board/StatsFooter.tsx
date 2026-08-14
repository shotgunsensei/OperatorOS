import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';

interface StatsFooterProps {
  casesSolved: number;
  totalScore: number;
  totalChaosScore: number;
  streakBest: number;
  achievementsCount: number;
}

export function StatsFooter({
  casesSolved,
  totalScore,
  totalChaosScore,
  streakBest,
  achievementsCount,
}: StatsFooterProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
      className="mt-8 p-4 bg-[#111822] border border-zinc-800/40 rounded-lg"
    >
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-6">
          <div>
            <div className="text-xs text-zinc-500 uppercase tracking-wider">Cases Solved</div>
            <div className="text-xl font-bold text-zinc-100 font-mono">{casesSolved}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500 uppercase tracking-wider">Total Score</div>
            <div className="text-xl font-bold text-cyan-400 font-mono">{totalScore}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500 uppercase tracking-wider">Chaos Score</div>
            <div className="text-xl font-bold text-fuchsia-400 font-mono">{totalChaosScore}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500 uppercase tracking-wider">Best Streak</div>
            <div className="text-xl font-bold text-amber-400 font-mono">{streakBest}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Trophy size={14} className="text-amber-400" />
          {achievementsCount} achievements
        </div>
      </div>
    </motion.div>
  );
}
