import { useState } from 'react';
import { Check, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/useAppStore';
import { formatPrice, type CatalogProduct } from '@/data/catalog';
import {
  addOwnedProduct,
  getProductOwnershipStatus,
} from '@/lib/entitlements';
import { startStripeCheckout } from '@/lib/api';

interface ProductPurchaseCtaProps {
  product: CatalogProduct;
  initialBillingInterval?: 'month' | 'year';
  onPurchased: () => void;
  onClose: () => void;
}

export function ProductPurchaseCta({
  product,
  initialBillingInterval,
  onPurchased,
  onClose,
}: ProductPurchaseCtaProps) {
  const status = getProductOwnershipStatus(product.id);
  const isOwned = status === 'owned';
  const isComingSoon = status === 'coming-soon';
  const isDisabled = status === 'disabled';
  const isSignedIn = useAppStore((s) => s.isSignedIn);
  const setView = useAppStore((s) => s.setView);
  const [purchasing, setPurchasing] = useState(false);
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>(
    initialBillingInterval ?? 'month',
  );

  const handlePurchase = async () => {
    if (isDisabled || isComingSoon || isOwned) return;
    if (!isSignedIn && import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) {
      onClose();
      setView('auth');
      return;
    }

    setPurchasing(true);

    if (product.pricingType === 'free') {
      addOwnedProduct(product.id);
      setPurchasing(false);
      toast.success(`${product.name} unlocked`, {
        description: 'You now have access to the included content.',
      });
      onPurchased();
      onClose();
      return;
    }

    try {
      const interval =
        product.pricingType === 'subscription-monthly' && billingInterval === 'year'
          ? 'year'
          : product.pricingType.startsWith('subscription')
            ? 'month'
            : undefined;
      const { url } = await startStripeCheckout(product.id, interval);
      if (url) {
        window.location.href = url;
        return;
      }
      throw new Error('No checkout URL returned');
    } catch (err) {
      // Mock-grant only when explicitly opted in (VITE_MOCK_BILLING=1) AND in a
      // dev build. This prevents accidental local grants when Stripe is
      // genuinely configured but a transient checkout error occurs, and ensures
      // production builds never short-circuit billing.
      const mockBillingEnabled =
        import.meta.env.DEV && import.meta.env.VITE_MOCK_BILLING === '1';
      if (mockBillingEnabled) {
        addOwnedProduct(product.id);
        toast.success(`${product.name} unlocked (mock billing)`, {
          description:
            'VITE_MOCK_BILLING=1 — granted locally without contacting Stripe.',
        });
        onPurchased();
        onClose();
      } else {
        toast.error('Checkout unavailable', {
          description:
            err instanceof Error && err.message
              ? err.message
              : 'This product is not available for purchase right now.',
        });
      }
    } finally {
      setPurchasing(false);
    }
  };

  let ctaText = 'Purchase';
  let priceLabel = formatPrice(product.priceAmountCents);
  if (product.pricingType === 'free') ctaText = 'Get started free';
  else if (product.pricingType.startsWith('subscription')) {
    const usingYearly = billingInterval === 'year' && product.yearlyPriceAmountCents;
    priceLabel = usingYearly
      ? `${formatPrice(product.yearlyPriceAmountCents!)}/yr`
      : `${formatPrice(product.priceAmountCents)}/mo`;
    ctaText = `Subscribe — ${priceLabel}`;
  } else {
    ctaText = `Purchase — ${formatPrice(product.priceAmountCents)}`;
  }

  return (
    <div className="border-t border-zinc-800 pt-4 mt-4">
      {isOwned ? (
        <div className="flex items-center gap-2 text-cyan-400 font-mono text-sm justify-center py-2">
          <Check className="w-5 h-5" />
          You own this
        </div>
      ) : isDisabled ? (
        <div className="text-center py-2">
          <p className="text-zinc-400 font-mono text-sm">Unavailable</p>
          <p className="text-zinc-600 text-xs mt-1">
            This product is not currently available for purchase.
          </p>
        </div>
      ) : isComingSoon ? (
        <div className="text-center py-2">
          <p className="text-zinc-400 font-mono text-sm">Coming soon</p>
          <p className="text-zinc-600 text-xs mt-1">This content is in development</p>
        </div>
      ) : (
        <>
          {product.pricingType === 'subscription-monthly' && product.yearlyPriceAmountCents && (
            <div className="flex items-center justify-center gap-2 mb-3">
              {(['month', 'year'] as const).map((interval) => (
                <button
                  key={interval}
                  onClick={() => setBillingInterval(interval)}
                  className={`px-3 py-1.5 rounded-full text-xs font-mono uppercase tracking-wider transition-colors ${
                    billingInterval === interval
                      ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                      : 'bg-zinc-800/60 text-zinc-400 border border-zinc-700/60'
                  }`}
                >
                  {interval === 'month' ? 'Monthly' : 'Annual (save)'}
                </button>
              ))}
            </div>
          )}
          {!isSignedIn && import.meta.env.VITE_CLERK_PUBLISHABLE_KEY && (
            <p className="text-xs text-zinc-500 text-center mb-3">Sign in to purchase</p>
          )}
          <button
            onClick={handlePurchase}
            disabled={purchasing}
            className="w-full py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-800 disabled:cursor-wait text-white font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {purchasing ? (
              <span className="animate-pulse">Processing...</span>
            ) : (
              <>
                <ShoppingCart className="w-4 h-4" />
                {!isSignedIn && import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
                  ? 'Sign in to purchase'
                  : ctaText}
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
}
