import { motion } from 'framer-motion';
import { useAppStore } from '@/stores/useAppStore';
import { recommendForCase } from '@/lib/recommendations';
import EcosystemCrossPromo from './EcosystemCrossPromo';
import EcosystemFooter from './EcosystemFooter';
import { ArrowLeft } from 'lucide-react';
import { ScoreSummary } from './debrief/ScoreSummary';
import { DebriefSections } from './debrief/DebriefSections';
import { NextCaseRecommendations } from './debrief/NextCaseRecommendations';

export default function DebriefScreen() {
  const currentCaseDef = useAppStore(s => s.currentCaseDef);
  const currentCaseState = useAppStore(s => s.currentCaseState);
  const exitCase = useAppStore(s => s.exitCase);
  const restartCase = useAppStore(s => s.restartCase);
  const profile = useAppStore(s => s.profile);
  const toolUsageSignals = useAppStore(s => s.toolUsageSignals);
  const openStoreWithProduct = useAppStore(s => s.openStoreWithProduct);

  if (!currentCaseDef || !currentCaseState?.debrief) return null;

  const recommendations = recommendForCase(currentCaseDef, profile, toolUsageSignals, 2);
  const debrief = currentCaseState.debrief;

  return (
    <div className="min-h-screen bg-[#0a0e14]">
      <header className="border-b border-zinc-800/60 px-4 sm:px-6 py-3 sm:py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button
            onClick={exitCase}
            className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft size={14} />
            <span className="hidden sm:inline">Back to Incident Board</span>
            <span className="sm:hidden">Back</span>
          </button>
          <span className="text-xs font-mono text-zinc-600">Case Debrief</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-20 sm:pb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <ScoreSummary debrief={debrief} caseState={currentCaseState} caseDef={currentCaseDef} />

          <DebriefSections debrief={debrief} />

          <NextCaseRecommendations
            recommendations={recommendations}
            onOpen={openStoreWithProduct}
          />

          <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
            <button
              onClick={exitCase}
              className="px-6 sm:px-8 py-3 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono text-xs sm:text-sm uppercase tracking-widest rounded hover:bg-cyan-500/20 transition-colors"
            >
              Return to Incident Board
            </button>
            <button
              onClick={() => restartCase(currentCaseDef.id)}
              className="px-6 sm:px-8 py-3 bg-zinc-800/50 border border-zinc-700/50 text-zinc-400 font-mono text-xs sm:text-sm uppercase tracking-widest rounded hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            >
              Replay Case
            </button>
          </div>

          <EcosystemCrossPromo category={currentCaseDef.category} />
        </motion.div>
      </main>
      <EcosystemFooter variant="compact" />
    </div>
  );
}
