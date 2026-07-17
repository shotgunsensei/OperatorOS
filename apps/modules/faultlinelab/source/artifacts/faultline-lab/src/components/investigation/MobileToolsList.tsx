import { Lock } from 'lucide-react';
import { getRequiredProductForFeature, hasFeature } from '@/lib/entitlements';
import { premiumTools, type PremiumToolMeta } from './premiumTools';

type Props = {
  onSelect: (tool: PremiumToolMeta) => void;
};

export function MobileToolsList({ onSelect }: Props) {
  return (
    <div className="p-3 space-y-2">
      <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 px-1">
        Premium investigation tools
      </p>
      {premiumTools.map((tool) => {
        const Icon = tool.icon;
        const unlocked = hasFeature(tool.id);
        const required = unlocked ? null : getRequiredProductForFeature(tool.id);
        return (
          <button
            key={tool.id}
            onClick={() => onSelect(tool)}
            className={`w-full text-left rounded-lg border p-3 transition-colors ${
              unlocked
                ? 'border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10'
                : 'border-zinc-800/60 bg-black/20 hover:border-cyan-500/40 hover:bg-cyan-500/5'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`p-2 rounded-md shrink-0 ${
                  unlocked
                    ? 'bg-emerald-500/10 text-emerald-300'
                    : 'bg-cyan-500/10 text-cyan-300'
                }`}
              >
                {unlocked ? <Icon size={16} /> : <Lock size={14} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-zinc-100">
                    {tool.label}
                  </span>
                  <span
                    className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      unlocked
                        ? 'bg-emerald-500/10 text-emerald-300'
                        : 'bg-cyan-500/10 text-cyan-300'
                    }`}
                  >
                    {unlocked ? 'Unlocked' : 'Locked'}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 leading-snug mt-1">
                  {tool.description}
                </p>
                {required && (
                  <p className="text-[11px] text-cyan-300/80 mt-1.5">
                    Included in {required.name}
                  </p>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
