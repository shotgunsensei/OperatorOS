import { Check } from 'lucide-react';
import { formatPrice, type CatalogProduct } from '@/data/catalog';
import { getProductOwnershipStatus } from '@/lib/entitlements';
import { ProductTag } from './ProductTag';
import { categoryIcon, ctaLabel } from './helpers';

export function ProductCard({
  product,
  onSelect,
  reason,
}: {
  product: CatalogProduct;
  onSelect: (p: CatalogProduct) => void;
  reason?: string;
}) {
  const status = getProductOwnershipStatus(product.id);
  const isOwned = status === 'owned';
  const isComingSoon = status === 'coming-soon';
  const isDisabled = status === 'disabled';

  return (
    <button
      onClick={() => onSelect(product)}
      className={`w-full text-left rounded-xl border transition-all duration-200 overflow-hidden group
        ${
          isOwned
            ? 'bg-cyan-950/20 border-cyan-800/40 hover:border-cyan-600/60'
            : isDisabled
              ? 'bg-zinc-900/40 border-zinc-800/40 opacity-60'
              : isComingSoon
                ? 'bg-zinc-900/50 border-zinc-800/40 hover:border-zinc-700/60 opacity-80'
                : 'bg-zinc-900/80 border-zinc-800/60 hover:border-cyan-600/60 hover:bg-zinc-900'
        }`}
    >
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`p-2 rounded-lg shrink-0 ${
                isOwned ? 'bg-cyan-500/10 text-cyan-400' : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              {categoryIcon(product.category)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-zinc-100 text-sm sm:text-base truncate">
                  {product.name}
                </h3>
                {product.tags.map((tag) => (
                  <ProductTag key={tag} tag={tag} />
                ))}
              </div>
              <p className="text-xs sm:text-sm text-zinc-400 mt-1 line-clamp-2">
                {product.shortDescription}
              </p>
              {reason && (
                <p className="text-[11px] text-cyan-300/80 mt-1.5 italic line-clamp-2">{reason}</p>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right">
            {isOwned ? (
              <span className="flex items-center gap-1 text-cyan-400 text-xs font-mono">
                <Check className="w-4 h-4" />
                Owned
              </span>
            ) : isDisabled ? (
              <span className="text-zinc-500 text-xs font-mono">Unavailable</span>
            ) : isComingSoon ? (
              <span className="text-zinc-500 text-xs font-mono">Coming soon</span>
            ) : (
              <span className="text-cyan-400 font-mono font-bold text-sm">
                {product.pricingType === 'free' ? 'Free' : formatPrice(product.priceAmountCents)}
              </span>
            )}
          </div>
        </div>
        {product.pricingType === 'subscription-monthly' && !isOwned && !isComingSoon && !isDisabled && (
          <div className="mt-2 text-[11px] text-zinc-500 font-mono">
            {formatPrice(product.priceAmountCents)}/mo or{' '}
            {formatPrice(product.yearlyPriceAmountCents || 0)}/yr
          </div>
        )}
        <div className="mt-3 text-[11px] font-mono uppercase tracking-wider text-zinc-500 group-hover:text-cyan-400 transition-colors">
          {ctaLabel(product, isOwned, isComingSoon, isDisabled)}{' '}
          {!isOwned && !isComingSoon && !isDisabled && <span aria-hidden>›</span>}
        </div>
      </div>
    </button>
  );
}
