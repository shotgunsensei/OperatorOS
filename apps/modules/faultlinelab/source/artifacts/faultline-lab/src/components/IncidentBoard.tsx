import { motion } from 'framer-motion';
import { useSyncExternalStore } from 'react';
import { Clock, FlaskConical, Hammer } from 'lucide-react';
import { useAppStore } from '@/stores/useAppStore';
import { getEntitlements, subscribeEntitlements } from '@/lib/entitlements';
import { getAllCaseEntries } from '@/data/caseCatalog';
import EcosystemFooter from './EcosystemFooter';
import { CaseCard } from './incident-board/CaseCard';
import { IncidentBoardHeader } from './incident-board/IncidentBoardHeader';
import { WelcomeBanner } from './incident-board/WelcomeBanner';
import { ProUpsellBanner } from './incident-board/ProUpsellBanner';
import { StatsFooter } from './incident-board/StatsFooter';
import { useFreshnessSnapshot } from './incident-board/useFreshnessSnapshot';
import RenewalBanner from './RenewalBanner';

export default function IncidentBoard() {
  const profile = useAppStore((s) => s.profile);
  const setView = useAppStore((s) => s.setView);
  const isSignedIn = useAppStore((s) => s.isSignedIn);
  const cloudSyncReady = useAppStore((s) => s.cloudSyncReady);
  const ent = useSyncExternalStore(
    (cb) => subscribeEntitlements(cb),
    () => getEntitlements()
  );

  const { previousVisitAt, seenNewCases, authoredEntries, markCaseSeen } =
    useFreshnessSnapshot(isSignedIn, cloudSyncReady);

  const catalogEntries = getAllCaseEntries();
  const playableCount = catalogEntries.filter((e) => e.status === 'playable').length;
  const plannedCount = catalogEntries.filter((e) => e.status === 'planned').length;
  const authoredCount = authoredEntries.length;

  return (
    <div className="min-h-screen bg-[#0a0e14]">
      <IncidentBoardHeader
        profileName={profile.name}
        casesSolved={profile.casesSolved}
        currentStreak={profile.dailyChallenge.currentStreak}
        isSignedIn={isSignedIn}
        isAdmin={!!ent.isAdmin}
        setView={setView}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-20 sm:pb-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <RenewalBanner />

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-zinc-100 mb-2">Incident Board</h2>
            <p className="text-sm text-zinc-500">
              Select a case to investigate. Each incident requires real diagnostic work — use tools, collect evidence, and submit your diagnosis.
            </p>
          </div>

          {profile.casesSolved === 0 && <WelcomeBanner setView={setView} />}

          {profile.casesSolved > 0 && !ent.isProUser && !ent.isAdmin && (
            <ProUpsellBanner setView={setView} />
          )}

          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded text-xs text-cyan-400 font-mono">
              <Clock size={12} />
              {playableCount} playable
            </div>
            {plannedCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded text-xs text-purple-300 font-mono">
                <Hammer size={12} />
                {plannedCount} in development
              </div>
            )}
            {authoredCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-fuchsia-500/10 border border-fuchsia-500/20 rounded text-xs text-fuchsia-300 font-mono">
                <FlaskConical size={12} />
                {authoredCount} sandbox-authored
              </div>
            )}
          </div>

          {authoredCount > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <FlaskConical size={14} className="text-fuchsia-400" />
                <h3 className="text-sm font-mono text-fuchsia-300 uppercase tracking-wider">
                  Your Sandbox Cases
                </h3>
                <span className="text-xs text-zinc-500">
                  Authored locally · ephemeral runs
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {authoredEntries.map((entry) => (
                  <CaseCard
                    key={entry.id}
                    entry={entry}
                    previousVisitAt={previousVisitAt}
                    seenNewCases={seenNewCases}
                    onMarkSeen={markCaseSeen}
                  />
                ))}
              </div>
            </div>
          )}

          {authoredCount > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-mono text-zinc-400 uppercase tracking-wider">
                Catalog
              </h3>
            </div>
          )}
          <div data-tour="case-grid" className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {catalogEntries.map((entry) => (
              <CaseCard
                key={entry.id}
                entry={entry}
                previousVisitAt={previousVisitAt}
                seenNewCases={seenNewCases}
                onMarkSeen={markCaseSeen}
              />
            ))}
          </div>

          {profile.casesSolved > 0 && (
            <StatsFooter
              casesSolved={profile.casesSolved}
              totalScore={profile.totalScore}
              totalChaosScore={profile.totalChaosScore}
              streakBest={profile.streakBest}
              achievementsCount={profile.achievementsUnlocked.length}
            />
          )}
        </motion.div>
      </main>

      <EcosystemFooter />
    </div>
  );
}
