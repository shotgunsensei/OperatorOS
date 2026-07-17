import {
  getCasesByProductId,
  getCaseCountForProduct,
  getCaseCountLabelForProduct,
} from '@/data/caseCatalog';
import { isCaseAccessible } from '@/lib/entitlements';
import { Block } from './helpers';

export function ProductPackContents({ productId }: { productId: string }) {
  const label = getCaseCountLabelForProduct(productId);
  if (!label) return null;
  const { ready, planned, total } = getCaseCountForProduct(productId);
  const cases = getCasesByProductId(productId);
  const isPartial = planned > 0 && ready < total;

  return (
    <Block label={ready > 0 ? 'Pack contents' : 'Pack roadmap'}>
      <p className="text-sm text-zinc-400 mb-2">
        {label}
        {isPartial && (
          <span className="block text-[11px] font-mono text-zinc-500 mt-1">
            Remaining cases drop in as the pack ships.
          </span>
        )}
      </p>
      {cases.length > 0 && (
        <ul className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {cases.map((c) => {
            const playable = c.status === 'playable';
            const owned = isCaseAccessible(c.id);
            return (
              <li key={c.id} className="flex items-start gap-2 text-xs text-zinc-400">
                <span
                  className={`mt-0.5 inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                    playable ? 'bg-cyan-400' : 'bg-purple-400/60'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-zinc-200">{c.title}</span>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600">
                      {c.difficulty} | {c.estimatedMinutes} min
                    </span>
                    {!playable && (
                      <span className="text-[10px] font-mono uppercase tracking-wider text-purple-300/80">
                        In dev
                      </span>
                    )}
                    {playable && owned && (
                      <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400/80">
                        Owned
                      </span>
                    )}
                    {playable && !owned && (
                      <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                        Locked
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-500 line-clamp-2 mt-0.5">
                    {c.shortSummary}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Block>
  );
}
