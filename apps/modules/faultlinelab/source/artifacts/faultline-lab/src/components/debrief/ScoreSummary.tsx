import type { Debrief, CaseState, CaseDefinition } from '@/types';
import { Target, Search, Wrench, Zap, Lightbulb, Clock } from 'lucide-react';
import { getCaseEntryById } from '@/data/caseCatalog';
import { CaseAuthorAvatar } from '../CaseAuthorAvatar';
import { tierConfig } from './tierConfig';

interface ScoreSummaryProps {
  debrief: Debrief;
  caseState: CaseState;
  caseDef: CaseDefinition;
}

export function ScoreSummary({ debrief, caseState, caseDef }: ScoreSummaryProps) {
  const score = debrief.scoreBreakdown;
  const config = tierConfig[score.tier];
  const timeMinutes = Math.floor(debrief.totalTime / 60000);
  const catalogEntry = getCaseEntryById(caseDef.id);
  const avatarEntry = catalogEntry ?? {
    title: caseDef.title,
    authorImagePath: undefined,
  };

  return (
    <>
      <div data-tour="debrief-summary" className={`text-center py-6 sm:py-8 mb-6 sm:mb-8 rounded-lg border ${config.bg} ${config.border}`}>
        <div className={`${config.color} mb-3 flex justify-center`}>
          {config.icon}
        </div>
        <h1 className={`text-2xl sm:text-3xl font-bold ${config.color} mb-1`}>
          {score.tier}
        </h1>
        <div className="text-4xl sm:text-5xl font-bold text-zinc-100 font-mono mb-2">
          {score.total}
          <span className="text-lg sm:text-xl text-zinc-600">/{score.maxPossible}</span>
        </div>
        <div className="mt-1 flex items-center justify-center gap-2">
          <CaseAuthorAvatar entry={avatarEntry} size={28} />
          <p className="text-xs sm:text-sm text-zinc-500">{caseDef.title}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <ScoreCard icon={<Target size={16} />} label="Diagnosis" value={score.diagnosisAccuracy} max={40} color="text-cyan-400" />
        <ScoreCard icon={<Search size={16} />} label="Evidence" value={score.evidenceQuality} max={25} color="text-blue-400" />
        <ScoreCard icon={<Wrench size={16} />} label="Remediation" value={score.remediationQuality} max={20} color="text-emerald-400" />
        <ScoreCard icon={<Zap size={16} />} label="Efficiency" value={score.efficiency} max={15} color="text-amber-400" />
        <ScoreCard icon={<Lightbulb size={16} />} label="Hint Penalty" value={-score.hintPenalty} max={0} color="text-red-400" negative />
        <ScoreCard icon={<Clock size={16} />} label="Time" value={timeMinutes} max={0} color="text-zinc-400" suffix=" min" />
      </div>

      {(score.timePenalty > 0 || score.chaosMultiplier > 1) && (
        <div className="mb-8 p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={14} className="text-amber-400" />
            <span className="text-xs font-mono text-amber-300 uppercase tracking-wider">
              Chaos Mode adjustments
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            {caseState.chaos && (
              <div className="text-zinc-400">
                <div className="text-zinc-500">Intensity</div>
                <div className="font-mono text-amber-200">×{caseState.chaos.intensity.toFixed(1)}</div>
              </div>
            )}
            {score.timePenalty > 0 && (
              <div className="text-zinc-400">
                <div className="text-zinc-500">Time penalty</div>
                <div className="font-mono text-red-300">-{score.timePenalty}</div>
              </div>
            )}
            {score.chaosMultiplier > 1 && (
              <div className="text-zinc-400">
                <div className="text-zinc-500">Score multiplier</div>
                <div className="font-mono text-emerald-300">
                  ×{score.chaosMultiplier.toFixed(2)} (base {score.baseTotal})
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function ScoreCard({
  icon,
  label,
  value,
  max,
  color,
  negative,
  suffix,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  max: number;
  color: string;
  negative?: boolean;
  suffix?: string;
}) {
  return (
    <div className="bg-[#111822] border border-zinc-800/40 rounded-lg p-3">
      <div className={`flex items-center gap-1.5 mb-1 ${color}`}>
        {icon}
        <span className="text-xs uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-xl font-bold font-mono text-zinc-100">
        {negative && value !== 0 ? value : value}
        {suffix || (max > 0 ? <span className="text-sm text-zinc-600">/{max}</span> : '')}
      </div>
    </div>
  );
}
