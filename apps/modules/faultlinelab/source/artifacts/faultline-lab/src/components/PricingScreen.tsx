import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import {
  CATALOG,
  formatPrice,
  type CatalogProduct,
} from '@/data/catalog';
import {
  hasEntitlement,
  getEntitlements,
  subscribeEntitlements,
} from '@/lib/entitlements';
import EcosystemFooter from './EcosystemFooter';
import ManagedByOperatorOS from './ManagedByOperatorOS';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { buildFeatureRows } from './pricing/featureRows';
import { TierCard } from './pricing/TierCard';
import { FeatureComparisonTable } from './pricing/FeatureComparisonTable';

function useEntitlementsTick() {
  return useSyncExternalStore(
    (cb) => subscribeEntitlements(cb),
    () => getEntitlements(),
  );
}

export default function PricingScreen() {
  const setView = useAppStore((s) => s.setView);
  const openStoreWithProduct = useAppStore((s) => s.openStoreWithProduct);
  const pricingIntroActive = useAppStore((s) => s.pricingIntroActive);
  const setPricingIntroActive = useAppStore((s) => s.setPricingIntroActive);
  const managedByOperatorOs = useAppStore((s) => s.managedByOperatorOs);
  useEntitlementsTick();
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('month');

  useEffect(() => {
    return () => {
      if (useAppStore.getState().pricingIntroActive) {
        useAppStore.getState().setPricingIntroActive(false);
      }
    };
  }, []);

  const proProduct = CATALOG.find((p) => p.id === 'pro-subscription') as CatalogProduct;
  const bundleProduct = CATALOG.find((p) => p.id === 'bundle-master-investigator') as CatalogProduct;
  const isProOwned = hasEntitlement('pro-subscription');
  const isBundleOwned = hasEntitlement('bundle-master-investigator');
  const bundleAvailable = bundleProduct?.status === 'available';

  const featureRows = useMemo(() => buildFeatureRows(), []);

  const proPriceLabel =
    billingInterval === 'year' && proProduct.yearlyPriceAmountCents
      ? `${formatPrice(proProduct.yearlyPriceAmountCents)}/yr`
      : `${formatPrice(proProduct.priceAmountCents)}/mo`;

  const proPerMonthEquivalent =
    billingInterval === 'year' && proProduct.yearlyPriceAmountCents
      ? `≈ ${formatPrice(Math.round(proProduct.yearlyPriceAmountCents / 12))}/mo billed yearly`
      : 'Billed monthly. Cancel anytime.';

  const onChooseFree = () => setView('incident-board');
  const onChoosePro = () =>
    openStoreWithProduct('pro-subscription', 'pricing-page', billingInterval);
  const onChooseBundle = () =>
    openStoreWithProduct('bundle-master-investigator', 'pricing-page');

  if (managedByOperatorOs) {
    return <ManagedByOperatorOS variant="pricing" />;
  }

  return (
    <div className="min-h-screen bg-[#0a0e14] text-zinc-100">
      <header className="border-b border-zinc-800/60 bg-zinc-900/50 sticky top-0 z-40 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
          <button
            onClick={() => setView('incident-board')}
            className="text-zinc-400 hover:text-cyan-400 transition-colors p-1"
            aria-label="Back to Incident Board"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold font-mono tracking-wide text-cyan-400">PRICING</h1>
            <p className="text-xs text-zinc-500">Compare tiers side-by-side</p>
          </div>
          <button
            onClick={() => setView('store')}
            className="text-xs font-mono uppercase tracking-wider text-zinc-400 hover:text-cyan-300 transition-colors px-3 py-1.5 rounded border border-zinc-700 hover:border-cyan-500/40"
          >
            Browse store ›
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-10 pb-24">
        {pricingIntroActive && (
          <section
            role="status"
            aria-live="polite"
            className="max-w-3xl mx-auto rounded-lg border border-cyan-500/40 bg-gradient-to-r from-cyan-950/40 via-zinc-900/40 to-zinc-900/20 px-4 py-4 sm:px-5 sm:py-4 flex items-start gap-3"
          >
            <Sparkles className="w-5 h-5 text-cyan-300 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-mono text-sm text-cyan-200 uppercase tracking-wider">
                Welcome to Faultline Lab
              </div>
              <p className="text-sm text-zinc-300 mt-1 leading-relaxed">
                Pick the plan that fits your investigation cadence — or continue free
                with the four hand-crafted starter cases. You can upgrade any time.
              </p>
            </div>
            <button
              onClick={() => setPricingIntroActive(false)}
              className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 hover:text-cyan-300 transition-colors px-2 py-1 rounded border border-zinc-700 hover:border-cyan-500/40 shrink-0"
              aria-label="Dismiss welcome banner"
            >
              Dismiss
            </button>
          </section>
        )}
        <section className="text-center space-y-3 max-w-2xl mx-auto">
          <h2 className="font-mono text-2xl sm:text-3xl text-zinc-100 tracking-tight">
            Pick the tier that fits your investigation cadence.
          </h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Faultline Lab is free to start. Upgrade when you want every case unlocked,
            cross-device sync, or every premium tool in one shot.
          </p>
          <div className="inline-flex items-center gap-1 p-1 rounded-md bg-zinc-900/60 border border-zinc-800">
            <button
              onClick={() => setBillingInterval('month')}
              className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider rounded transition-colors ${
                billingInterval === 'month'
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
                  : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
              }`}
              aria-pressed={billingInterval === 'month'}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingInterval('year')}
              className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider rounded transition-colors flex items-center gap-2 ${
                billingInterval === 'year'
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
                  : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
              }`}
              aria-pressed={billingInterval === 'year'}
            >
              Yearly
              <span className="text-[10px] text-emerald-400">save ~27%</span>
            </button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <TierCard
            tier="free"
            title="Free"
            price="$0"
            cadence="Forever"
            tagline="Get the rhythm with 4 starter cases and the standard toolkit."
            cta="Continue free"
            disabled={false}
            onClick={onChooseFree}
            highlight={false}
            ownedLabel={null}
          />
          <TierCard
            tier="pro"
            title={proProduct.name}
            price={proPriceLabel}
            cadence={proPerMonthEquivalent}
            tagline={proProduct.shortDescription}
            cta={isProOwned ? 'Active' : 'Subscribe'}
            disabled={isProOwned}
            onClick={onChoosePro}
            highlight
            ownedLabel={isProOwned ? 'You are here' : null}
          />
          <TierCard
            tier="bundle"
            title={bundleProduct.name}
            price={formatPrice(bundleProduct.priceAmountCents)}
            cadence="One-time, lifetime access to everything"
            tagline={bundleProduct.shortDescription}
            cta={
              isBundleOwned
                ? 'Owned'
                : bundleAvailable
                  ? 'Get bundle'
                  : 'Coming soon'
            }
            disabled={isBundleOwned || !bundleAvailable}
            onClick={onChooseBundle}
            highlight={false}
            ownedLabel={isBundleOwned ? 'You are here' : null}
          />
        </section>

        <FeatureComparisonTable rows={featureRows} onVisitStore={() => setView('store')} />
      </main>

      <EcosystemFooter />
    </div>
  );
}
