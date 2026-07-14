import { useMemo } from 'react';
import { BarChart3, Download, Trophy, Target, Clock, Lightbulb, Zap } from 'lucide-react';
import { useAppStore } from '@/stores/useAppStore';
import { loadCaseStates } from '@/lib/persistence';
import { getCaseById, categoryLabels } from '@/data/cases';
import type { CaseCategory } from '@/types';

export default function ProAnalyticsPanel() {
  const profile = useAppStore((s) => s.profile);
  const currentCaseDef = useAppStore((s) => s.currentCaseDef);
  const currentCaseState = useAppStore((s) => s.currentCaseState);

  const stats = useMemo(() => {
    const states = loadCaseStates();
    const completed = Object.values(states).filter((s) => s.status === 'debriefed' && s.completedAt);

    const byCategory = new Map<CaseCategory, { solved: number; bestScoreSum: number; bestScoreCount: number }>();
    for (const id of profile.solvedCaseIds) {
      const def = getCaseById(id);
      if (!def) continue;
      const entry = byCategory.get(def.category) || { solved: 0, bestScoreSum: 0, bestScoreCount: 0 };
      entry.solved += 1;
      const score = profile.bestScores[id];
      if (typeof score === 'number') {
        entry.bestScoreSum += score;
        entry.bestScoreCount += 1;
      }
      byCategory.set(def.category, entry);
    }

    const times = completed
      .filter((s) => s.completedAt)
      .map((s) => ({
        caseId: s.caseId,
        minutes: Math.max(1, Math.round(((s.completedAt as number) - s.startedAt) / 60000)),
        hints: s.hintsUsed.length,
        completedAt: s.completedAt as number,
      }))
      .sort((a, b) => a.completedAt - b.completedAt);

    const totalHints = times.reduce((a, t) => a + t.hints, 0);
    const avgHints = times.length ? totalHints / times.length : 0;
    const avgTime = times.length ? times.reduce((a, t) => a + t.minutes, 0) / times.length : 0;

    return { byCategory, times, avgHints, avgTime, completed };
  }, [profile]);

  const categories = Array.from(stats.byCategory.entries());
  const maxSolved = Math.max(1, ...categories.map(([, v]) => v.solved));
  const maxTime = Math.max(1, ...stats.times.map((t) => t.minutes));

  const exportReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      profile,
      currentCase: currentCaseDef
        ? {
            id: currentCaseDef.id,
            title: currentCaseDef.title,
            category: currentCaseDef.category,
            startedAt: currentCaseState?.startedAt,
            evidenceUnlocked: currentCaseState?.unlockedEvidence,
            commands: currentCaseState?.totalCommands,
            hintsUsed: currentCaseState?.hintsUsed,
          }
        : null,
      categoryBreakdown: Object.fromEntries(stats.byCategory),
      caseTimes: stats.times,
      avgTimeMinutes: stats.avgTime,
      avgHintsPerCase: stats.avgHints,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `faultline-report-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-[#0c1017] rounded-lg border border-cyan-900/30 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-[#111822] border-b border-zinc-800/50">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-cyan-400" />
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
            Pro Analytics
          </span>
        </div>
        <button
          onClick={exportReport}
          className="flex items-center gap-1 px-2 py-1 text-xs text-cyan-200 border border-cyan-500/40 rounded hover:bg-cyan-500/10"
        >
          <Download size={12} /> Export report
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Stat icon={Trophy} label="Cases solved" value={profile.casesSolved.toString()} accent="text-emerald-300" />
          <Stat icon={Target} label="Total score" value={profile.totalScore.toString()} accent="text-cyan-300" />
          <Stat icon={Zap} label="Chaos score" value={profile.totalChaosScore.toString()} accent="text-fuchsia-300" />
          <Stat icon={Clock} label="Avg time" value={`${stats.avgTime.toFixed(1)}m`} accent="text-purple-300" />
          <Stat icon={Lightbulb} label="Avg hints" value={stats.avgHints.toFixed(1)} accent="text-amber-300" />
        </div>

        <div className="bg-[#0a0e14] border border-zinc-800/50 rounded p-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">
            Mastery by category
          </div>
          {categories.length === 0 && (
            <div className="text-xs text-zinc-600">Solve a case to see mastery scores.</div>
          )}
          <div className="space-y-2">
            {categories.map(([cat, v]) => {
              const avg = v.bestScoreCount ? v.bestScoreSum / v.bestScoreCount : 0;
              return (
                <div key={cat}>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-zinc-300">{categoryLabels[cat] || cat}</span>
                    <span className="text-zinc-500 font-mono">
                      {v.solved} solved · avg {avg.toFixed(0)}
                    </span>
                  </div>
                  <div className="h-2 bg-zinc-800/50 rounded overflow-hidden">
                    <div
                      className="h-full bg-cyan-500/70"
                      style={{ width: `${(v.solved / maxSolved) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-[#0a0e14] border border-zinc-800/50 rounded p-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">
            Time-to-diagnosis trend
          </div>
          {stats.times.length === 0 ? (
            <div className="text-xs text-zinc-600">Complete cases to chart your trend.</div>
          ) : (
            <svg viewBox="0 0 320 80" className="w-full h-20">
              <polyline
                fill="none"
                stroke="#22d3ee"
                strokeWidth="1.5"
                points={stats.times
                  .map(
                    (t, i) =>
                      `${(i / Math.max(1, stats.times.length - 1)) * 320},${80 - (t.minutes / maxTime) * 70}`
                  )
                  .join(' ')}
              />
              {stats.times.map((t, i) => (
                <circle
                  key={i}
                  cx={(i / Math.max(1, stats.times.length - 1)) * 320}
                  cy={80 - (t.minutes / maxTime) * 70}
                  r={2}
                  fill={t.hints > 1 ? '#fbbf24' : '#22d3ee'}
                >
                  <title>{`${t.caseId}: ${t.minutes}m · ${t.hints} hints`}</title>
                </circle>
              ))}
            </svg>
          )}
        </div>

        <div className="bg-[#0a0e14] border border-zinc-800/50 rounded p-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">
            Recent investigations
          </div>
          <div className="space-y-1 text-[11px] font-mono">
            {stats.times.slice(-6).reverse().map((t) => {
              const def = getCaseById(t.caseId);
              return (
                <div key={t.completedAt} className="flex justify-between text-zinc-400">
                  <span className="truncate">{def?.title || t.caseId}</span>
                  <span className="text-zinc-500">
                    {t.minutes}m · {t.hints} hints
                  </span>
                </div>
              );
            })}
            {stats.times.length === 0 && <div className="text-zinc-600">No completed cases yet.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Trophy;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="bg-[#0a0e14] border border-zinc-800/50 rounded p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={12} className={accent} />
        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">{label}</span>
      </div>
      <div className={`text-xl font-mono ${accent}`}>{value}</div>
    </div>
  );
}
