import { useEffect, useState, useSyncExternalStore } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import {
  CATALOG,
  formatPrice,
  getProductsBySection,
  type CatalogProduct,
} from '@/data/catalog';
import {
  hasEntitlement,
  getOwnedProducts,
  subscribeEntitlements,
  getEntitlements,
} from '@/lib/entitlements';
import { recommendProducts } from '@/lib/recommendations';
import EcosystemFooter from './EcosystemFooter';
import ManagedByOperatorOS from './ManagedByOperatorOS';
import {
  ArrowLeft,
  Crown,
  Package,
  Zap,
  Star,
  Stethoscope,
  Wand2,
  ShieldCheck,
} from 'lucide-react';
import { ProductCard } from './store/ProductCard';
import { ProductDetail } from './store/ProductDetail';
import { SectionHeader, categoryIcon } from './store/helpers';

function useEntitlementsTick() {
  return useSyncExternalStore(
    (cb) => subscribeEntitlements(cb),
    () => getEntitlements()
  );
}

export default function StoreScreen() {
  const setView = useAppStore((s) => s.setView);
  const profile = useAppStore((s) => s.profile);
  const toolUsageSignals = useAppStore((s) => s.toolUsageSignals);
  const managedByOperatorOs = useAppStore((s) => s.managedByOperatorOs);
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);
  const [selectedReason, setSelectedReason] = useState<string | undefined>(undefined);
  const [selectedInterval, setSelectedInterval] = useState<'month' | 'year' | undefined>(undefined);
  const consumePendingStoreProduct = useAppStore((s) => s.consumePendingStoreProduct);
  const pendingStoreProduct = useAppStore((s) => s.pendingStoreProduct);
  useEntitlementsTick();

  useEffect(() => {
    if (!pendingStoreProduct) return;
    const pending = consumePendingStoreProduct();
    if (!pending) return;
    const product = CATALOG.find((p) => p.id === pending.productId);
    if (product) {
      setSelectedProduct(product);
      setSelectedReason(pending.reason);
      setSelectedInterval(pending.billingInterval);
    }
  }, [pendingStoreProduct, consumePendingStoreProduct]);

  const openProduct = (p: CatalogProduct) => {
    setSelectedProduct(p);
    setSelectedReason(undefined);
    setSelectedInterval(undefined);
  };
  const closeProduct = () => {
    setSelectedProduct(null);
    setSelectedReason(undefined);
    setSelectedInterval(undefined);
  };

  const featured = CATALOG.filter((p) => p.featured && p.status !== 'disabled');
  const plans = getProductsBySection('plan');
  const packs = getProductsBySection('content-pack');
  const upgrades = getProductsBySection('feature-upgrade');
  const bundles = getProductsBySection('bundle');
  const specialty = getProductsBySection('specialty');
  const owned = getOwnedProducts().filter((p) => p.id !== 'base-free');
  const recs = recommendProducts(profile, toolUsageSignals, 4);

  if (managedByOperatorOs) {
    return <ManagedByOperatorOS variant="store" />;
  }

  return (
    <div className="min-h-screen bg-[#0a0e14] text-zinc-100">
      <header className="border-b border-zinc-800/60 bg-zinc-900/50 sticky top-0 z-40 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4">
          <button
            onClick={() => setView('incident-board')}
            className="text-zinc-400 hover:text-cyan-400 transition-colors p-1"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold font-mono tracking-wide text-cyan-400">STORE</h1>
            <p className="text-xs text-zinc-500">Expand your investigation toolkit</p>
          </div>
          <button
            onClick={() => setView('pricing')}
            className="text-xs font-mono uppercase tracking-wider text-zinc-400 hover:text-cyan-300 transition-colors px-3 py-1.5 rounded border border-zinc-700 hover:border-cyan-500/40"
          >
            Compare plans
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-10 pb-24">
        {featured.length > 0 && (
          <section className="grid gap-4 md:grid-cols-2">
            {featured.map((p) => {
              const isOwned = hasEntitlement(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => openProduct(p)}
                  className="text-left rounded-2xl border border-cyan-700/30 bg-gradient-to-br from-cyan-950/40 via-zinc-900/60 to-zinc-900/30 p-6 hover:border-cyan-500/50 transition-colors group"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                      {categoryIcon(p.category)}
                    </div>
                    <div className="text-[11px] font-mono uppercase tracking-wider text-cyan-300/80">
                      Featured
                    </div>
                  </div>
                  <h2 className="text-lg font-bold text-zinc-100 mb-1">{p.name}</h2>
                  <p className="text-sm text-zinc-400 line-clamp-2 mb-4">{p.shortDescription}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-cyan-400 font-mono font-bold">
                      {p.pricingType === 'subscription-monthly'
                        ? `${formatPrice(p.priceAmountCents)}/mo`
                        : formatPrice(p.priceAmountCents)}
                    </span>
                    <span className="text-xs font-mono uppercase tracking-wider text-zinc-500 group-hover:text-cyan-300 transition-colors">
                      {isOwned ? 'Owned' : 'View ›'}
                    </span>
                  </div>
                </button>
              );
            })}
          </section>
        )}

        {recs.length > 0 && (
          <section>
            <SectionHeader
              icon={<Wand2 className="w-4 h-4 text-cyan-400" />}
              label="Recommended for you"
              helper="Based on your activity"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {recs.map((r) => (
                <ProductCard
                  key={r.product.id}
                  product={r.product}
                  onSelect={openProduct}
                  reason={r.reason}
                />
              ))}
            </div>
          </section>
        )}

        {owned.length > 0 && (
          <section>
            <SectionHeader
              icon={<ShieldCheck className="w-4 h-4 text-emerald-400" />}
              label="Your library"
              helper={`${owned.length} owned`}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {owned.map((p) => (
                <ProductCard key={p.id} product={p} onSelect={openProduct} />
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionHeader icon={<Crown className="w-4 h-4 text-amber-400" />} label="Subscription plans" />
          <div className="grid gap-3">
            {plans.map((p) => (
              <ProductCard key={p.id} product={p} onSelect={openProduct} />
            ))}
          </div>
        </section>

        <section>
          <SectionHeader
            icon={<Package className="w-4 h-4 text-emerald-400" />}
            label="Content packs"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {packs.map((p) => (
              <ProductCard key={p.id} product={p} onSelect={openProduct} />
            ))}
          </div>
        </section>

        <section>
          <SectionHeader icon={<Zap className="w-4 h-4 text-violet-400" />} label="Feature upgrades" />
          <div className="grid gap-3 sm:grid-cols-2">
            {upgrades.map((p) => (
              <ProductCard key={p.id} product={p} onSelect={openProduct} />
            ))}
          </div>
        </section>

        {bundles.length > 0 && (
          <section>
            <SectionHeader icon={<Star className="w-4 h-4 text-purple-400" />} label="Bundles" />
            <div className="grid gap-3">
              {bundles.map((p) => (
                <ProductCard key={p.id} product={p} onSelect={openProduct} />
              ))}
            </div>
          </section>
        )}

        {specialty.length > 0 && (
          <section>
            <SectionHeader
              icon={<Stethoscope className="w-4 h-4 text-sky-400" />}
              label="Specialty"
              helper="Targeted vertical bundles"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {specialty.map((p) => (
                <ProductCard key={p.id} product={p} onSelect={openProduct} />
              ))}
            </div>
          </section>
        )}
      </main>

      {selectedProduct && (
        <ProductDetail
          product={selectedProduct}
          onClose={closeProduct}
          onPurchased={closeProduct}
          reason={selectedReason}
          initialBillingInterval={selectedInterval}
        />
      )}

      <EcosystemFooter />
    </div>
  );
}
