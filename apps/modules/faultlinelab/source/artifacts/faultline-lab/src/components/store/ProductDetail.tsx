import type { CatalogProduct } from '@/data/catalog';
import { ProductDetailHero } from './ProductDetailHero';
import { ProductPackContents } from './ProductPackContents';
import { ProductPurchaseCta } from './ProductPurchaseCta';

export function ProductDetail({
  product,
  onClose,
  onPurchased,
  reason,
  initialBillingInterval,
}: {
  product: CatalogProduct;
  onClose: () => void;
  onPurchased: () => void;
  reason?: string;
  initialBillingInterval?: 'month' | 'year';
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <ProductDetailHero product={product} reason={reason} onClose={onClose} />
          <ProductPackContents productId={product.id} />
          <ProductPurchaseCta
            product={product}
            initialBillingInterval={initialBillingInterval}
            onPurchased={onPurchased}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  );
}
