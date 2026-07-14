import { useSyncExternalStore } from 'react';
import { Zap, X } from 'lucide-react';
import {
  loadChaosSettings,
  clearChaosSettings,
  subscribeChaosSettings,
  isChaosActive,
  type ChaosSettings,
} from '@/lib/chaos';

const CHAOS_TOGGLE_LABELS: { key: keyof ChaosSettings; label: string }[] = [
  { key: 'shuffleEvidence', label: 'Shuffle Evidence' },
  { key: 'injectRedHerrings', label: 'Inject Red Herrings' },
  { key: 'timePressure', label: 'Time Pressure' },
  { key: 'hintBlackout', label: 'Hint Blackout' },
];

export function ChaosBadge({ caseId }: { caseId: string }) {
  const chaos = useSyncExternalStore(
    subscribeChaosSettings,
    () => loadChaosSettings(caseId),
    () => loadChaosSettings(caseId)
  );

  if (!isChaosActive(chaos)) return null;

  const activeLabels = CHAOS_TOGGLE_LABELS.filter((t) => chaos[t.key]).map(
    (t) => t.label
  );

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearChaosSettings(caseId);
  };

  const tooltipLines = [
    activeLabels.length > 0
      ? `Modifiers: ${activeLabels.join(', ')}`
      : 'Modifiers: none',
    `Intensity: ×${chaos.intensity.toFixed(1)}`,
  ].join('\n');

  return (
    <span className="relative inline-flex items-center group/chaos z-10">
      <span
        title={tooltipLines}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-[10px] font-mono uppercase tracking-wider text-amber-300"
      >
        <Zap size={10} />
        Chaos
        {activeLabels.length > 0 && (
          <span className="text-amber-400/70">·{activeLabels.length}</span>
        )}
        {chaos.intensity > 1 && (
          <span className="text-amber-400/70">×{chaos.intensity.toFixed(1)}</span>
        )}
      </span>
      <span className="invisible opacity-0 group-hover/chaos:visible group-hover/chaos:opacity-100 transition-opacity absolute bottom-full right-0 mb-1 w-56 p-2 rounded border border-amber-700/40 bg-[#0a0e14] text-[11px] text-amber-100 font-mono shadow-lg z-20 pointer-events-auto block">
        <span className="block mb-1 text-amber-300 uppercase tracking-wider text-[10px]">
          Chaos Mode active
        </span>
        <span className="block text-zinc-300">
          {activeLabels.length > 0 ? activeLabels.join(' · ') : 'No toggles'}
        </span>
        <span className="block text-zinc-400 mt-0.5">
          Intensity ×{chaos.intensity.toFixed(1)}
        </span>
        <span
          role="button"
          tabIndex={0}
          onClick={handleClear}
          className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded border border-zinc-700 hover:border-amber-500/50 hover:text-amber-200 text-zinc-300 text-[10px] uppercase tracking-wider cursor-pointer"
        >
          <X size={10} /> Clear chaos
        </span>
      </span>
    </span>
  );
}
