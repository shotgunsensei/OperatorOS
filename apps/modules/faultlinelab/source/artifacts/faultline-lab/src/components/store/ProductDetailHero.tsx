import { Check, Sparkles, Wand2 } from 'lucide-react';
import {
  CATALOG,
  formatPrice,
  type CatalogProduct,
} from '@/data/catalog';
import { getBetterValueBundle, hasEntitlement } from '@/lib/entitlements';
import { ProductTag } from './ProductTag';
import { Block } from './helpers';

export function ProductDetailHero({
  product,
  reason,
  onClose,
}: {
  product: CatalogProduct;
  reason?: string;
  onClose: () => void;
}) {
  const includedItems = (product.bundledProductIds || [])
    .map((id) => CATALOG.find((p) => p.id === id))
    .filter((p): p is CatalogProduct => !!p);

  const related = (product.relatedProductIds || [])
    .map((id) => CATALOG.find((p) => p.id === id))
    .filter((p): p is CatalogProduct => !!p);

  const bundle = getBetterValueBundle(product.id);

  return (
    <>
      <div className="flex items-start justify-between mb-3 gap-2">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h2 className="text-xl font-bold text-zinc-100">{product.name}</h2>
            {product.tags.map((tag) => (
              <ProductTag key={tag} tag={tag} />
            ))}
          </div>
          <p className="text-sm text-zinc-400 capitalize">
            {product.category.replace('-', ' ')}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 text-xl leading-none p-2 -m-2"
        >
          &times;
        </button>
      </div>

      {reason && (
        <div className="mb-4 rounded-lg border border-cyan-700/40 bg-cyan-950/20 p-3 flex items-start gap-2">
          <Wand2 className="w-3.5 h-3.5 text-cyan-300 mt-0.5 shrink-0" />
          <p className="text-xs text-cyan-200 leading-relaxed">{reason}</p>
        </div>
      )}

      <p className="text-zinc-300 text-sm leading-relaxed mb-3">{product.longDescription}</p>
      {product.valueProposition && (
        <p className="text-xs text-cyan-300/90 italic border-l-2 border-cyan-500/40 pl-3 mb-5">
          {product.valueProposition}
        </p>
      )}

      {product.includedFeatures && product.includedFeatures.length > 0 && (
        <Block label="Included features">
          <div className="space-y-1.5">
            {product.includedFeatures.map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm text-zinc-300">
                <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="capitalize">{f.replace(/-/g, ' ')}</span>
              </div>
            ))}
          </div>
        </Block>
      )}

      {includedItems.length > 0 && (
        <Block label="Bundle contents">
          <div className="space-y-1.5">
            {includedItems.map((b) => (
              <div key={b.id} className="flex items-center justify-between text-sm text-zinc-300">
                <span className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  {b.name}
                </span>
                <span className="text-[11px] font-mono text-zinc-500">
                  {b.pricingType === 'subscription-monthly'
                    ? `${formatPrice(b.priceAmountCents)}/mo`
                    : formatPrice(b.priceAmountCents)}
                </span>
              </div>
            ))}
          </div>
        </Block>
      )}

      {bundle && bundle.id !== product.id && !hasEntitlement(bundle.id) && (
        <Block label="Better value">
          <div className="rounded-lg border border-purple-700/40 bg-purple-950/20 p-3 text-xs text-zinc-300 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-purple-300 shrink-0" />
            <span>
              <span className="font-semibold text-zinc-100">{bundle.name}</span> includes this and
              more for <span className="font-mono text-purple-300">{formatPrice(bundle.priceAmountCents)}</span>.
            </span>
          </div>
        </Block>
      )}

      {related.length > 0 && (
        <Block label="Related products">
          <div className="grid gap-2">
            {related.slice(0, 3).map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between text-xs text-zinc-400 border border-zinc-800/60 rounded-lg px-3 py-2"
              >
                <span className="truncate">{r.name}</span>
                <span className="text-zinc-500 font-mono shrink-0">
                  {hasEntitlement(r.id)
                    ? 'Owned'
                    : r.pricingType === 'free'
                      ? 'Free'
                      : formatPrice(r.priceAmountCents)}
                </span>
              </div>
            ))}
          </div>
        </Block>
      )}
    </>
  );
}
