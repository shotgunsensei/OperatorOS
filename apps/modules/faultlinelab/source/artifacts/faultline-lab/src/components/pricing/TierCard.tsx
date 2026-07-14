import { Crown, Layers, Sparkles } from 'lucide-react';

export type TierKey = 'free' | 'pro' | 'bundle';

interface TierCardProps {
  tier: TierKey;
  title: string;
  price: string;
  cadence: string;
  tagline: string;
  cta: string;
  disabled: boolean;
  highlight: boolean;
  onClick: () => void;
  ownedLabel: string | null;
}

export function TierCard({
  tier,
  title,
  price,
  cadence,
  tagline,
  cta,
  disabled,
  highlight,
  onClick,
  ownedLabel,
}: TierCardProps) {
  const accent =
    tier === 'pro'
      ? 'border-cyan-500/40 bg-gradient-to-br from-cyan-950/40 via-zinc-900/60 to-zinc-900/30'
      : tier === 'bundle'
        ? 'border-amber-500/30 bg-gradient-to-br from-amber-950/20 via-zinc-900/60 to-zinc-900/30'
        : 'border-zinc-800 bg-zinc-900/40';
  const textAccent =
    tier === 'pro'
      ? 'text-cyan-300'
      : tier === 'bundle'
        ? 'text-amber-300'
        : 'text-zinc-300';
  const ctaClass = disabled
    ? 'bg-zinc-800/60 text-zinc-500 border-zinc-700 cursor-not-allowed'
    : tier === 'pro'
      ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/25'
      : tier === 'bundle'
        ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25'
        : 'bg-zinc-800/60 text-zinc-200 border-zinc-700 hover:bg-zinc-800';
  const Icon = tier === 'bundle' ? Layers : tier === 'pro' ? Crown : Sparkles;

  return (
    <div
      className={`relative flex flex-col rounded-xl border p-6 ${accent} ${
        highlight ? 'ring-1 ring-cyan-500/30' : ''
      }`}
    >
      {highlight && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-cyan-200 bg-cyan-500/20 border border-cyan-500/40 rounded">
          Most popular
        </div>
      )}
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${textAccent}`} />
        <h3 className={`font-mono uppercase tracking-wider text-sm ${textAccent}`}>{title}</h3>
        {ownedLabel && (
          <span className="ml-auto text-[10px] font-mono uppercase tracking-wider text-emerald-300 border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 rounded">
            {ownedLabel}
          </span>
        )}
      </div>
      <div className="font-mono text-3xl text-zinc-100 mb-1">{price}</div>
      <div className="text-[11px] text-zinc-500 mb-4">{cadence}</div>
      <p className="text-sm text-zinc-400 leading-relaxed mb-6 flex-1">{tagline}</p>
      <button
        onClick={onClick}
        disabled={disabled}
        className={`w-full py-2.5 text-xs font-mono uppercase tracking-wider rounded border transition-colors ${ctaClass}`}
      >
        {cta}
      </button>
    </div>
  );
}
