import { motion } from 'framer-motion';
import { useMemo, useSyncExternalStore } from 'react';
import { ArrowLeft, Hammer, Clock, AlertTriangle, Lock, FlaskConical } from 'lucide-react';
import { useAppStore } from '@/stores/useAppStore';
import { getSandboxEligibleCases } from '@/data/caseCatalog';
import type { CaseCatalogEntry } from '@/data/caseCatalog';
import { categoryLabels, difficultyColors } from '@/data/cases';
import {
  getEntitlements,
  subscribeEntitlements,
  hasFeature,
  getRequiredProductForFeature,
} from '@/lib/entitlements';
import { useUpgradePrompt } from './UpgradePrompt';

export default function SandboxScreen() {
  const setView = useAppStore((s) => s.setView);
  const startSandboxRun = useAppStore((s) => s.startSandboxRun);
  const { prompt } = useUpgradePrompt();

  // Re-render when entitlements change so eligibility stays current.
  const ent = useSyncExternalStore(
    (cb) => subscribeEntitlements(cb),
    () => getEntitlements()
  );

  // Sandbox is a Pro-tier playground. The selector still filters by ownership,
  // so non-Pro users with sandbox-eligible owned cases would technically have
  // some entries — but the screen itself is gated behind Pro for clarity.
  // Use a single canonical Pro feature flag so entitlement drift can't
  // accidentally widen access here.
  const SANDBOX_FEATURE_ID = 'full-archive';
  const sandboxAllowed = hasFeature(SANDBOX_FEATURE_ID);
  const sandboxProduct = getRequiredProductForFeature(SANDBOX_FEATURE_ID);
  const cases = useMemo<CaseCatalogEntry[]>(
    () => getSandboxEligibleCases(),
    [ent.ownedProductIds, ent.isProUser]
  );

  const handleLaunch = (entry: CaseCatalogEntry) => {
    if (!sandboxAllowed) {
      if (sandboxProduct) {
        prompt({
          productId: sandboxProduct.id,
          contextKey: 'sandbox',
          reason: 'Sandbox practice runs are part of Pro Investigator. Unlock to replay any unlocked case freely without affecting your scores or streak.',
        });
      } else {
        setView('store');
      }
      return;
    }
    startSandboxRun(entry.id);
  };

  return (
    <div className="min-h-screen bg-[#0a0e14]">
      <header className="border-b border-zinc-800/60 px-4 sm:px-6 py-3 sm:py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView('incident-board')}
              className="p-2 -ml-2 text-zinc-400 hover:text-zinc-200 transition-colors rounded-md hover:bg-zinc-800/50"
              aria-label="Back to incident board"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="flex items-center gap-2">
              <FlaskConical size={18} className="text-purple-400" />
              <h1 className="font-mono text-base sm:text-lg font-bold text-purple-400 tracking-wider uppercase">
                Sandbox
              </h1>
            </div>
          </div>
          <div className="text-xs text-zinc-500 font-mono uppercase tracking-wider">No score</div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-zinc-100 mb-2">Free practice runs</h2>
            <p className="text-sm text-zinc-500">
              Replay any sandbox-eligible scenario as many times as you want. Sandbox runs do not
              update your scores, streaks, or achievements.
            </p>
          </div>

          {!sandboxAllowed && (
            <div className="mb-6 bg-purple-500/5 border border-purple-500/20 rounded-lg p-4 flex items-start gap-3">
              <Lock size={16} className="text-purple-300 mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="text-sm text-purple-200 font-medium mb-1">
                  Sandbox is a Pro feature
                </div>
                <p className="text-xs text-zinc-400 mb-3">
                  Unlock Pro Investigator to launch any unlocked case as a no-stakes practice run.
                </p>
                {sandboxProduct && (
                  <button
                    onClick={() =>
                      prompt({
                        productId: sandboxProduct.id,
                        contextKey: 'sandbox',
                        reason: 'Sandbox practice runs are part of Pro Investigator. Unlock to replay any unlocked case freely without affecting your scores or streak.',
                      })
                    }
                    className="px-3 py-1.5 text-xs font-mono uppercase tracking-wider rounded-md bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/40 transition-colors"
                  >
                    Unlock {sandboxProduct.name}
                  </button>
                )}
              </div>
            </div>
          )}

          {cases.length === 0 ? (
            <div className="bg-[#111822] border border-zinc-800/40 rounded-lg p-6 text-center">
              <Hammer size={20} className="text-zinc-600 mx-auto mb-2" />
              <div className="text-zinc-300 mb-1">No sandbox cases yet</div>
              <p className="text-sm text-zinc-500">
                Sandbox-eligible scenarios from upcoming packs will appear here as they become
                playable.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {cases.map((entry) => (
                <SandboxCard
                  key={entry.id}
                  entry={entry}
                  disabled={!sandboxAllowed}
                  onLaunch={() => handleLaunch(entry)}
                />
              ))}
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}

function SandboxCard({
  entry,
  disabled,
  onLaunch,
}: {
  entry: CaseCatalogEntry;
  disabled: boolean;
  onLaunch: () => void;
}) {
  return (
    <motion.button
      onClick={onLaunch}
      whileHover={{ scale: 1.01, y: -1 }}
      whileTap={{ scale: 0.99 }}
      className={`w-full text-left bg-[#111822] border rounded-lg p-5 transition-all duration-300 group relative overflow-hidden ${
        disabled
          ? 'border-zinc-800/30 opacity-70 hover:border-purple-500/30'
          : 'border-zinc-800/60 hover:border-purple-500/40'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
            {categoryLabels[entry.category]}
          </div>
          <h3 className="text-base font-semibold text-zinc-100 group-hover:text-purple-300 transition-colors">
            {entry.title}
          </h3>
        </div>
        {disabled ? (
          <Lock size={14} className="text-amber-400/80 shrink-0 mt-1" />
        ) : (
          <span className="text-[10px] text-purple-300/80 font-mono uppercase tracking-wider">
            Free run
          </span>
        )}
      </div>
      <p className="text-sm text-zinc-400 mb-3 line-clamp-2">{entry.shortSummary}</p>
      <div className="flex items-center gap-3 text-xs">
        <span className={`font-medium uppercase tracking-wider ${difficultyColors[entry.difficulty]}`}>
          {entry.difficulty}
        </span>
        <span className="text-zinc-600">|</span>
        <span className="text-zinc-500 flex items-center gap-1">
          <Clock size={12} />
          {entry.estimatedMinutes} min
        </span>
        {entry.previewSymptoms.length > 0 && (
          <>
            <span className="text-zinc-600">|</span>
            <span className="text-zinc-500 flex items-center gap-1">
              <AlertTriangle size={12} />
              {entry.previewSymptoms.length} signal{entry.previewSymptoms.length === 1 ? '' : 's'}
            </span>
          </>
        )}
      </div>
    </motion.button>
  );
}
