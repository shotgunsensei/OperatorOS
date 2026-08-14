import { Check, Minus, Sparkles } from 'lucide-react';
import type { FeatureRow } from './featureRows';

function Cell({ on }: { on: boolean }) {
  return on ? (
    <Check className="w-4 h-4 text-emerald-400 inline-block" aria-label="Included" />
  ) : (
    <Minus className="w-4 h-4 text-zinc-600 inline-block" aria-label="Not included" />
  );
}

interface FeatureComparisonTableProps {
  rows: FeatureRow[];
  onVisitStore: () => void;
}

export function FeatureComparisonTable({ rows, onVisitStore }: FeatureComparisonTableProps) {
  return (
    <section>
      <h3 className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-cyan-400" />
        Feature comparison
      </h3>
      <div className="overflow-x-auto rounded-lg border border-zinc-800/80 bg-zinc-900/40">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-zinc-800 text-[11px] font-mono uppercase tracking-wider text-zinc-500">
              <th className="text-left px-4 py-3 font-normal">Feature</th>
              <th className="px-4 py-3 font-normal text-zinc-300">Free</th>
              <th className="px-4 py-3 font-normal text-cyan-300">Pro</th>
              <th className="px-4 py-3 font-normal text-amber-300">Bundle</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.key} className={i % 2 === 0 ? 'bg-zinc-900/20' : ''}>
                <td className="px-4 py-3">
                  <div className="text-zinc-200">{row.label}</div>
                  {row.helper && (
                    <div className="text-[11px] text-zinc-500 mt-0.5">{row.helper}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-center"><Cell on={row.free} /></td>
                <td className="px-4 py-3 text-center"><Cell on={row.pro} /></td>
                <td className="px-4 py-3 text-center"><Cell on={row.bundle} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-zinc-600 mt-3 font-mono">
        Looking for à la carte content packs or a single feature upgrade? Browse the{' '}
        <button
          onClick={onVisitStore}
          className="text-cyan-400 hover:text-cyan-300 underline-offset-2 hover:underline"
        >
          store
        </button>{' '}
        for individual SKUs.
      </p>
    </section>
  );
}
