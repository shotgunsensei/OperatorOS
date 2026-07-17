import { motion } from 'framer-motion';
import { ArrowRight, Wand2 } from 'lucide-react';
import { formatPrice } from '@/data/catalog';
import type { RecommendationReason } from '@/lib/recommendations';

interface NextCaseRecommendationsProps {
  recommendations: RecommendationReason[];
  onOpen: (productId: string, reason: string) => void;
}

export function NextCaseRecommendations({ recommendations, onOpen }: NextCaseRecommendationsProps) {
  if (recommendations.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-3 text-cyan-400">
        <Wand2 size={16} />
        <h2 className="text-sm font-mono uppercase tracking-wider">What to play next</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {recommendations.map((r, idx) => (
          <motion.button
            key={r.product.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + idx * 0.08 }}
            onClick={() => onOpen(r.product.id, r.reason)}
            className="text-left rounded-lg border border-cyan-700/30 bg-gradient-to-br from-cyan-950/30 via-[#111822] to-[#111822] p-4 hover:border-cyan-500/60 transition-colors group"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="text-sm font-semibold text-zinc-100">{r.product.name}</h3>
              <span className="text-cyan-400 font-mono text-xs font-bold shrink-0">
                {r.product.pricingType === 'free'
                  ? 'Free'
                  : r.product.pricingType === 'subscription-monthly'
                    ? `${formatPrice(r.product.priceAmountCents)}/mo`
                    : formatPrice(r.product.priceAmountCents)}
              </span>
            </div>
            <p className="text-xs text-zinc-400 line-clamp-2 mb-2">{r.product.shortDescription}</p>
            <p className="text-[11px] text-cyan-300/90 italic line-clamp-2">{r.reason}</p>
            <div className="mt-3 flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider text-zinc-500 group-hover:text-cyan-300 transition-colors">
              View in store
              <ArrowRight size={12} />
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
