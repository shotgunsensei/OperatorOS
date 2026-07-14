import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CATALOG, formatPrice, type CatalogProduct } from '@/data/catalog';
import { getBetterValueBundle, hasEntitlement } from '@/lib/entitlements';
import { useAppStore } from '@/stores/useAppStore';
import { Lock, Sparkles, X, ShoppingCart, ArrowRight } from 'lucide-react';

export interface UpgradePromptOptions {
  productId: string;
  reason: string;
  contextKey: string; // dedupe key per session
}

interface UpgradePromptContextValue {
  prompt: (opts: UpgradePromptOptions) => void;
}

const UpgradePromptContext = createContext<UpgradePromptContextValue | null>(null);

export function useUpgradePrompt() {
  const ctx = useContext(UpgradePromptContext);
  if (!ctx) {
    return { prompt: () => {} };
  }
  return ctx;
}

interface ActivePrompt {
  product: CatalogProduct;
  reason: string;
}

export function UpgradePromptProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActivePrompt | null>(null);
  const [shownKeys] = useState(() => new Set<string>());
  const setView = useAppStore((s) => s.setView);

  const prompt = useCallback(
    (opts: UpgradePromptOptions) => {
      if (shownKeys.has(opts.contextKey)) return;
      if (hasEntitlement(opts.productId)) return;
      const product = CATALOG.find((p) => p.id === opts.productId);
      if (!product) return;
      shownKeys.add(opts.contextKey);
      setActive({ product, reason: opts.reason });
    },
    [shownKeys]
  );

  const close = () => setActive(null);

  const goToStore = () => {
    setView('store');
    close();
  };

  const bundle = active ? getBetterValueBundle(active.product.id) : null;

  return (
    <UpgradePromptContext.Provider value={{ prompt }}>
      {children}
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/70 flex items-end sm:items-center justify-center p-4"
            onClick={close}
          >
            <motion.div
              initial={{ y: 30, scale: 0.97, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 30, scale: 0.97, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-zinc-900 border border-cyan-800/40 rounded-2xl overflow-hidden shadow-2xl"
            >
              <div className="p-5 border-b border-zinc-800/60 flex items-start justify-between gap-3 bg-gradient-to-br from-cyan-950/40 to-zinc-900">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-mono uppercase tracking-wider text-cyan-400/80">Locked content</p>
                    <h3 className="text-base font-semibold text-zinc-100">{active.product.name}</h3>
                  </div>
                </div>
                <button onClick={close} className="text-zinc-500 hover:text-zinc-300 p-1 -m-1">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <p className="text-sm text-zinc-300 leading-relaxed">{active.reason}</p>
                {active.product.valueProposition && (
                  <p className="text-xs text-zinc-400 leading-relaxed border-l-2 border-cyan-500/40 pl-3 italic">
                    {active.product.valueProposition}
                  </p>
                )}

                <div className="flex items-baseline justify-between border-t border-zinc-800/60 pt-3">
                  <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Price</span>
                  <span className="text-cyan-400 font-mono font-bold text-lg">
                    {active.product.pricingType === 'subscription-monthly'
                      ? `${formatPrice(active.product.priceAmountCents)}/mo`
                      : formatPrice(active.product.priceAmountCents)}
                  </span>
                </div>

                {bundle && bundle.id !== active.product.id && (
                  <div className="rounded-lg border border-purple-700/40 bg-purple-950/20 p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles className="w-3.5 h-3.5 text-purple-300" />
                      <span className="text-[11px] font-mono uppercase tracking-wider text-purple-300">Better value</span>
                    </div>
                    <p className="text-xs text-zinc-300">
                      <span className="font-semibold">{bundle.name}</span> includes this and more for{' '}
                      <span className="text-purple-300 font-mono">{formatPrice(bundle.priceAmountCents)}</span>.
                    </p>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={close}
                    className="flex-1 py-2.5 rounded-lg bg-zinc-800/70 text-zinc-300 hover:bg-zinc-800 text-sm font-medium transition-colors"
                  >
                    Maybe later
                  </button>
                  <button
                    onClick={goToStore}
                    className="flex-1 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    View in store
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </UpgradePromptContext.Provider>
  );
}
