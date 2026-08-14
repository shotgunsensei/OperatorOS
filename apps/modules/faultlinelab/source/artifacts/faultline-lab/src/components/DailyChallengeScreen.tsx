import { motion } from 'framer-motion';
import { useMemo, useSyncExternalStore } from 'react';
import { ArrowLeft, Calendar, Flame, CheckCircle2, Clock, Trophy, Lock } from 'lucide-react';
import { useAppStore } from '@/stores/useAppStore';
import { getDailyEligibleCases } from '@/data/caseCatalog';
import { categoryLabels, difficultyColors } from '@/data/cases';
import { pickDailyCase, getUtcDateKey } from '@/lib/dailyChallenge';
import { getEntitlements, subscribeEntitlements, hasFeature, getRequiredProductForFeature } from '@/lib/entitlements';
import { useUpgradePrompt } from './UpgradePrompt';

export default function DailyChallengeScreen() {
  const setView = useAppStore((s) => s.setView);
  const profile = useAppStore((s) => s.profile);
  const startDailyChallenge = useAppStore((s) => s.startDailyChallenge);
  const { prompt } = useUpgradePrompt();

  // Re-render when entitlements change so eligibility stays current.
  const ent = useSyncExternalStore(
    (cb) => subscribeEntitlements(cb),
    () => getEntitlements()
  );

  const today = getUtcDateKey();
  const eligible = useMemo(
    () => getDailyEligibleCases(),
    // Recompute whenever the entitlement snapshot changes.
    [ent.ownedProductIds, ent.isProUser]
  );
  const todaysCase = useMemo(() => pickDailyCase(eligible), [eligible]);

  const dc = profile.dailyChallenge;
  const completedToday = dc.lastCompletedDateUtc === today;
  const isProDailyAllowed = hasFeature('daily-challenge');
  const dailyProduct = getRequiredProductForFeature('daily-challenge');

  const handleStart = () => {
    if (!todaysCase) return;
    if (!isProDailyAllowed && dailyProduct) {
      prompt({
        productId: dailyProduct.id,
        contextKey: 'daily-challenge',
        reason: 'Daily Challenge rotations are part of Pro Investigator. Unlock to keep your streak going every day.',
      });
      return;
    }
    startDailyChallenge(todaysCase.id);
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
              <Calendar size={18} className="text-cyan-400" />
              <h1 className="font-mono text-base sm:text-lg font-bold text-cyan-400 tracking-wider uppercase">
                Daily Challenge
              </h1>
            </div>
          </div>
          <div className="text-xs text-zinc-500 font-mono">{today} UTC</div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
            <StatCard
              label="Current Streak"
              value={dc.currentStreak}
              icon={<Flame size={16} className="text-orange-400" />}
              accent="text-orange-400"
            />
            <StatCard
              label="Best Streak"
              value={dc.bestStreak}
              icon={<Trophy size={16} className="text-amber-400" />}
              accent="text-amber-400"
            />
            <StatCard
              label="Total Completed"
              value={dc.totalCompleted}
              icon={<CheckCircle2 size={16} className="text-emerald-400" />}
              accent="text-emerald-400"
            />
          </div>

          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-bold text-zinc-100">Today's Investigation</h2>
            {completedToday && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono uppercase tracking-wider">
                <CheckCircle2 size={14} />
                Completed today
              </div>
            )}
          </div>

          {!todaysCase ? (
            <EmptyState
              dailyProduct={dailyProduct}
              isProDailyAllowed={isProDailyAllowed}
              onUpsell={() => {
                if (dailyProduct) {
                  prompt({
                    productId: dailyProduct.id,
                    contextKey: 'daily-challenge:empty',
                    reason: 'You do not own any cases that rotate into the daily slot yet. Unlock Pro Investigator to play the full daily lineup.',
                  });
                } else {
                  setView('store');
                }
              }}
            />
          ) : (
            <div className="bg-[#111822] border border-zinc-800/60 rounded-lg p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
                    {categoryLabels[todaysCase.category]}
                  </div>
                  <h3 className="text-lg font-semibold text-zinc-100">{todaysCase.title}</h3>
                </div>
                {!isProDailyAllowed && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-400/80">
                    <Lock size={14} />
                    Pro
                  </div>
                )}
              </div>
              <p className="text-sm text-zinc-400 mb-4">{todaysCase.shortSummary}</p>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3 text-xs">
                  <span className={`font-medium uppercase tracking-wider ${difficultyColors[todaysCase.difficulty]}`}>
                    {todaysCase.difficulty}
                  </span>
                  <span className="text-zinc-600">|</span>
                  <span className="text-zinc-500 flex items-center gap-1">
                    <Clock size={12} />
                    {todaysCase.estimatedMinutes} min
                  </span>
                </div>
                <button
                  onClick={handleStart}
                  className="px-4 py-2 text-sm font-mono uppercase tracking-wider rounded-md bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 transition-colors"
                >
                  {completedToday ? 'Replay (no streak change)' : 'Start Investigation'}
                </button>
              </div>
              {completedToday && (
                <div className="mt-3 text-[11px] text-zinc-500 font-mono">
                  You already secured today's streak. Replays will not change your daily counters.
                </div>
              )}
            </div>
          )}

          <div className="mt-6 text-[11px] text-zinc-600 font-mono">
            One case rotates per day at 00:00 UTC. Streak resets if you miss a day or misdiagnose.
          </div>
        </motion.div>
      </main>
    </div>
  );
}

function StatCard({ label, value, icon, accent }: { label: string; value: number; icon: React.ReactNode; accent: string }) {
  return (
    <div className="bg-[#111822] border border-zinc-800/40 rounded-lg p-4">
      <div className="flex items-center gap-2 text-xs text-zinc-500 uppercase tracking-wider mb-1">
        {icon}
        {label}
      </div>
      <div className={`text-2xl font-bold font-mono ${accent}`}>{value}</div>
    </div>
  );
}

function EmptyState({
  dailyProduct,
  isProDailyAllowed,
  onUpsell,
}: {
  dailyProduct: ReturnType<typeof getRequiredProductForFeature>;
  isProDailyAllowed: boolean;
  onUpsell: () => void;
}) {
  return (
    <div className="bg-[#111822] border border-zinc-800/40 rounded-lg p-6 text-center">
      <div className="text-zinc-300 mb-2">No daily challenge available</div>
      <p className="text-sm text-zinc-500 mb-4">
        {isProDailyAllowed
          ? 'There are no playable, daily-eligible cases unlocked yet. New packs add cases to the rotation.'
          : 'Daily Challenge rotations require Pro Investigator. Unlock to start a streak today.'}
      </p>
      {dailyProduct && (
        <button
          onClick={onUpsell}
          className="px-4 py-2 text-sm font-mono uppercase tracking-wider rounded-md bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 transition-colors"
        >
          {isProDailyAllowed ? 'Browse packs' : `Unlock ${dailyProduct.name}`}
        </button>
      )}
    </div>
  );
}
