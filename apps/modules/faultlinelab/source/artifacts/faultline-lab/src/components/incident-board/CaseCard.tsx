import { motion } from 'framer-motion';
import { useAppStore } from '@/stores/useAppStore';
import { categoryLabels, difficultyColors } from '@/data/cases';
import {
  isCaseAccessible,
  getRequiredProductForCase,
  getPackForCase,
} from '@/lib/entitlements';
import { useUpgradePrompt } from '../UpgradePrompt';
import type { CaseCatalogEntry } from '@/data/caseCatalog';
import { isAuthoredEntry } from '@/lib/sandboxScenarios';
import { isCaseNewSince } from '@/lib/incidentFreshness';
import {
  Monitor,
  Network,
  Car,
  Cpu,
  Server,
  Layers,
  Trophy,
  CheckCircle,
  Clock,
  AlertTriangle,
  Lock,
  Hammer,
  FlaskConical,
} from 'lucide-react';
import { ChaosBadge } from './ChaosBadge';
import { CaseAuthorAvatar } from '../CaseAuthorAvatar';

const categoryIconMap: Record<string, React.ReactNode> = {
  'windows-ad': <Monitor size={20} />,
  networking: <Network size={20} />,
  automotive: <Car size={20} />,
  electronics: <Cpu size={20} />,
  servers: <Server size={20} />,
  mixed: <Layers size={20} />,
};

export function CaseCard({
  entry,
  previousVisitAt,
  seenNewCases,
  onMarkSeen,
}: {
  entry: CaseCatalogEntry;
  previousVisitAt?: number | null;
  seenNewCases?: Record<string, number>;
  onMarkSeen?: (caseId: string) => void;
}) {
  const startCase = useAppStore((s) => s.startCase);
  const startSandboxRun = useAppStore((s) => s.startSandboxRun);
  const resumeCase = useAppStore((s) => s.resumeCase);
  const restartCase = useAppStore((s) => s.restartCase);
  const setView = useAppStore((s) => s.setView);
  const isSolved = useAppStore((s) => s.isCaseSolved(entry.id));
  const bestScore = useAppStore((s) => s.getCaseScore(entry.id));
  const authored = isAuthoredEntry(entry);
  // Author-built scenarios bypass entitlement gates entirely — they are the
  // user's own content and should always be runnable for them.
  const accessible = authored ? true : isCaseAccessible(entry.id);
  const isPlanned = entry.status === 'planned';
  const isPlayable = entry.status === 'playable' && accessible;
  const requiredProduct = !accessible ? getRequiredProductForCase(entry.id) : null;
  const sourcePack = !entry.isStarter ? getPackForCase(entry.id) : null;
  const { prompt } = useUpgradePrompt();
  const showNewBadge =
    isPlayable &&
    !isSolved &&
    isCaseNewSince(entry.id, authored, previousVisitAt, seenNewCases);

  const handleClick = () => {
    if (showNewBadge && onMarkSeen) onMarkSeen(entry.id);
    if (isPlanned) {
      // Promote upsell for the owning pack instead of trying to start the case.
      if (requiredProduct) {
        prompt({
          productId: requiredProduct.id,
          contextKey: `case:${entry.id}`,
          reason: `"${entry.title}" is part of ${requiredProduct.name}, which is in development. Reserve your slot to be notified at launch.`,
        });
      } else {
        setView('store');
      }
      return;
    }
    if (!accessible) {
      if (requiredProduct) {
        prompt({
          productId: requiredProduct.id,
          contextKey: `case:${entry.id}`,
          reason: `"${entry.title}" is part of ${requiredProduct.name}. Unlock it to start the investigation.`,
        });
      } else {
        setView('store');
      }
      return;
    }
    if (authored) {
      // Sandbox-authored runs are ephemeral so playtesting never pollutes
      // the author's profile, scores, or streaks.
      startSandboxRun(entry.id);
      return;
    }
    if (isSolved) {
      resumeCase(entry.id);
    } else {
      startCase(entry.id);
    }
  };

  const handleReplay = (e: React.MouseEvent) => {
    e.stopPropagation();
    restartCase(entry.id);
  };

  const cardBorderClass = isPlayable
    ? 'border-zinc-800/60 hover:border-cyan-500/30'
    : isPlanned
    ? 'border-zinc-800/30 opacity-70 hover:opacity-90 hover:border-purple-500/30'
    : 'border-zinc-800/30 opacity-70 hover:opacity-90 hover:border-amber-500/30';

  const titleHoverClass = isPlayable
    ? 'text-zinc-100 group-hover:text-cyan-300'
    : isPlanned
    ? 'text-zinc-400 group-hover:text-purple-300'
    : 'text-zinc-400 group-hover:text-amber-300';

  return (
    <motion.button
      onClick={handleClick}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      className={`w-full text-left bg-[#111822] border rounded-lg p-5 transition-all duration-300 group relative overflow-hidden ${cardBorderClass}`}
    >
      {authored && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5 text-[10px] text-fuchsia-300 font-mono uppercase tracking-wider">
          <FlaskConical size={12} />
          Sandbox
        </div>
      )}
      {!authored && isSolved && isPlayable && (
        <div className="absolute top-3 right-3">
          <CheckCircle size={18} className="text-emerald-400" />
        </div>
      )}
      {isPlanned && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5 text-[10px] text-purple-300/80 font-mono uppercase tracking-wider">
          <Hammer size={12} />
          In Development
        </div>
      )}
      {!isPlanned && !accessible && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5 text-xs text-amber-400/80">
          <Lock size={14} />
        </div>
      )}

      <div className="flex items-center gap-3 mb-3">
        <CaseAuthorAvatar entry={entry} size={40} />
        <div className={`p-2 rounded shrink-0 ${isPlayable ? 'bg-zinc-800/60 text-cyan-400' : 'bg-zinc-800/40 text-zinc-500'}`}>
          {categoryIconMap[entry.category]}
        </div>
        <div className="min-w-0">
          <div className="text-xs text-zinc-500 uppercase tracking-wider">
            {categoryLabels[entry.category]}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={`text-base font-semibold transition-colors ${titleHoverClass}`}>
              {entry.title}
            </h3>
            {showNewBadge && (
              <span
                aria-label="New since your last visit"
                className="px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              >
                New
              </span>
            )}
          </div>
        </div>
      </div>

      <p className="text-sm text-zinc-400 mb-4 line-clamp-2">
        {entry.shortSummary}
      </p>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span
            className={`text-xs font-medium uppercase tracking-wider ${isPlayable ? difficultyColors[entry.difficulty] : 'text-zinc-600'}`}
          >
            {entry.difficulty}
          </span>
          <span className="text-xs text-zinc-600">|</span>
          <span className="text-xs text-zinc-500 flex items-center gap-1">
            <Clock size={12} />
            {entry.estimatedMinutes} min
          </span>
          {entry.previewSymptoms.length > 0 && (
            <>
              <span className="text-xs text-zinc-600">|</span>
              <span className="text-xs text-zinc-500 flex items-center gap-1">
                <AlertTriangle size={12} />
                {entry.previewSymptoms.length} signal{entry.previewSymptoms.length === 1 ? '' : 's'}
              </span>
            </>
          )}
          {isPlayable && <ChaosBadge caseId={entry.id} />}
        </div>

        <div className="flex items-center gap-3">
          {isPlanned && requiredProduct && (
            <span className="text-[11px] text-purple-300/80 font-mono">
              {requiredProduct.name}
            </span>
          )}
          {!isPlanned && !accessible && requiredProduct && (
            <span className="text-[11px] text-amber-400/70 font-mono">
              {requiredProduct.pricingType === 'free' ? 'Requires upgrade' : `${requiredProduct.name}`}
            </span>
          )}
          {isPlayable && sourcePack && (
            <span className="text-[11px] text-cyan-400/70 font-mono">
              {sourcePack.name}
            </span>
          )}
          {isPlayable && isSolved && (
            <span
              onClick={handleReplay}
              className="text-xs text-zinc-600 hover:text-cyan-400 transition-colors cursor-pointer z-10 px-2 py-1 -my-1"
            >
              Replay
            </span>
          )}
          {bestScore !== undefined && (
            <div className="flex items-center gap-1 text-xs text-amber-400">
              <Trophy size={12} />
              {bestScore}
            </div>
          )}
        </div>
      </div>

      <div className={`absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent to-transparent transition-all duration-500 ${
        isPlayable
          ? 'via-cyan-500/0 group-hover:via-cyan-500/40'
          : isPlanned
          ? 'via-purple-500/0 group-hover:via-purple-500/30'
          : 'via-amber-500/0 group-hover:via-amber-500/30'
      }`} />
    </motion.button>
  );
}
