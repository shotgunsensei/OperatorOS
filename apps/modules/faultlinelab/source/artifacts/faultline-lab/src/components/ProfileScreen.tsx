import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '@/stores/useAppStore';
import { categoryLabels } from '@/data/cases';
import { getAllCaseEntries } from '@/data/caseCatalog';
import { getOwnedProducts, subscribeEntitlements, getEntitlements, getCurrentPlanLabel } from '@/lib/entitlements';
import { useSyncExternalStore } from 'react';
import {
  ArrowLeft,
  User,
  Trophy,
  Target,
  Flame,
  Award,
  CheckCircle,
  LogIn,
  Cloud,
  CloudOff,
  Pencil,
  Package,
  Crown,
  Zap,
  Layers,
  ShoppingBag,
  Compass,
} from 'lucide-react';

export default function ProfileScreen() {
  const profile = useAppStore(s => s.profile);
  const setView = useAppStore(s => s.setView);
  const updateProfile = useAppStore(s => s.updateProfile);
  const resumeCase = useAppStore(s => s.resumeCase);
  const isSignedIn = useAppStore(s => s.isSignedIn);
  const authUser = useAppStore(s => s.authUser);
  const updateSettings = useAppStore(s => s.updateSettings);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(profile.name);
  const ent = useSyncExternalStore(
    (cb) => subscribeEntitlements(cb),
    () => getEntitlements()
  );
  const owned = getOwnedProducts().filter(p => p.id !== 'base-free');
  const planLabel = getCurrentPlanLabel();

  const handleSaveName = () => {
    if (nameInput.trim()) {
      updateProfile({ name: nameInput.trim() });
    }
    setEditingName(false);
  };

  const solvedCases = getAllCaseEntries().filter(c =>
    profile.solvedCaseIds.includes(c.id)
  );

  return (
    <div className="min-h-screen bg-[#0a0e14]">
      <header className="border-b border-zinc-800/60 px-4 sm:px-6 py-3 sm:py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button
            onClick={() => setView('incident-board')}
            className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft size={14} />
            Back
          </button>
          <span className="text-xs font-mono text-zinc-600 uppercase tracking-wider">
            Investigator Profile
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-20 sm:pb-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-4 mb-6 sm:mb-8">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0 overflow-hidden">
              {authUser?.avatarUrl ? (
                <img src={authUser.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <User size={28} className="text-cyan-400" />
              )}
            </div>
            <div className="min-w-0">
              {editingName ? (
                <input
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onBlur={handleSaveName}
                  onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                  className="bg-[#111822] border border-zinc-700 rounded px-2 py-1 text-lg text-zinc-100 font-semibold focus:outline-none focus:border-cyan-500/30 w-full max-w-xs"
                  autoFocus
                />
              ) : (
                <button
                  className="flex items-center gap-2 text-lg sm:text-xl font-bold text-zinc-100 hover:text-cyan-300 transition-colors group"
                  onClick={() => setEditingName(true)}
                >
                  <span className="truncate">{profile.name}</span>
                  <Pencil size={14} className="text-zinc-600 group-hover:text-cyan-400 shrink-0 transition-colors" />
                </button>
              )}
              <p className="text-xs sm:text-sm text-zinc-500">
                Active since {new Date(profile.createdAt).toLocaleDateString()}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                {isSignedIn ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-400">
                    <Cloud size={11} />
                    Cloud synced
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-zinc-500">
                    <CloudOff size={11} />
                    Local only
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mb-6 rounded-xl border border-zinc-800/50 bg-[#111822] p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3 gap-2">
              <div className="flex items-center gap-2">
                <Crown size={16} className={ent.isProUser ? 'text-amber-400' : 'text-zinc-500'} />
                <span className="text-sm font-semibold text-zinc-100">{planLabel}</span>
              </div>
              <button
                onClick={() => setView('store')}
                className="text-[11px] font-mono uppercase tracking-wider text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                <ShoppingBag size={12} /> Manage
              </button>
            </div>
            {owned.length === 0 ? (
              <p className="text-xs text-zinc-500">
                You're on the Free Tier. Visit the store to unlock packs, upgrades, or Pro.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {owned.map((p) => {
                  const Icon =
                    p.entitlementType === 'subscription'
                      ? Crown
                      : p.entitlementType === 'feature-upgrade'
                        ? Zap
                        : p.entitlementType === 'bundle'
                          ? Layers
                          : Package;
                  return (
                    <span
                      key={p.id}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-800/60 border border-zinc-700/50 rounded-full text-xs text-zinc-200"
                    >
                      <Icon size={11} className="text-cyan-400" />
                      {p.name}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {!isSignedIn && (
            <div className="mb-6 p-4 bg-cyan-950/20 border border-cyan-800/30 rounded-xl">
              <p className="text-sm text-zinc-300 mb-3">Sign in to sync your progress across devices and unlock purchasing.</p>
              <button
                onClick={() => setView('auth')}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <LogIn size={14} />
                Sign In
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 mb-6 sm:mb-8">
            <StatCard icon={<CheckCircle size={16} />} label="Cases Solved" value={profile.casesSolved} color="text-emerald-400" />
            <StatCard icon={<Trophy size={16} />} label="Total Score" value={profile.totalScore} color="text-cyan-400" />
            <StatCard icon={<Zap size={16} />} label="Chaos Score" value={profile.totalChaosScore} color="text-fuchsia-400" />
            <StatCard icon={<Flame size={16} />} label="Best Streak" value={profile.streakBest} color="text-amber-400" />
            <StatCard icon={<Award size={16} />} label="Achievements" value={profile.achievementsUnlocked.length} color="text-purple-400" />
          </div>

          {profile.achievementsUnlocked.length > 0 && (
            <div className="mb-6 sm:mb-8">
              <h2 className="text-sm font-mono text-zinc-400 uppercase tracking-wider mb-3">
                Achievements
              </h2>
              <div className="flex flex-wrap gap-2">
                {profile.achievementsUnlocked.map(a => (
                  <div
                    key={a}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-full text-xs text-amber-400"
                  >
                    <Trophy size={12} />
                    {a}
                  </div>
                ))}
              </div>
            </div>
          )}

          {solvedCases.length > 0 && (
            <div>
              <h2 className="text-sm font-mono text-zinc-400 uppercase tracking-wider mb-3">
                Solved Cases
              </h2>
              <div className="space-y-2">
                {solvedCases.map(c => (
                  <button
                    key={c.id}
                    onClick={() => resumeCase(c.id)}
                    className="w-full text-left flex items-center justify-between p-3 bg-[#111822] border border-zinc-800/40 rounded-lg hover:border-cyan-500/20 transition-colors"
                  >
                    <div className="min-w-0">
                      <span className="text-sm text-zinc-200 block truncate">{c.title}</span>
                      <span className="text-xs text-zinc-600">
                        {categoryLabels[c.category]}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-2">
                      {profile.bestScores[c.id] !== undefined && (
                        <div className="flex items-center gap-1 text-xs text-cyan-400 font-mono">
                          <Target size={12} />
                          {profile.bestScores[c.id]}
                        </div>
                      )}
                      {profile.bestChaosScores[c.id] !== undefined && (
                        <div
                          className="flex items-center gap-1 text-xs text-fuchsia-400 font-mono"
                          title="Best Chaos Mode score"
                        >
                          <Zap size={12} />
                          {profile.bestChaosScores[c.id]}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 bg-[#111822] border border-zinc-800/40 rounded-lg p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <Compass size={16} className="text-cyan-400" />
                <div>
                  <p className="text-sm text-zinc-200">Replay onboarding tour</p>
                  <p className="text-xs text-zinc-600">
                    Walk through the 4-step intro again
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  updateSettings({ onboardingTourCompletedAt: null });
                  setView('incident-board');
                }}
                className="px-3 py-1.5 rounded text-xs font-mono uppercase bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 transition-colors"
              >
                Replay
              </button>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-[#111822] border border-zinc-800/40 rounded-lg p-3 sm:p-4">
      <div className={`flex items-center gap-1.5 mb-1.5 sm:mb-2 ${color}`}>
        {icon}
        <span className="text-[10px] sm:text-xs uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-xl sm:text-2xl font-bold font-mono text-zinc-100">{value}</div>
    </div>
  );
}
